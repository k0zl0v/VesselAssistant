import { BaseDirectory } from '@tauri-apps/api/path';
import type { SqlValue } from '../../src/services/db';
import type { NodeDb } from '../../src/services/db-node';
import { openTestDb } from '../../src/services/__tests__/helpers';
import type { BridgeReply, WireValue } from './init-script';

type Args = Record<string, unknown>;

interface FsOptions {
  baseDir?: number;
  recursive?: boolean;
}

/** In-memory file system keyed by resolved path (`$AppData/backups/x.json` or an absolute path). */
export class MemoryFs {
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>();

  static resolve(path: string, options?: FsOptions | null): string {
    if (options?.baseDir === undefined || options.baseDir === null) return path;
    const base = BaseDirectory[options.baseDir];
    if (base === undefined) throw new Error(`bridge: fs: unknown baseDir ${options.baseDir}`);
    return `$${base}/${path}`;
  }

  readText(resolved: string): string | undefined {
    const bytes = this.files.get(resolved);
    return bytes && new TextDecoder().decode(bytes);
  }

  writeText(resolved: string, text: string): void {
    this.files.set(resolved, new TextEncoder().encode(text));
  }
}

export type DialogKind = 'save' | 'open' | 'message';

/** Scripted answers for `plugin-dialog`; an unscripted dialog fails the call instead of guessing. */
export class DialogScript {
  private readonly queue: { kind: DialogKind; answer: string | null }[] = [];
  readonly shown: { kind: DialogKind; args: Args }[] = [];

  /** `save`/`open` answer with a path (or null = cancelled); `message` with the button label, e.g. `Ok` / `Cancel`. */
  enqueue(kind: DialogKind, answer: string | null): void {
    this.queue.push({ kind, answer });
  }

  take(kind: DialogKind, args: Args): string | null {
    this.shown.push({ kind, args });
    const next = this.queue[0];
    if (!next || next.kind !== kind) throw new Error(`bridge: unscripted dialog ${kind}`);
    this.queue.shift();
    return next.answer;
  }
}

export interface LogEntry {
  level: number;
  message: string;
}

function isBytes(v: unknown): v is { __bytes: number[] } {
  return typeof v === 'object' && v !== null && Array.isArray((v as { __bytes?: unknown }).__bytes);
}

/** `tauri-plugin-sql` binds numbers as f64, strings as TEXT and any other JSON value as JSON text. */
function pluginSqlBind(values: unknown[]): SqlValue[] {
  return values.map((v) => (v === null || typeof v === 'string' || typeof v === 'number' ? v : JSON.stringify(v)));
}

/** `src-tauri/src/batch.rs` binds booleans as 0/1. */
function batchBind(values: unknown[]): SqlValue[] {
  return values.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqlValue)));
}

/**
 * Node-side answerer for the IPC commands the app issues. Mirrors the reply shapes of the
 * real Rust handlers; `e2e/tauri-bridge/__tests__/bridge-contract.test.ts` checks them against
 * the real client code from `node_modules`.
 */
export class TauriBridgeHost {
  readonly fs = new MemoryFs();
  readonly dialogs = new DialogScript();
  /** Paths passed to the opener's reveal-in-folder, in call order. */
  readonly revealed: string[] = [];
  readonly logs: LogEntry[] = [];
  readonly calls: string[] = [];
  readonly unhandled: string[] = [];
  private readonly loaded = new Set<string>();

  constructor(readonly db: NodeDb) {}

  /** Fresh in-memory DB with every production migration applied and no operator session. */
  static async create(): Promise<TauriBridgeHost> {
    return new TauriBridgeHost(await openTestDb({ session: null }));
  }

  async dispatch(cmd: string, args: WireValue, options: WireValue): Promise<BridgeReply> {
    this.calls.push(cmd);
    try {
      return { ok: true, value: await this.handle(cmd, args, options) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : e };
    }
  }

