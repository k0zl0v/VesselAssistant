import { correctedWeight } from '../calc/capacity';
import { roundTo3 } from '../calc/round';
import type { Db } from './db';

export type OperationSide = 'PORT' | 'STARBOARD' | 'BOTH';

export const CRANE_OPERATION_TYPES = [
  'loading',
  'discharging',
  'shifting',
] as const;
export type CraneOperationType = (typeof CRANE_OPERATION_TYPES)[number];

export interface CraneCoefficient {
  id: string;
  crane_id: string;
  operation_type: string;
  side: string | null;
  vessel_name: string | null;
  valid_from: string;
  valid_to: string | null;
  coefficient: number;
}

export interface CoefficientFilter {
  crane_id?: string;
  operation_type?: string;
}

export interface CoefficientLookup {
  crane_id: string;
  operation_type: string;
  /** Optional — when null, only matches rows where stored side is also null. */
  side?: string | null;
  /** Optional — same NULL-as-wildcard semantics as `side`. */
  vessel_name?: string | null;
  /** ISO YYYY-MM-DD. */
  date: string;
}

export interface CorrectionResult {
  scale_weight: number;
  coefficient: number;
  corrected_weight: number;
  coefficient_id: string;
}

export interface CreateCoefficientInput {
  crane_id: string;
  operation_type: string;
  side?: string | null;
  vessel_name?: string | null;
  valid_from: string;
  valid_to?: string | null;
  coefficient: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Crane correction lookup and application (TZ §5, FR-06, AT-03).
 *
 * `findCoefficient` honors TZ §8 rule 6: an operation cannot use a
 * coefficient that is not active for its (date, operation_type, side).
 * Stored NULL on `side` / `vessel_name` is a wildcard ("any"); a
 * specific stored value must match exactly. When multiple rows match,
 * the most-specific (fewer NULLs) and most recently effective wins.
 */
export class CraneCorrectionService {
  constructor(private readonly db: Db) {}

  async list(filter: CoefficientFilter = {}): Promise<CraneCoefficient[]> {
    const where: string[] = [];
    const params: (string | number | null)[] = [];
    if (filter.crane_id) {
      where.push('crane_id = ?');
      params.push(filter.crane_id);
    }
    if (filter.operation_type) {
      where.push('operation_type = ?');
      params.push(filter.operation_type);
    }
    const sql =
      `SELECT * FROM crane_coefficients` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ` ORDER BY crane_id, operation_type, valid_from DESC`;
    return await this.db.select<CraneCoefficient>(sql, params);
  }

  async create(input: CreateCoefficientInput): Promise<CraneCoefficient> {
    if (!ISO_DATE_RE.test(input.valid_from)) {
      throw new Error(`valid_from must be YYYY-MM-DD, got "${input.valid_from}"`);
    }
    if (input.valid_to !== null && input.valid_to !== undefined) {
      if (!ISO_DATE_RE.test(input.valid_to)) {
        throw new Error(`valid_to must be YYYY-MM-DD, got "${input.valid_to}"`);
      }
      if (input.valid_to < input.valid_from) {
        throw new Error(`valid_to (${input.valid_to}) must be >= valid_from (${input.valid_from})`);
      }
    }
    if (!(input.coefficient > 0)) {
      throw new Error(`coefficient must be > 0, got ${input.coefficient}`);
    }
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO crane_coefficients (
         id, crane_id, operation_type, side, vessel_name,
         valid_from, valid_to, coefficient
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.crane_id,
        input.operation_type,
        input.side ?? null,
        input.vessel_name ?? null,
        input.valid_from,
        input.valid_to ?? null,
        input.coefficient,
      ],
    );
    const rows = await this.db.select<CraneCoefficient>(
      `SELECT * FROM crane_coefficients WHERE id = ?`,
      [id],
    );
    return rows[0]!;
  }

  async findCoefficient(ctx: CoefficientLookup): Promise<CraneCoefficient> {
    if (!ISO_DATE_RE.test(ctx.date)) {
      throw new Error(`date must be YYYY-MM-DD, got "${ctx.date}"`);
    }
    const rows = await this.db.select<CraneCoefficient>(
      `SELECT * FROM crane_coefficients
        WHERE crane_id = ?
          AND operation_type = ?
          AND (side IS NULL OR side = ?)
          AND (vessel_name IS NULL OR vessel_name = ?)
          AND valid_from <= ?
          AND (valid_to IS NULL OR valid_to >= ?)
        ORDER BY
          (CASE WHEN side IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN vessel_name IS NOT NULL THEN 1 ELSE 0 END) DESC,
          valid_from DESC
        LIMIT 1`,
      [
        ctx.crane_id,
        ctx.operation_type,
        ctx.side ?? null,
        ctx.vessel_name ?? null,
        ctx.date,
        ctx.date,
      ],
    );
    if (rows.length === 0) {
      throw new Error(
        `No active crane coefficient for crane=${ctx.crane_id} op=${ctx.operation_type}` +
          ` side=${ctx.side ?? '∅'} vessel=${ctx.vessel_name ?? '∅'} date=${ctx.date}`,
      );
    }
    return rows[0]!;
  }

  async correctWeight(
    scale_weight: number,
    ctx: CoefficientLookup,
  ): Promise<CorrectionResult> {
    if (!(scale_weight > 0)) {
      throw new Error(`scale_weight must be > 0, got ${scale_weight}`);
    }
    const coef = await this.findCoefficient(ctx);
    const corrected = correctedWeight(scale_weight, coef.coefficient);
    return {
      scale_weight: roundTo3(scale_weight),
      coefficient: coef.coefficient,
      corrected_weight: roundTo3(corrected),
      coefficient_id: coef.id,
    };
  }
}
