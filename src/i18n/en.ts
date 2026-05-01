/**
 * Canonical English dictionary. The set of keys here defines the contract:
 * `ru.ts` must mirror this exactly (validated by tests).
 */
export const en = {
  // App shell / nav
  'app.brand': 'VesselAssistant',
  'app.nav.voyages': 'Voyages',
  'app.nav.reference': 'Reference',
  'app.nav.tools': 'Tools',
  'app.loading': 'Loading…',
  'app.db_error': 'Database error: {message}',
  'app.lang.en': 'EN',
  'app.lang.ru': 'RU',

  // Voyage page
  'voyage.title': 'Voyages',
  'voyage.new': 'New voyage',
  'voyage.seed_demo': 'Seed demo (KAVKAZ IV)',
  'voyage.closed_suffix': '(closed)',
  'voyage.empty_hint':
    'No voyages yet. Click <em>Seed demo</em> for the KAVKAZ IV baseline, or <em>New voyage</em> if you have already added a vessel in <strong>Reference</strong>.',
  'voyage.heading': 'Voyage {voyage_no} —',
  'voyage.status.open': 'open',
  'voyage.status.closed': 'closed',
  'voyage.close': 'Close voyage',

  // Voyage totals
  'voyage.totals.on_board': 'On Board',
  'voyage.totals.total_loaded': 'Total Loaded',
  'voyage.totals.total_discharged': 'Total Discharged',
  'voyage.totals.total_empty_100': 'Total Empty 100%',
  'voyage.totals.total_empty_98': 'Total Empty 98%',
  'voyage.totals.unit_t': 't',

  // Sub-tabs
  'voyage.subtab.holds': 'Holds',
  'voyage.subtab.sof': 'SOF ({count})',

  // New voyage form
  'voyage.form.no_vessels':
    'You need at least one vessel. Add one in <strong>Reference</strong> first.',
  'voyage.form.close': 'Close',
  'voyage.form.title': 'New voyage',
  'voyage.form.vessel': 'Vessel',
  'voyage.form.voyage_no': 'Voyage No',
  'voyage.form.voyage_no_placeholder': 'V-001',
  'voyage.form.create': 'Create',
  'voyage.form.cancel': 'Cancel',

  // Hold table
  'holds.col.hold': 'Hold',
  'holds.col.volume_m3': 'Volume m³',
  'holds.col.sf': 'SF',
  'holds.col.loaded': 'Loaded',
  'holds.col.discharged': 'Discharged',
  'holds.col.remain': 'Remain',
  'holds.col.capacity_98': 'Capacity 98%',
  'holds.col.empty_98': 'Empty 98%',
  'holds.col.empty_vol_pct': 'Empty Vol %',
  'holds.toggle_aria': 'Toggle hold details',
  'holds.lots.title_top': 'Lots in this hold (oldest → newest, top of stack is #{seq})',
  'holds.lots.title_empty': 'Lots in this hold (oldest → newest, top of stack is —)',
  'holds.lots.empty': 'No lots loaded yet.',
  'holds.lots.line':
    '#{seq} {vessel} — {cargo}{protein}, SF {sf}, loaded {loaded}, remain {remain} t',
  'holds.action.add_lot': '+ Add lot',
  'holds.action.discharge': '↓ Discharge',

  // Add lot form
  'lot.no_cargoes': 'Add at least one cargo in <strong>Reference</strong> first.',
  'lot.title': 'Add lot',
  'lot.source_vessel_placeholder': 'Source vessel',
  'lot.protein_none': 'Protein —',
  'lot.sf_placeholder': 'SF',
  'lot.tons_placeholder': 'Tons',
  'lot.add': 'Add',
  'lot.error.required': 'Source vessel, SF > 0 and tons > 0 are required',
  'lot.confirm.overload':
    'This load exceeds 98% capacity by {overshoot} t. Continue anyway?',

  // Discharge form
  'discharge.title': 'Discharge (LIFO)',
  'discharge.tons_placeholder': 'Tons',
  'discharge.description_placeholder': 'Description (optional)',
  'discharge.submit': 'Discharge',
  'discharge.error.tons_positive': 'Tons must be > 0',

  // SOF panel
  'sof.title': 'Statement of Facts',
  'sof.empty': 'No events yet.',
  'sof.warning.overlap_one': '⚠ {count} event with overlapping time interval — review highlighted rows.',
  'sof.warning.overlap_many': '⚠ {count} events with overlapping time interval — review highlighted rows.',
  'sof.col.date': 'Date',
  'sof.col.from': 'From',
  'sof.col.to': 'To',
  'sof.col.category': 'Category',
  'sof.col.description': 'Description',
  'sof.delete_aria': 'Delete event',

  // SOF add event form
  'sof.form.title': 'Add event',
  'sof.form.from_placeholder': 'From HH:MM',
  'sof.form.to_placeholder': 'To HH:MM',
  'sof.form.time_title': 'HH:MM (24:00 allowed as end-of-day)',
  'sof.form.description_placeholder': 'Description',
  'sof.form.add': 'Add',

  // SOF categories
  'sof.category.arrival': 'Arrival',
  'sof.category.nor_tendered': 'NOR tendered',
  'sof.category.nor_accepted': 'NOR accepted',
  'sof.category.berthed': 'Berthed',
  'sof.category.loading_commenced': 'Loading commenced',
  'sof.category.loading_completed': 'Loading completed',
  'sof.category.discharging_commenced': 'Discharging commenced',
  'sof.category.discharging_completed': 'Discharging completed',
  'sof.category.shifting': 'Shifting',
  'sof.category.waiting': 'Waiting',
  'sof.category.weather': 'Weather',
  'sof.category.formalities': 'Formalities',
  'sof.category.bunkering': 'Bunkering',
  'sof.category.maintenance': 'Maintenance',
  'sof.category.cast_off': 'Cast off',
  'sof.category.departure': 'Departure',
  'sof.category.other': 'Other',

  // Reference page
  'reference.title': 'Reference data',
  'reference.vessels.title': 'Vessels',
  'reference.vessels.col.name': 'Name',
  'reference.vessels.col.flag': 'Flag',
  'reference.vessels.col.owner': 'Owner',
  'reference.vessels.col.imo': 'IMO',
  'reference.vessels.col.holds': 'Holds',
  'reference.vessels.empty': 'No vessels yet.',
  'reference.vessels.add_title': 'Add vessel',
  'reference.vessels.name_placeholder': 'Name',
  'reference.vessels.flag_placeholder': 'Flag (optional)',
  'reference.vessels.add': 'Add',

  'reference.holds.title': 'Holds (per vessel)',
  'reference.holds.empty_vessel': 'No holds yet.',
  'reference.holds.no_vessels': 'Add a vessel first.',
  'reference.holds.add_title': 'Add hold',
  'reference.holds.no_placeholder': 'No',
  'reference.holds.volume_placeholder': 'Volume m³',
  'reference.holds.add': 'Add',

  'reference.cranes.title': 'Cranes',
  'reference.cranes.col.name': 'Name',
  'reference.cranes.col.notes': 'Notes',
  'reference.cranes.empty': 'No cranes yet.',
  'reference.cranes.add_title': 'Add crane',
  'reference.cranes.name_placeholder': 'Name (e.g. CRANE # 1)',
  'reference.cranes.notes_placeholder': 'Notes (optional)',
  'reference.cranes.add': 'Add',

  'reference.cargoes.title': 'Cargoes',
  'reference.cargoes.col.name': 'Name',
  'reference.cargoes.col.default_protein': 'Default protein',
  'reference.cargoes.empty': 'No cargoes yet.',
  'reference.cargoes.add_title': 'Add cargo',
  'reference.cargoes.name_placeholder': 'Name (e.g. WHEAT, SFM)',
  'reference.cargoes.protein_placeholder': 'Default protein %',
  'reference.cargoes.add': 'Add',

  // Crane corrections
  'crane.title': 'Crane corrections',
  'crane.no_cranes_hint': 'Add at least one crane above first.',
  'crane.filter.label': 'Filter by crane',
  'crane.filter.all': 'All cranes',
  'crane.col.crane': 'Crane',
  'crane.col.op_type': 'Op type',
  'crane.col.side': 'Side',
  'crane.col.vessel': 'Vessel',
  'crane.col.valid_from': 'Valid from',
  'crane.col.valid_to': 'Valid to',
  'crane.col.coefficient': 'Coefficient',
  'crane.empty': 'No coefficients yet.',
  'crane.side.any': 'any',
  'crane.vessel.any': 'any',
  'crane.add_title': 'Add coefficient',
  'crane.side.any_option': 'any side',
  'crane.vessel.any_option': 'any vessel',
  'crane.valid_to_placeholder': 'Valid to',
  'crane.coef_placeholder': 'Coef',
  'crane.add': 'Add',

  'crane.calc.title': 'Correction calculator',
  'crane.calc.scale_weight_placeholder': 'Scale weight',
  'crane.calc.calculate': 'Calculate',
  'crane.calc.error.scale_positive': 'Scale weight must be > 0',
  'crane.calc.scale_weight': 'Scale weight',
  'crane.calc.coefficient': 'Coefficient',
  'crane.calc.corrected_weight': 'Corrected weight',
  'crane.calc.unit_t': 't',

  // Tools page
  'tools.title': 'Tools',
  'tools.intro':
    'Project-level operations — local backup/restore (FR-14), Excel import from KAVKAZ IV-style templates (FR-12), and audit trail viewer (FR-10).',
  'tools.backup_section': 'Backup & restore',
  'tools.import_section': 'Import from Excel',
  'tools.audit_section': 'Audit log',

  // Backup panel
  'backup.title': 'Backup & restore',
  'backup.intro':
    'Export the entire project (all voyages, lots, layers, SOF events, documents, audit log) to a single JSON file. Import replaces the current project state.',
  'backup.export': 'Export backup',
  'backup.exporting': 'Exporting…',
  'backup.import': 'Import backup',
  'backup.importing': 'Importing…',
  'backup.dialog.save_title': 'Save backup',
  'backup.dialog.open_title': 'Open backup',
  'backup.confirm.import':
    'Importing this backup will WIPE all current project data and replace it with the backup contents. This cannot be undone. Continue?',
  'backup.confirm.import_title': 'Confirm import',
  'backup.confirm.reload':
    'Import complete. The app must reload to refresh in-memory state. Reload now?',
  'backup.confirm.reload_title': 'Reload app',
  'backup.info.saved': 'Backup saved to {path}',
  'backup.info.import_done': 'Import complete. Reload the app to see imported data.',

  // Import panel
  'import.title': 'Import',
  'import.intro':
    'Read a Load Stowage Plan + SOF workbook and stage the per-hold values for review before applying.',
  'import.pick_dialog_title': 'Select Load Stowage Plan + SOF (.xlsx)',
  'import.reading': 'Reading…',
  'import.pick': 'Import KAVKAZ IV-style xlsx',
  'import.applied': 'Imported. Voyage id: {id}. Switch to the Voyages tab to review it.',
  'import.preview.title': 'Preview',
  'import.preview.vessel': 'Vessel',
  'import.preview.voyage_no': 'Voyage No',
  'import.preview.voyage_no_auto': '(auto)',
  'import.preview.loading_port': 'Loading port',
  'import.preview.discharging_port': 'Discharging port',
  'import.preview.col.hold': 'Hold',
  'import.preview.col.volume_m3': 'Volume m³',
  'import.preview.col.sf': 'SF',
  'import.preview.col.cargo': 'Cargo',
  'import.preview.col.loaded': 'Loaded',
  'import.preview.col.discharged': 'Discharged',
  'import.preview.applying': 'Applying…',
  'import.preview.apply': 'Apply',
  'import.preview.cancel': 'Cancel',

  // Audit log
  'audit.title': 'Audit log',
  'audit.intro': 'Latest 200 changes recorded by the database. Read-only.',
  'audit.entity_label': 'Entity:',
  'audit.entity_all': 'All',
  'audit.loading': 'Loading…',
  'audit.empty': 'No audit entries.',
  'audit.col.time': 'Time',
  'audit.col.entity': 'Entity',
  'audit.col.id': 'Id',
  'audit.col.action': 'Action',
  'audit.col.diff': 'Diff',

  // Export
  'export.dialog.title': 'Save Load Plan',
  'export.button': 'Export Load Plan (XLSX)',
  'export.exporting': 'Exporting…',

  // Demo / test
  'demo.with-param': 'Hello {name}',
} as const;