  async handle(cmd: string, rawArgs: WireValue, rawOptions: WireValue): Promise<unknown> {
    const args = (rawArgs ?? {}) as Args;
    switch (cmd) {
      case 'plugin:sql|load':
        this.loaded.add(args.db as string);
        return args.db;
      case 'plugin:sql|execute': {
        this.requireLoaded(args.db);
        const { changes, lastInsertRowid } = this.db.runWithInfo(
          args.query as string,
          pluginSqlBind((args.values as unknown[]) ?? []),
        );
        return [changes, Number(lastInsertRowid)];
      }
      case 'plugin:sql|select':
        this.requireLoaded(args.db);
        return this.db.select(args.query as string, pluginSqlBind((args.values as unknown[]) ?? []));
      case 'plugin:sql|close':
        if (typeof args.db === 'string') this.loaded.delete(args.db);
        else this.loaded.clear();
        return true;
      case 'execute_batch':
        return this.executeBatch(args);

      case 'plugin:dialog|save':
        return this.dialogs.take('save', args);
      case 'plugin:dialog|open':
        return this.dialogs.take('open', args);
      case 'plugin:dialog|message':
        return this.dialogs.take('message', args);
      case 'plugin:opener|reveal_item_in_dir':
        this.revealed.push(String((args as { paths?: string[]; path?: string }).paths?.[0] ?? (args as { path?: string }).path));
        return null;

      case 'plugin:fs|write_text_file':
      case 'plugin:fs|write_file':
        return this.writeFromHeaders(rawArgs, rawOptions);
      case 'plugin:fs|read_text_file':
      case 'plugin:fs|read_file': {
        const path = this.resolve(args);
        const bytes = this.fs.files.get(path);
        if (!bytes) throw new Error(`bridge: fs: no such file ${path}`);
        return Array.from(bytes);
      }
      case 'plugin:fs|mkdir':
        return this.mkdir(args);
      case 'plugin:fs|read_dir':
        return this.readDir(args);
      case 'plugin:fs|remove': {
        const path = this.resolve(args);
        if (!this.fs.files.delete(path) && !this.fs.dirs.delete(path)) {
          throw new Error(`bridge: fs: no such file ${path}`);
        }
        return null;
      }
      case 'plugin:fs|exists': {
        const path = this.resolve(args);
        return this.fs.files.has(path) || this.fs.dirs.has(path);
      }

      case 'plugin:log|log':
        this.logs.push({ level: args.level as number, message: args.message as string });
        return null;

      default:
        this.unhandled.push(cmd);
        throw new Error(`bridge: unhandled ${cmd}`);
    }
  }

  private requireLoaded(db: unknown): void {
    if (typeof db !== 'string' || !this.loaded.has(db)) throw new Error(`database ${String(db)} is not loaded`);
  }

  private resolve(args: Args): string {
    return MemoryFs.resolve(args.path as string, args.options as FsOptions | null);
  }

  private writeFromHeaders(rawArgs: WireValue, rawOptions: WireValue): null {
    const headers = (rawOptions as { headers?: { path?: string; options?: string } } | null)?.headers;
    if (!headers?.path) throw new Error('bridge: fs: write without a path header');
    if (!isBytes(rawArgs)) throw new Error('bridge: fs: write body is not bytes');
    const opts = headers.options ? (JSON.parse(headers.options) as FsOptions | null) : null;
    const path = MemoryFs.resolve(decodeURIComponent(headers.path), opts);
    this.requireParent(path);
    this.fs.files.set(path, Uint8Array.from(rawArgs.__bytes));
    return null;
  }

  private mkdir(args: Args): null {
    const path = this.resolve(args);
    const recursive = (args.options as FsOptions | null)?.recursive ?? false;
    if (!recursive) {
      this.requireParent(path);
      this.fs.dirs.add(path);
      return null;
    }
    const parts = path.split('/');
    for (let i = 2; i <= parts.length; i++) this.fs.dirs.add(parts.slice(0, i).join('/'));
    return null;
  }

  /** A base directory (`$AppData`) always exists; below it, like the real fs, the parent must. */
  private requireParent(path: string): void {
    if (!path.startsWith('$')) return;
    const parent = path.slice(0, path.lastIndexOf('/'));
    if (parent.includes('/') && !this.fs.dirs.has(parent)) {
      throw new Error(`bridge: fs: no such directory ${parent}`);
    }
  }

  private readDir(args: Args): { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }[] {
    const path = this.resolve(args);
    if (!this.fs.dirs.has(path)) throw new Error(`bridge: fs: no such directory ${path}`);
    const prefix = `${path}/`;
    const direct = (p: string) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/');
    return [
      ...[...this.fs.dirs].filter(direct).map((p) => ({ name: p.slice(prefix.length), isDirectory: true, isFile: false, isSymlink: false })),
      ...[...this.fs.files.keys()].filter(direct).map((p) => ({ name: p.slice(prefix.length), isDirectory: false, isFile: true, isSymlink: false })),
    ];
  }

  private async executeBatch(args: Args): Promise<{ rows_affected: number[] }> {
    this.requireLoaded(args.db);
    const batch = args.batch as { sql: string; params: unknown[]; expect_rows_affected: number | null }[];
    await this.db.execute('BEGIN IMMEDIATE');
    try {
      const rows_affected = batch.map((s, index) => {
        let changes: number;
        try {
          changes = this.db.runWithInfo(s.sql, batchBind(s.params)).changes;
        } catch (e) {
          throw JSON.stringify({ Sql: { index, message: (e as Error).message } });
        }
        if (s.expect_rows_affected !== null && s.expect_rows_affected !== undefined && changes !== s.expect_rows_affected) {
          throw JSON.stringify({
            RowsAffectedMismatch: { index, expected: s.expect_rows_affected, actual: changes },
          });
        }
        return changes;
      });
      await this.db.execute('COMMIT');
      return { rows_affected };
    } catch (e) {
      await this.db.execute('ROLLBACK');
      throw e;
    }
  }
}
