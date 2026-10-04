/**
 * Demo voyage content taken from the real working file «Kavkaz IV: Load St Plan+SOF.xlsx»
 * (vessel name, flag, owner, lots, discharges, SOF, crane coefficients). Static data — the
 * xlsx is not read at runtime. Per-hold totals equal `KAVKAZ_IV_HOLDS` (Appendix C).
 *
 * What is reconstructed rather than read: the source keeps lots per hold and source vessel
 * («VLADIMIR =598+833+2100») without dates; each term is one lot here, dated by that
 * vessel's «TO OUR CH'S» visit in the SOF (VLADIMIR 19–20.04 for holds 2/4, 29–30.04 for
 * holds 1/3/5 — the order that keeps the sheet's row order as the LIFO order).
 */

export const DEMO_VESSEL = { name: 'KAVKAZ IV', flag: 'PANAMA', owner: 'KAVKAZ IV LIMITED' } as const;
export const DEMO_VOYAGE_NO = 'DEMO-001';
/** «LOADING PORT: KAVKAZ / RUSSIA»; the sheet leaves the discharging port blank. */
export const DEMO_LOADING_PORT = 'KAVKAZ';

export interface DemoLot {
  hold_no: number;
  source_vessel: string;
  loaded_tons: number;
  /** ISO datetime, local time of the SOF line the lot belongs to. */
  loaded_at: string;
}

/** In load order (oldest first). Sheet «KAVKAZ IV», rows 22–23 (vessels) per hold column. */
export const DEMO_LOTS: readonly DemoLot[] = [
  // VLADIMIR, first visit: COMMENCED 19.04 14:25 — COMPLETED 20.04 01:10
  { hold_no: 2, source_vessel: 'VLADIMIR', loaded_tons: 2317, loaded_at: '2026-04-19T15:30:00' },
  { hold_no: 4, source_vessel: 'VLADIMIR', loaded_tons: 598, loaded_at: '2026-04-19T17:00:00' },
  { hold_no: 4, source_vessel: 'VLADIMIR', loaded_tons: 833, loaded_at: '2026-04-19T21:30:00' },
  { hold_no: 2, source_vessel: 'VLADIMIR', loaded_tons: 952, loaded_at: '2026-04-19T23:00:00' },
  { hold_no: 4, source_vessel: 'VLADIMIR', loaded_tons: 2100, loaded_at: '2026-04-20T01:00:00' },
  // ALISA V: COMMENCED 22.04 13:20 — COMPLETED 22.04 20:40
  { hold_no: 5, source_vessel: 'ALISA V', loaded_tons: 1735.54, loaded_at: '2026-04-22T14:30:00' },
  { hold_no: 3, source_vessel: 'ALISA V', loaded_tons: 1003, loaded_at: '2026-04-22T15:40:00' },
  { hold_no: 1, source_vessel: 'ALISA V', loaded_tons: 2160, loaded_at: '2026-04-22T17:50:00' },
  { hold_no: 3, source_vessel: 'ALISA V', loaded_tons: 1287, loaded_at: '2026-04-22T20:30:00' },
  // YEKATERINA: COMMENCED 28.04 11:05 — COMPLETED 28.04 17:50
  { hold_no: 2, source_vessel: 'YEKATERINA', loaded_tons: 2366, loaded_at: '2026-04-28T12:30:00' },
  { hold_no: 4, source_vessel: 'YEKATERINA', loaded_tons: 1034, loaded_at: '2026-04-28T13:40:00' },
  { hold_no: 2, source_vessel: 'YEKATERINA', loaded_tons: 1438, loaded_at: '2026-04-28T15:30:00' },
  { hold_no: 4, source_vessel: 'YEKATERINA', loaded_tons: 1800, loaded_at: '2026-04-28T17:40:00' },
  // VLADIMIR, second visit: COMMENCED 29.04 18:00 — COMPLETED 30.04 03:20
  { hold_no: 5, source_vessel: 'VLADIMIR', loaded_tons: 702, loaded_at: '2026-04-29T19:00:00' },
  { hold_no: 3, source_vessel: 'VLADIMIR', loaded_tons: 1712, loaded_at: '2026-04-29T21:30:00' },
  { hold_no: 1, source_vessel: 'VLADIMIR', loaded_tons: 1922, loaded_at: '2026-04-30T00:40:00' },
  { hold_no: 5, source_vessel: 'VLADIMIR', loaded_tons: 1725.415, loaded_at: '2026-04-30T03:10:00' },
];

