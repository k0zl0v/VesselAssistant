/** Sheet name as DocumentEngine writes it: Excel allows ≤ 31 chars and none of [ ] : * ? / \ */
export function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, '_').slice(0, 31);
}

export type SheetKey = 'load_plan' | 'sof' | 'ogv' | 'crane';

export interface WorkbookSheet {
  key: SheetKey;
  /** The tab name inside the XLSX — file content, so it is not translated. */
  name: string;
}

/** Fixed order of DocumentEngine.generateLoadPlan: the Load Plan opens first, then SOF → OGV → CRANE CORR. */
export function workbookSheets(vessel_name: string): WorkbookSheet[] {
  return [
    { key: 'load_plan', name: sheetName(vessel_name) },
    { key: 'sof', name: 'SOF' },
    { key: 'ogv', name: 'OGV' },
    { key: 'crane', name: 'CRANE CORR.' },
  ];
}
