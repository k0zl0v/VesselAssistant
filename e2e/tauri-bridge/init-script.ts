/** What crosses the page ↔ Node boundary: JSON only, bytes as `{ __bytes: number[] }`. */
export type WireValue = unknown;

export type BridgeReply = { ok: true; value: WireValue } | { ok: false; error: WireValue };

export type BridgeFn = (cmd: string, args: WireValue, options: WireValue) => Promise<BridgeReply>;

export interface InitScriptConfig {
  bridgeName: string;
  lang?: 'en' | 'ru';
}

/**
 * Installs the `window.__TAURI_INTERNALS__` that `@tauri-apps/api` calls into, forwarding every
 * `invoke` (including the third `options` argument that `mockIPC` drops) to `window[bridgeName]`.
 * Playwright serialises this function into the page: it must not reference anything outside its body.
 */
export function tauriInitScript(config: InitScriptConfig): void {
  type Callback = (data: unknown) => void;
  const w = window as unknown as Record<string, unknown>;

  const toWire = (value: unknown): unknown => {
    if (value instanceof ArrayBuffer) return { __bytes: Array.from(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) {
      return { __bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    }
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  };

  const callbacks = new Map<number, Callback>();
  let nextCallbackId = 1;

  w.isTauri = true;
  w.__TAURI_INTERNALS__ = {
    async invoke(cmd: string, args: unknown = {}, options?: unknown): Promise<unknown> {
      const bridge = w[config.bridgeName] as BridgeFn | undefined;
      if (!bridge) throw new Error(`bridge: window.${config.bridgeName} is not installed`);
      const reply = await bridge(cmd, toWire(args), toWire(options));
      if (!reply.ok) throw reply.error;
      return reply.value;
    },
    transformCallback(callback?: Callback, once = false): number {
      const id = nextCallbackId++;
      callbacks.set(id, (data) => {
        if (once) callbacks.delete(id);
        callback?.(data);
      });
      return id;
    },
    unregisterCallback(id: number): void {
      callbacks.delete(id);
    },
    runCallback(id: number, data: unknown): void {
      callbacks.get(id)?.(data);
    },
    callbacks,
    convertFileSrc(path: string, protocol = 'asset'): string {
      return `${protocol}://localhost/${encodeURIComponent(path)}`;
    },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
  };

  if (config.lang) localStorage.setItem('vessel-assistant.lang', config.lang);
}
