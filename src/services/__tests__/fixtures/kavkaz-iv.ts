/**
 * Per-hold values extracted from `Kavkaz IV_  Load St Plan+SOF.xlsx`,
 * sheet `KAVKAZ IV`, rows 4–8 (per-hold parameters) and rows 25–27
 * (loaded / discharged / remain). Verified against the formula cells:
 *
 *   On Board (L5)             = 23683.955
 *   Discharged (L6)           = 2001
 *   Total Empty 100% (S9)     = 16689.390454957404
 *   Total Empty 98% (V9, L30) = 15881.923545858255  → 15881.924 rounded
 *
 * The original sheet has multiple lots per hold (ALISA V / VLADIMIR /
 * YEKATERINA, rows 22–23). We collapse them into one lot per hold for
 * the *aggregate* baseline — per-source LIFO is exercised separately
 * in ogv.test.ts. Aggregate totals are unchanged either way because
 * SF is per-hold, not per-lot, in the original.
 */
export interface KavkazHoldFixture {
  hold_no: number;
  volume_m3: number;
  sf: number;
  cargo: 'SFM' | 'WHEAT';
  loaded_tons: number;
  discharged_tons: number;
  /** Expected aggregates from the original sheet. Used for assertions. */
  expected: {
    remain_tons: number;
    capacity_tons_100: number;
    capacity_tons_98: number;
    empty_space_100: number;
    empty_space_98: number;
  };
}

export const KAVKAZ_IV_HOLDS: readonly KavkazHoldFixture[] = [
  {
    hold_no: 1,
    volume_m3: 10340.5,
    sf: 1.44,
    cargo: 'SFM',
    loaded_tons: 4082,
    discharged_tons: 0,
    expected: {
      remain_tons: 4082,
      capacity_tons_100: 7180.902777777778,
      capacity_tons_98: 7037.284722222223,
      empty_space_100: 3098.9027777777783,
      empty_space_98: 2955.2847222222226,
    },
  },
  {
    hold_no: 2,
    volume_m3: 11187.3,
    sf: 1.226,
    cargo: 'WHEAT',
    loaded_tons: 7073,
    discharged_tons: 0,
    expected: {
      remain_tons: 7073,
      capacity_tons_100: 9125.040783034257,
      capacity_tons_98: 8942.539967373572,
      empty_space_100: 2052.0407830342574,
      empty_space_98: 1869.539967373572,
    },
  },
  {
    hold_no: 3,
    volume_m3: 10749.8,
    sf: 1.44,
    cargo: 'SFM',
    loaded_tons: 4002,
    discharged_tons: 1177,
    expected: {
      remain_tons: 2825,
      capacity_tons_100: 7465.138888888889,
      capacity_tons_98: 7315.83611111111,
      empty_space_100: 4640.138888888889,
      empty_space_98: 4490.83611111111,
    },
  },
  {
    hold_no: 4,
    volume_m3: 11187.3,
    sf: 1.226,
    cargo: 'WHEAT',
    loaded_tons: 6365,
    discharged_tons: 0,
    expected: {
      remain_tons: 6365,
      capacity_tons_100: 9125.040783034257,
      capacity_tons_98: 8942.539967373572,
      empty_space_100: 2760.0407830342574,
      empty_space_98: 2577.539967373572,
    },
  },
  {
    hold_no: 5,
    volume_m3: 10767.2,
    sf: 1.44,
    cargo: 'SFM',
    loaded_tons: 4162.955,
    discharged_tons: 824,
    expected: {
      remain_tons: 3338.955,
      capacity_tons_100: 7477.222222222223,
      capacity_tons_98: 7327.677777777778,
      empty_space_100: 4138.267222222223,
      empty_space_98: 3988.722777777778,
    },
  },
];

export const KAVKAZ_IV_TOTALS = {
  on_board: 23683.955,
  total_loaded: 25684.955,
  total_discharged: 2001,
  total_empty_100: 16689.390454957404,
  total_empty_98: 15881.923545858255,
} as const;