export interface DemoDischarge {
  hold_no: number;
  tons: number;
  event_date: string;
  time_from: string;
  description: string;
}

/** Sheet «OGV», rows 32 and 45; SOF 01.05 12:05. Scale weights on «CRANE CORR.» C3/C4. */
export const DEMO_DISCHARGES: readonly DemoDischarge[] = [
  { hold_no: 3, tons: 1177, event_date: '2026-05-01', time_from: '12:05', description: 'C/OPS FM OUR CH\'S TO M/V "AAI PRELUDE"' },
  { hold_no: 5, tons: 824, event_date: '2026-05-01', time_from: '12:05', description: 'C/OPS FM OUR CH\'S TO M/V "AAI PRELUDE"' },
];

export interface DemoSofEvent {
  date: string;
  from: string;
  to: string | null;
  category: string;
  description: string;
}

/**
 * Sheet «SOF», 19.04.2026 — 01.05.2026, descriptions verbatim. Categories are assigned by
 * keyword; barge-to-PAREA direct transfers and barge moorings stay `other`. A lone time in
 * the source's «To» column is a point event, except «… IN PROGRESS», which runs from the
 * previous line to that time and takes the category of the operation it continues.
 */
export const DEMO_SOF: readonly DemoSofEvent[] = [
  { date: "2026-04-19", from: "00:00", to: "03:40", category: "other", description: "CGO IN PROGRESS" },
  { date: "2026-04-19", from: "03:40", to: null, category: "other", description: "COMPLETED C/OPS FM M/V \"OLGA V\" TO M/V \"PAREA\"" },
  { date: "2026-04-19", from: "03:50", to: null, category: "cast_off", description: "M/V \"OLGA V\" CAST OFF" },
  { date: "2026-04-19", from: "14:15", to: null, category: "other", description: "M/V \"VLADIMIR\" ALL FAST" },
  { date: "2026-04-19", from: "14:25", to: null, category: "loading_commenced", description: "COMMENCED C/OPS FM M/V\"VLADIMIR\" TO OUR CH'S" },
  { date: "2026-04-19", from: "15:10", to: null, category: "shifting", description: "SUSPENDED CGO COMMENCED SHIFTING VSL" },
  { date: "2026-04-19", from: "16:40", to: null, category: "shifting", description: "COMPLETED SHIFTING RESUMED CGO" },
  { date: "2026-04-19", from: "19:35", to: null, category: "weather", description: "SUSPENDED CGO DUE TO RAIN" },
  { date: "2026-04-19", from: "20:40", to: null, category: "loading_commenced", description: "RESUMED CGO FM M/V\"VLADIMIR\" TO OUR CH'S" },
  { date: "2026-04-19", from: "20:40", to: "24:00", category: "loading_commenced", description: "CGO IN PROGRESS" },
  { date: "2026-04-20", from: "00:00", to: "01:10", category: "loading_commenced", description: "CGO IN PROGRESS" },
  { date: "2026-04-20", from: "01:10", to: null, category: "loading_completed", description: "COMPLETED CGO FM M/V\"VLADIMIR\" TO OUR CH'S" },
  { date: "2026-04-20", from: "01:10", to: null, category: "discharging_commenced", description: "RESUMED CGO FM OUR CH'S TO M/V \"PAREA\"" },
  { date: "2026-04-20", from: "01:20", to: null, category: "cast_off", description: "M/V\"VLADIMIR\" CAST OFF" },
  { date: "2026-04-20", from: "13:10", to: null, category: "other", description: "M/V\"DIANA MARIYA\" ALL FAST" },
  { date: "2026-04-20", from: "17:20", to: null, category: "other", description: "COMMENCED C/OPS FM M/V \"DIANA MARIYA\" TO M/V \"PAREA\"" },
  { date: "2026-04-20", from: "17:20", to: "24:00", category: "other", description: "CGO IN PROGRESS" },
  { date: "2026-04-21", from: "00:00", to: "03:10", category: "other", description: "CGO IN PROGRESS" },
  { date: "2026-04-21", from: "03:10", to: null, category: "formalities", description: "SUSPENDED CGO COMMENCED INTERMEDIATE DRAFT SURVEY" },
  { date: "2026-04-21", from: "05:00", to: null, category: "formalities", description: "COMPLETED INTERMEDIATE DRAFT SURVEY" },
  { date: "2026-04-21", from: "06:00", to: null, category: "other", description: "SUSPENDED CGO FM M/V \"DIANA MARIYA\" TO M/V \"PAREA\", RESUMED FM OUR CH'S" },
  { date: "2026-04-21", from: "09:40", to: null, category: "other", description: "RESUMED FM M/V \"DIANA MARIYA\" TO M/V \"PAREA\"" },
  { date: "2026-04-21", from: "10:35", to: null, category: "weather", description: "SUSPENDED CGO DUE TO RAIN" },
  { date: "2026-04-21", from: "11:35", to: null, category: "other", description: "RESUMED CGO" },
  { date: "2026-04-21", from: "11:45", to: null, category: "weather", description: "SUSPENDED CGO DUE TO RAIN" },
  { date: "2026-04-21", from: "12:05", to: null, category: "other", description: "RESUMED CGO" },
  { date: "2026-04-21", from: "12:25", to: null, category: "weather", description: "SUSPENDED CGO DUE TO RAIN" },
  { date: "2026-04-21", from: "12:55", to: null, category: "other", description: "RESUMED CGO" },
  { date: "2026-04-21", from: "13:30", to: null, category: "other", description: "SUSPENDED CGO" },
  { date: "2026-04-21", from: "14:30", to: null, category: "other", description: "COMMENCED UNMOORING M/V\"DIANA MARIA\"" },
  { date: "2026-04-21", from: "15:30", to: null, category: "cast_off", description: "COMPLETED UNMOORING M/V\"DIANA MARIA\"" },
  { date: "2026-04-21", from: "15:40", to: null, category: "other", description: "RESUMED CGO" },
  { date: "2026-04-21", from: "16:40", to: null, category: "other", description: "COMPLETED C/OPS FM M/V \"DIANA MARIA\"" },
  { date: "2026-04-21", from: "16:50", to: null, category: "cast_off", description: "M/V \"DIANA MARIA\" CAST OFF" },
  { date: "2026-04-21", from: "16:50", to: "24:00", category: "weather", description: "AWAITING WEATHER IMPROVE" },
  { date: "2026-04-22", from: "00:00", to: "08:00", category: "weather", description: "AWAITING WEATHER IMPROVE" },
  { date: "2026-04-22", from: "08:00", to: null, category: "other", description: "M/V \"LUBOV\" ALL FAST" },
  { date: "2026-04-22", from: "08:10", to: null, category: "other", description: "COMMENCED C/OPS FM M/V \"LUBOV\"" },
  { date: "2026-04-22", from: "11:15", to: null, category: "formalities", description: "SUSPENDED C/OPS FM M/V \"LUBOV\" TO M/V PAREA DRAFT SYRVEY" },
  { date: "2026-04-22", from: "12:00", to: null, category: "other", description: "RESUMED C/OPS FM M/V \"LUBOV\" TO M/V PAREA" },
  { date: "2026-04-22", from: "12:40", to: null, category: "other", description: "COMPLETED C/OPS FM M/V \"LUBOV\"" },
  { date: "2026-04-22", from: "12:50", to: null, category: "cast_off", description: "M/V \"LUBOV\" CAST OFF" },
  { date: "2026-04-22", from: "13:10", to: null, category: "other", description: "M/V \"ALISA V\" ALL FAST" },
  { date: "2026-04-22", from: "13:20", to: null, category: "loading_commenced", description: "COMMENCED C/OPS FM M/V \"ALISA V\" TO OUR CH'S" },
  { date: "2026-04-22", from: "20:40", to: null, category: "loading_completed", description: "COMPLETED C/OPS FM M/V \"ALISA V\"" },
  { date: "2026-04-22", from: "21:00", to: null, category: "cast_off", description: "M/V\"ALISA V\" CAST OFF" },
  { date: "2026-04-22", from: "21:30", to: null, category: "cast_off", description: "CAST OFF FM M/V\"PAREA\"" },
  { date: "2026-04-22", from: "22:30", to: null, category: "shifting", description: "DROPPED ANCHOR" },
  { date: "2026-04-22", from: "22:30", to: "24:00", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-04-23", from: "00:00", to: "24:00", category: "weather", description: "AWAITING WEATHER IMPROVE" },
  { date: "2026-04-24", from: "00:00", to: "24:00", category: "weather", description: "AWAITING WEATHER IMPROVE" },
  { date: "2026-04-25", from: "00:00", to: "24:00", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-04-26", from: "00:00", to: "24:00", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-04-27", from: "00:00", to: "24:00", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-04-28", from: "00:00", to: "10:55", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-04-28", from: "10:55", to: null, category: "other", description: "M/V \"YEKATERINA\" ALL FAST" },
  { date: "2026-04-28", from: "11:05", to: null, category: "loading_commenced", description: "COMMENCED C/OPS FM M/V \"YEKATERINA\" TO OUR CH'S" },
  { date: "2026-04-28", from: "17:50", to: null, category: "loading_completed", description: "COMPLETED C/OPS FM M/V \"YEKATERINA\"" },
  { date: "2026-04-28", from: "19:20", to: null, category: "cast_off", description: "M/V\"YEKATERINA\" CAST OFF" },
  { date: "2026-04-28", from: "21:00", to: null, category: "other", description: "B/B \"SBORSCHIK 2\" ALL FAST" },
  { date: "2026-04-28", from: "21:10", to: null, category: "other", description: "COMMENCED RCV FW FM B/B SBORSCHIK - 2 & DISCHARGING GARBAGE, BILGE, SLUDGE" },
  { date: "2026-04-28", from: "21:10", to: "24:00", category: "other", description: "RCV FW FM B/B SBORSCHIK - 2 & DISCHARGING GARBAGE, BILGE, SLUDGE" },
  { date: "2026-04-29", from: "00:00", to: "01:30", category: "other", description: "RCV FW FM B/B SBORSCHIK - 2 & DISCHARGING GARBAGE, BILGE, SLUDGE" },
  { date: "2026-04-29", from: "01:30", to: null, category: "other", description: "COMPLETED RCV FW FM B/B SBORSCHIK - 2 & DISCHARGING GARBAGE, BILGE, SLUDGE" },
  { date: "2026-04-29", from: "01:45", to: null, category: "cast_off", description: "B/B \"SBORSCHIK 2\" CAST OFF" },
  { date: "2026-04-29", from: "01:45", to: "17:50", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-04-29", from: "17:50", to: null, category: "other", description: "M/V \"VLADIMIR\" ALL FAST" },
  { date: "2026-04-29", from: "18:00", to: null, category: "loading_commenced", description: "COMMENCED C/OPS FM M/V \"VLADIMIR\" TO OUR CH'S" },
  { date: "2026-04-29", from: "18:00", to: "24:00", category: "loading_commenced", description: "C/OPS FM M/V \"VLADIMIR\" TO OUR CH'S IN PROGRESS" },
  { date: "2026-04-30", from: "00:00", to: "03:20", category: "loading_commenced", description: "C/OPS FM M/V \"VLADIMIR\" TO OUR CH'S IN PROGRESS" },
  { date: "2026-04-30", from: "03:20", to: null, category: "loading_completed", description: "COMPLETED C/OPS FM M/V \"VLADIMIR\"" },
  { date: "2026-04-30", from: "03:30", to: null, category: "cast_off", description: "M/V \"VLADIMIR\" CAST OFF" },
  { date: "2026-04-30", from: "03:30", to: "24:00", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-05-01", from: "00:00", to: "01:55", category: "waiting", description: "AWAITING NEXT INSTRUCTION" },
  { date: "2026-05-01", from: "01:55", to: null, category: "shifting", description: "HEAVE UP ANCHOR" },
  { date: "2026-05-01", from: "02:10", to: null, category: "shifting", description: "UNDERWAY" },
  { date: "2026-05-01", from: "03:20", to: null, category: "berthed", description: "FIRST LINE" },
  { date: "2026-05-01", from: "04:00", to: null, category: "berthed", description: "ALL FAST" },
  { date: "2026-05-01", from: "04:00", to: "12:05", category: "weather", description: "AWAITING WEATHER IMPROVE" },
  { date: "2026-05-01", from: "12:05", to: null, category: "discharging_commenced", description: "COMMENCED C/OPS FM OUR CH'S TO M/V\"AAI PRELUDE\"" },
];

export const DEMO_CRANES = ['CRANE # 1', 'CRANE # 2'] as const;

export type DemoCraneMode = 'from_own' | 'direct' | 'into_own_port' | 'into_own_starboard';
type DemoCrane = (typeof DEMO_CRANES)[number];

export interface DemoCraneMeasurement {
  crane: DemoCrane;
  mode: DemoCraneMode;
  vessel_name: string | null;
  measured_on: string;
  coefficient: number;
  excluded: boolean;
}

/**
 * Sheet «CRANE CORR.», history to the right of each block: «ИЗ СЕБЯ» → from_own, «ПРЯМАЯ» →
 * direct, «В СЕБЯ port / st. side» → into_own_port / into_own_starboard. The only value the
 * operators struck out (red in the file) is I. VIKULOV 1.39 in «ПРЯМАЯ» (excel-reference §2).
 * Vessel names follow the SOF spelling (I.Vikulov / C.I.Vikulov → IVAN VIKULOV).
 */
export const DEMO_CRANE_MEASUREMENTS: readonly DemoCraneMeasurement[] = [
  { crane: 'CRANE # 1', mode: 'from_own', vessel_name: null, measured_on: '2024-10-24', coefficient: 1.02, excluded: false },
  { crane: 'CRANE # 2', mode: 'from_own', vessel_name: null, measured_on: '2024-10-24', coefficient: 0.999, excluded: false },
  { crane: 'CRANE # 1', mode: 'from_own', vessel_name: null, measured_on: '2025-01-15', coefficient: 1.129, excluded: false },
  { crane: 'CRANE # 2', mode: 'from_own', vessel_name: null, measured_on: '2025-01-15', coefficient: 1.068, excluded: false },
  { crane: 'CRANE # 1', mode: 'from_own', vessel_name: 'BETA', measured_on: '2025-08-06', coefficient: 1.06, excluded: false },
  { crane: 'CRANE # 2', mode: 'from_own', vessel_name: 'BETA', measured_on: '2025-08-06', coefficient: 1.17, excluded: false },
  { crane: 'CRANE # 1', mode: 'from_own', vessel_name: null, measured_on: '2025-11-09', coefficient: 1.06, excluded: false },
  { crane: 'CRANE # 2', mode: 'from_own', vessel_name: null, measured_on: '2025-11-17', coefficient: 0.96, excluded: false },
  { crane: 'CRANE # 1', mode: 'direct', vessel_name: 'GAMMA', measured_on: '2025-02-14', coefficient: 1.07, excluded: false },
  { crane: 'CRANE # 2', mode: 'direct', vessel_name: 'GAMMA', measured_on: '2025-02-14', coefficient: 1.04, excluded: false },
  { crane: 'CRANE # 1', mode: 'direct', vessel_name: 'LUBOV', measured_on: '2025-08-09', coefficient: 1.1, excluded: false },
  { crane: 'CRANE # 2', mode: 'direct', vessel_name: 'LUBOV', measured_on: '2025-08-09', coefficient: 1.245, excluded: false },
  { crane: 'CRANE # 1', mode: 'direct', vessel_name: 'ШИЛАЙНЯЙ', measured_on: '2025-08-17', coefficient: 1.1, excluded: false },
  { crane: 'CRANE # 2', mode: 'direct', vessel_name: 'ШИЛАЙНЯЙ', measured_on: '2025-08-17', coefficient: 0.82, excluded: false },
  { crane: 'CRANE # 1', mode: 'direct', vessel_name: 'ANASTASIA V', measured_on: '2025-08-27', coefficient: 1.178, excluded: false },
  { crane: 'CRANE # 2', mode: 'direct', vessel_name: 'ANASTASIA V', measured_on: '2025-08-27', coefficient: 0.875, excluded: false },
  { crane: 'CRANE # 1', mode: 'direct', vessel_name: 'LYDIA V', measured_on: '2025-08-28', coefficient: 1.13, excluded: false },
  { crane: 'CRANE # 2', mode: 'direct', vessel_name: 'LYDIA V', measured_on: '2025-08-28', coefficient: 0.9, excluded: false },
  { crane: 'CRANE # 1', mode: 'direct', vessel_name: 'IVAN VIKULOV', measured_on: '2025-10-19', coefficient: 1.39, excluded: true },
  { crane: 'CRANE # 2', mode: 'direct', vessel_name: 'IVAN VIKULOV', measured_on: '2025-10-19', coefficient: 1.04, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_port', vessel_name: 'LYDIA V', measured_on: '2025-09-03', coefficient: 1.1, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_port', vessel_name: 'LYDIA V', measured_on: '2025-09-03', coefficient: 0.99, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_port', vessel_name: 'BRAVO', measured_on: '2025-09-04', coefficient: 1.11, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_port', vessel_name: 'BRAVO', measured_on: '2025-09-04', coefficient: 0.89, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_port', vessel_name: 'DELTA', measured_on: '2025-09-05', coefficient: 1.07, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_port', vessel_name: 'DELTA', measured_on: '2025-09-05', coefficient: 0.88, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_port', vessel_name: 'VLADIMIR', measured_on: '2025-09-06', coefficient: 1.06, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_port', vessel_name: 'VLADIMIR', measured_on: '2025-09-06', coefficient: 0.94, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_port', vessel_name: 'IVAN VIKULOV', measured_on: '2025-10-03', coefficient: 1.06, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_port', vessel_name: 'IVAN VIKULOV', measured_on: '2025-10-03', coefficient: 0.9, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_port', vessel_name: 'DIANA MARIA', measured_on: '2025-11-04', coefficient: 1.01, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_port', vessel_name: 'BETA', measured_on: '2025-11-08', coefficient: 1.09, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_starboard', vessel_name: 'BETA', measured_on: '2025-08-05', coefficient: 0.967, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_starboard', vessel_name: 'BETA', measured_on: '2025-08-05', coefficient: 1.25, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_starboard', vessel_name: 'IVAN VIKULOV', measured_on: '2025-09-09', coefficient: 0.98, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_starboard', vessel_name: 'IVAN VIKULOV', measured_on: '2025-09-09', coefficient: 1.09, excluded: false },
  { crane: 'CRANE # 1', mode: 'into_own_starboard', vessel_name: 'ALISA V', measured_on: '2025-10-14', coefficient: 1.1, excluded: false },
  { crane: 'CRANE # 2', mode: 'into_own_starboard', vessel_name: 'ALISA V', measured_on: '2025-10-14', coefficient: 1.11, excluded: false },
];

export interface DemoCraneWorking {
  crane: DemoCrane;
  mode: DemoCraneMode;
  coefficient: number;
  valid_from: string;
}

/**
 * Column F of each block — the coefficient the operators accepted for work; it is a decision,
 * not the mean of the history (excel-reference §2). In force from the block's last measurement.
 */
export const DEMO_CRANE_WORKING: readonly DemoCraneWorking[] = [
  { crane: 'CRANE # 1', mode: 'from_own', coefficient: 1.06, valid_from: '2025-11-09' },
  { crane: 'CRANE # 2', mode: 'from_own', coefficient: 0.96, valid_from: '2025-11-17' },
  { crane: 'CRANE # 1', mode: 'direct', coefficient: 1.13, valid_from: '2025-10-19' },
  { crane: 'CRANE # 2', mode: 'direct', coefficient: 1.04, valid_from: '2025-10-19' },
  { crane: 'CRANE # 1', mode: 'into_own_port', coefficient: 1.06, valid_from: '2025-11-08' },
  { crane: 'CRANE # 2', mode: 'into_own_port', coefficient: 1.01, valid_from: '2025-11-04' },
  { crane: 'CRANE # 1', mode: 'into_own_starboard', coefficient: 0.98, valid_from: '2025-10-14' },
  { crane: 'CRANE # 2', mode: 'into_own_starboard', coefficient: 1.09, valid_from: '2025-10-14' },
];

export interface DemoCraneShift {
  crane: DemoCrane;
  mode: DemoCraneMode;
  scale_tons: number;
  /** Index into DEMO_DISCHARGES when the weighing is that discharge («ИЗ СЕБЯ»). */
  discharge?: number;
}

/**
 * Column C («ВЕСЫ») of the sheet — one undated shift; dated 01.05.2026 here, the day of the
 * two discharges whose scale weights are the «ИЗ СЕБЯ» pair. Total 8 835.000 → 8 405.971.
 */
export const DEMO_SHIFT_DATE = '2026-05-01';
export const DEMO_CRANE_SHIFT: readonly DemoCraneShift[] = [
  { crane: 'CRANE # 1', mode: 'from_own', scale_tons: 1177, discharge: 0 },
  { crane: 'CRANE # 2', mode: 'from_own', scale_tons: 824, discharge: 1 },
  { crane: 'CRANE # 1', mode: 'direct', scale_tons: 2154 },
  { crane: 'CRANE # 2', mode: 'direct', scale_tons: 610 },
  { crane: 'CRANE # 1', mode: 'into_own_port', scale_tons: 1387 },
  { crane: 'CRANE # 2', mode: 'into_own_port', scale_tons: 604 },
  { crane: 'CRANE # 1', mode: 'into_own_starboard', scale_tons: 1269 },
  { crane: 'CRANE # 2', mode: 'into_own_starboard', scale_tons: 810 },
];

/** Sheet «OGV»: the ocean-going vessel under loading; cargo plan per hold (row 54). */
export const DEMO_OGV = {
  name: 'AAI PRELUDE',
  holds: [
    { hold_no: 7, planned_tons: 11079 },
    { hold_no: 6, planned_tons: 10869 },
    { hold_no: 5, planned_tons: 8324 },
    { hold_no: 4, planned_tons: 7900 },
    { hold_no: 3, planned_tons: 10456 },
    { hold_no: 2, planned_tons: 10869 },
    { hold_no: 1, planned_tons: 9503 },
  ],
} as const;

/** Row 4: «KAVKAZ IV Transshipment from barges» — barge KAVKAZ III per OGV hold. */
export const DEMO_OGV_BARGE_RECEIPTS: readonly { hold_no: number; tons: number }[] = [
  { hold_no: 7, tons: 11017.974 },
  { hold_no: 6, tons: 10869 },
  { hold_no: 5, tons: 6938.661 },
  { hold_no: 4, tons: 7904.14 },
  { hold_no: 3, tons: 10456 },
  { hold_no: 1, tons: 9567.27 },
];
export const DEMO_OGV_BARGE = 'KAVKAZ III';
/** OGV hold receiving each of DEMO_DISCHARGES (hold 3 → OGV №2, hold 5 → OGV №5). */
export const DEMO_DISCHARGE_OGV_HOLD: readonly number[] = [2, 5];
