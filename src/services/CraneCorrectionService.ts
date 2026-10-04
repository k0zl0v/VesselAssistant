import type { Db } from './db';

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

export interface CreateCoefficientInput {
  crane_id: string;
  operation_type: string;
  side?: string | null;
  vessel_name?: string | null;
  valid_from: string;
  valid_to?: string | null;
  coefficient: number;
}

/**
 * @deprecated Legacy `crane_coefficients` table: nothing new reads it (migration 0006 carried
 * its rows over). Crane correction lives in `CraneShiftService`. Kept only so old tests can
 * still create rows there; delete together with the last caller.
 */
export class CraneCorrectionService {
  constructor(private readonly db: Db) {}

  async create(input: CreateCoefficientInput): Promise<CraneCoefficient> {
    if (!(input.coefficient > 0)) throw new Error(`coefficient must be > 0, got ${input.coefficient}`);
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO crane_coefficients (id, crane_id, operation_type, side, vessel_name, valid_from, valid_to, coefficient)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    const [row] = await this.db.select<CraneCoefficient>(`SELECT * FROM crane_coefficients WHERE id = ?`, [id]);
    return row!;
  }
}
