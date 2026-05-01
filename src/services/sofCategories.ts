/**
 * Common SOF event categories with default descriptions, used by the
 * "Add event" form's quick-pick dropdown (TZ §10).
 */
export interface SofCategoryTemplate {
  key: string;
  label: string;
  defaultDescription: string;
}

export const SOF_CATEGORIES: readonly SofCategoryTemplate[] = [
  { key: 'arrival', label: 'Arrival', defaultDescription: 'Vessel arrived at anchorage / port' },
  { key: 'nor_tendered', label: 'NOR tendered', defaultDescription: 'Notice of Readiness tendered' },
  { key: 'nor_accepted', label: 'NOR accepted', defaultDescription: 'Notice of Readiness accepted' },
  { key: 'berthed', label: 'Berthed', defaultDescription: 'Vessel all fast at berth' },
  { key: 'loading_commenced', label: 'Loading commenced', defaultDescription: 'Loading operations commenced' },
  { key: 'loading_completed', label: 'Loading completed', defaultDescription: 'Loading operations completed' },
  { key: 'discharging_commenced', label: 'Discharging commenced', defaultDescription: 'Discharging operations commenced' },
  { key: 'discharging_completed', label: 'Discharging completed', defaultDescription: 'Discharging operations completed' },
  { key: 'shifting', label: 'Shifting', defaultDescription: 'Shifting from / to berth' },
  { key: 'waiting', label: 'Waiting', defaultDescription: 'Vessel waiting' },
  { key: 'weather', label: 'Weather', defaultDescription: 'Weather hold-up' },
  { key: 'formalities', label: 'Formalities', defaultDescription: 'Customs / agent / port formalities' },
  { key: 'bunkering', label: 'Bunkering', defaultDescription: 'Bunkering operations' },
  { key: 'maintenance', label: 'Maintenance', defaultDescription: 'Vessel maintenance / repair' },
  { key: 'cast_off', label: 'Cast off', defaultDescription: 'Vessel cast off' },
  { key: 'departure', label: 'Departure', defaultDescription: 'Vessel sailed' },
  { key: 'other', label: 'Other', defaultDescription: '' },
];
