import { correctedWeight } from '../calc/capacity';
import type { Db } from './db';
import { AppError } from './errors';

/**
 * Crane operation modes as the operators keep them (docs/ui/excel-reference.md §2).
 * Only «into own holds» is split by side.
 */
export const CRANE_MODES = ['from_own', 'direct', 'into_own_port', 'into_own_starboard'] as const;
export type CraneMode = (typeof CRANE_MODES)[number];

export interface CraneWorkingCoefficient {
  id: string;
  crane_id: string;
  mode: CraneMode;
  coefficient: number;
  valid_from: string;
  note: string | null;
}

export interface CraneCorrection {
  coefficient: number;
  /** Full precision; round only at display (formatTons). */
  corrected_tons: number;
  working: CraneWorkingCoefficient;
}

/**
 * Working (accepted) crane coefficients and the scale → corrected conversion.
 * The scale weight is what goes into hold remains; the corrected weight lives
 * only on the crane sheet (ui-kit § «Краны видны на рабочих экранах»).
 */
export class CraneShiftService {
  constructor(private readonly db: Db) {}

  /** The working coefficient in force on `date` (latest `valid_from` ≤ date). */
  async workingCoefficient(crane_id: string, mode: CraneMode, date: string): Promise<CraneWorkingCoefficient> {
    const [row] = await this.db.select<CraneWorkingCoefficient>(
      `SELECT * FROM crane_working_coefficients
        WHERE crane_id = ? AND mode = ? AND valid_from <= ?
        ORDER BY valid_from DESC
        LIMIT 1`,
      [crane_id, mode, date],
    );
    if (!row) throw new AppError('crane.no_coefficient', { mode, date });
    return row;
  }

  async correct(scale_tons: number, crane_id: string, mode: CraneMode, date: string): Promise<CraneCorrection> {
    const working = await this.workingCoefficient(crane_id, mode, date);
    return { coefficient: working.coefficient, corrected_tons: correctedWeight(scale_tons, working.coefficient), working };
  }
}
