/**
 * Canonical English dictionary. The set of keys here defines the contract:
 * `ru.ts` must mirror this exactly (validated by tests).
 */
import { partsEn } from './parts';

export const en = {
  ...partsEn,

  // App shell / nav
  'app.nav.voyages': 'Voyages',
  'app.loading': 'Loading…',
  'app.db_error': 'Database error: {message}',
  'app.crashed': 'Something went wrong. The error has been written to the log.',
  'app.reload': 'Reload',

  // Operator session (FR-10)
  'session.title': 'Operator sign-in',
  'session.name': 'Name',
  'session.role': 'Role',
  'session.role.operator': 'Operator',
  'session.role.supervisor': 'Supervisor',
  'session.role.admin': 'Administrator',
  'session.role.viewer': 'Viewer',
  'session.start': 'Start',
  'session.name_required': 'Enter your name.',

  // Service errors (AppError codes, rendered by describeError)
  'error.voyage.not_found': 'Voyage not found.',
  'error.hold.not_found': 'Hold not found.',
  'error.ogv.insufficient_cargo': 'Not enough cargo in hold {hold_no}: {short_tons} t short',
  'error.voyage.closed': 'Voyage {voyage_no} is closed. Only a supervisor or administrator can change it, with a reason.',
  'error.voyage.closed_reason_required': 'Enter a reason to change a closed voyage.',
  'error.protein.invalid': 'Protein {value}% is not allowed. Allowed: 10.5, 11.5, 12.5, 13.5.',
  'error.backup.failed': 'Automatic backup failed: {message}',
  'error.batch.stale': 'The data changed while saving. Reload and try again.',
  'error.crane.no_coefficient': 'No working crane coefficient for this mode on {date}. Add one in Crane correction.',
  'error.ogv.not_found': 'This voyage has no ocean-going vessel yet.',
  'error.ogv.hold_not_found': 'Hold of the ocean-going vessel not found.',
  'error.unexpected': 'Unexpected error. Details have been written to the log.',

  // Voyage page
  'voyage.new': 'New voyage',
  'voyage.seed_demo': 'KAVKAZ IV demo data',
  'voyage.closed_suffix': '(closed)',
  'voyage.heading': 'Voyage {voyage_no}',
  'voyage.status.open': 'open',
  'voyage.status.closed': 'closed',
  'voyage.close': 'Close voyage',
  'voyage.close.confirm': 'Close voyage {voyage_no}? A closed voyage cannot be reopened. An automatic backup is taken first.',
  'voyage.copy': 'Copy voyage',
  'voyage.copy.voyage_no': 'New voyage No',
  'voyage.copy.submit': 'Create copy',
  'voyage.copy.cancel': 'Cancel',

  // Voyage totals
  'voyage.totals.on_board': 'On Board',
  'voyage.totals.total_loaded': 'Total Loaded',
  'voyage.totals.total_discharged': 'Total Discharged',
  'voyage.totals.total_empty_100': 'Total Empty 100%',
  'voyage.totals.total_empty_98': 'Total Empty 98%',
  'voyage.totals.unit_t': 't',

  // New voyage form
  'voyage.form.title': 'New voyage',
  'voyage.form.vessel': 'Vessel',
  'voyage.form.voyage_no': 'Voyage No',
  'voyage.form.voyage_no_placeholder': 'V-001',
  'voyage.form.create': 'Create',
  'voyage.form.cancel': 'Cancel',

  // Hold table
  'holds.col.hold': 'Hold',
  'holds.col.volume_m3': 'Volume, m³',
  'holds.col.sf': 'SF',
  'holds.col.loaded': 'Loaded',
  'holds.col.discharged': 'Discharged',
  'holds.col.remain': 'Remain',
  'holds.col.capacity_98': 'Capacity 98%',
  'holds.col.empty_98': 'Empty 98%',
  'holds.col.empty_vol_pct': 'Empty, %',
  'holds.action.add_lot': 'Add lot',
  'holds.action.discharge': 'Discharge',
  'holds.error.no_sf': 'SF not set',

  // Discharge form
  'discharge.description_placeholder': 'Description (optional)',

  // SOF panel
  'sof.title': 'Statement of Facts',
  'sof.empty': 'No events yet.',
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

  // Backup panel
  'backup.dialog.save_title': 'Save backup',
  'backup.dialog.open_title': 'Open backup',

  // Import panel
  'import.pick_dialog_title': 'Select Load Stowage Plan + SOF (.xlsx)',
  'import.reading': 'Reading…',
  'import.preview.vessel': 'Vessel',
  'import.preview.voyage_no': 'Voyage No',
  'import.preview.voyage_no_auto': '(auto)',
  'import.preview.loading_port': 'Loading port',
  'import.preview.discharging_port': 'Discharging port',
  'import.preview.col.hold': 'Hold',
  'import.preview.col.sf': 'SF',
  'import.preview.col.cargo': 'Cargo',
  'import.preview.applying': 'Applying…',
  'import.preview.apply': 'Apply',
  'import.preview.cancel': 'Cancel',
  'import.rejected_row': 'Sheet {sheet}, cell {cell} (hold {hold_no}) was not imported: {reason}',

  // Audit log
  'audit.entity_all': 'All',
  'audit.col.time': 'Time',
  'audit.col.entity': 'Entity',
  'audit.col.id': 'Id',
  'audit.col.action': 'Action',
  'audit.col.diff': 'Diff',
  'audit.col.user': 'User',
  'audit.col.role': 'Role',
  'audit.col.reason': 'Reason',
  'audit.export.dialog.title': 'Save voyage audit log',
  'audit.export.button': 'Export audit log (XLSX)',
  'audit.export.exporting': 'Exporting…',

  // Export
  'export.dialog.title': 'Save Load Plan',
  'export.button': 'Export',
  'export.exporting': 'Exporting…',

  // Demo / test
  'demo.with-param': 'Hello {name}',
} as const;
