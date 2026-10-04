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

export interface DemoCraneCoefficient {
  crane: (typeof DEMO_CRANES)[number];
  operation_type: 'loading' | 'discharging';
  side: 'PORT' | 'STARBOARD' | null;
  vessel_name: string | null;
  valid_from: string;
  valid_to: string | null;
  coefficient: number;
}

/**
 * Sheet «CRANE CORR.»: «ИЗ СЕБЯ» → discharging, «В СЕБЯ port side / st. side» → loading
 * PORT / STARBOARD. Dated vessel columns become vessel-specific rows; the «current» column F
 * becomes the vessel-agnostic default. «ПРЯМАЯ» (barge → export ship) has no operation type
 * in the app and is not seeded. Vessel names are normalised to the SOF spelling
 * (I.Vikulov / C.I.Vikulov → IVAN VIKULOV).
 */
export const DEMO_CRANE_COEFFICIENTS: readonly DemoCraneCoefficient[] = [
  // ИЗ СЕБЯ — vessel-agnostic periods; the open one equals column F (1.06 / 0.96).
  { crane: 'CRANE # 1', operation_type: 'discharging', side: null, vessel_name: null, valid_from: '2024-10-24', valid_to: '2025-01-14', coefficient: 1.02 },
  { crane: 'CRANE # 1', operation_type: 'discharging', side: null, vessel_name: null, valid_from: '2025-01-15', valid_to: '2025-11-08', coefficient: 1.129 },
  { crane: 'CRANE # 1', operation_type: 'discharging', side: null, vessel_name: null, valid_from: '2025-11-09', valid_to: null, coefficient: 1.06 },
  { crane: 'CRANE # 1', operation_type: 'discharging', side: null, vessel_name: 'BETA', valid_from: '2025-08-06', valid_to: null, coefficient: 1.06 },
  { crane: 'CRANE # 2', operation_type: 'discharging', side: null, vessel_name: null, valid_from: '2024-10-24', valid_to: '2025-01-14', coefficient: 0.999 },
  { crane: 'CRANE # 2', operation_type: 'discharging', side: null, vessel_name: null, valid_from: '2025-01-15', valid_to: '2025-11-16', coefficient: 1.068 },
  { crane: 'CRANE # 2', operation_type: 'discharging', side: null, vessel_name: null, valid_from: '2025-11-17', valid_to: null, coefficient: 0.96 },
  { crane: 'CRANE # 2', operation_type: 'discharging', side: null, vessel_name: 'BETA', valid_from: '2025-08-06', valid_to: null, coefficient: 1.17 },
  // В СЕБЯ, port side
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'PORT', vessel_name: null, valid_from: '2025-09-03', valid_to: null, coefficient: 1.06 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'PORT', vessel_name: 'LYDIA V', valid_from: '2025-09-03', valid_to: null, coefficient: 1.1 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'PORT', vessel_name: 'BRAVO', valid_from: '2025-09-04', valid_to: null, coefficient: 1.11 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'PORT', vessel_name: 'DELTA', valid_from: '2025-09-05', valid_to: null, coefficient: 1.07 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'PORT', vessel_name: 'VLADIMIR', valid_from: '2025-09-06', valid_to: null, coefficient: 1.06 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'PORT', vessel_name: 'IVAN VIKULOV', valid_from: '2025-10-03', valid_to: null, coefficient: 1.06 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'PORT', vessel_name: 'BETA', valid_from: '2025-11-08', valid_to: null, coefficient: 1.09 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'PORT', vessel_name: null, valid_from: '2025-09-03', valid_to: null, coefficient: 1.01 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'PORT', vessel_name: 'LYDIA V', valid_from: '2025-09-03', valid_to: null, coefficient: 0.99 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'PORT', vessel_name: 'BRAVO', valid_from: '2025-09-04', valid_to: null, coefficient: 0.89 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'PORT', vessel_name: 'DELTA', valid_from: '2025-09-05', valid_to: null, coefficient: 0.88 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'PORT', vessel_name: 'VLADIMIR', valid_from: '2025-09-06', valid_to: null, coefficient: 0.94 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'PORT', vessel_name: 'IVAN VIKULOV', valid_from: '2025-10-03', valid_to: null, coefficient: 0.9 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'PORT', vessel_name: 'DIANA MARIA', valid_from: '2025-11-04', valid_to: null, coefficient: 1.01 },
  // В СЕБЯ, starboard side
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'STARBOARD', vessel_name: null, valid_from: '2025-08-05', valid_to: null, coefficient: 0.98 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'STARBOARD', vessel_name: 'BETA', valid_from: '2025-08-05', valid_to: null, coefficient: 0.967 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'STARBOARD', vessel_name: 'IVAN VIKULOV', valid_from: '2025-09-09', valid_to: null, coefficient: 0.98 },
  { crane: 'CRANE # 1', operation_type: 'loading', side: 'STARBOARD', vessel_name: 'ALISA V', valid_from: '2025-10-14', valid_to: null, coefficient: 1.1 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'STARBOARD', vessel_name: null, valid_from: '2025-08-05', valid_to: null, coefficient: 1.09 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'STARBOARD', vessel_name: 'BETA', valid_from: '2025-08-05', valid_to: null, coefficient: 1.25 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'STARBOARD', vessel_name: 'IVAN VIKULOV', valid_from: '2025-09-09', valid_to: null, coefficient: 1.09 },
  { crane: 'CRANE # 2', operation_type: 'loading', side: 'STARBOARD', vessel_name: 'ALISA V', valid_from: '2025-10-14', valid_to: null, coefficient: 1.11 },
];
