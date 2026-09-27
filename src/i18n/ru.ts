import { en } from './en';
import { partsRu } from './parts';

/**
 * Russian dictionary. Must mirror every key in `en`. The shape is enforced
 * statically (every English key is required) and at runtime by tests.
 */
type Dict = { [K in keyof typeof en]: string };

export const ru: Dict = {
  ...partsRu,

  // App shell / nav
  'app.nav.voyages': 'Рейсы',
  'app.loading': 'Загрузка…',
  'app.db_error': 'Ошибка базы данных: {message}',
  'app.crashed': 'Произошла ошибка. Она записана в журнал.',
  'app.reload': 'Перезагрузить',

  // Operator session (FR-10)
  'session.title': 'Вход оператора',
  'session.name': 'Имя',
  'session.role': 'Роль',
  'session.role.operator': 'Оператор',
  'session.role.supervisor': 'Супервайзер',
  'session.role.admin': 'Администратор',
  'session.role.viewer': 'Наблюдатель',
  'session.start': 'Начать работу',
  'session.name_required': 'Укажите имя.',

  // Service errors (AppError codes, rendered by describeError)
  'error.voyage.not_found': 'Рейс не найден.',
  'error.hold.not_found': 'Трюм не найден.',
  'error.ogv.insufficient_cargo': 'Недостаточно груза в трюме {hold_no}: не хватает {short_tons} т',
  'error.voyage.closed': 'Рейс {voyage_no} закрыт. Изменить его может только супервайзер или администратор с указанием причины.',
  'error.voyage.closed_reason_required': 'Укажите причину изменения закрытого рейса.',
  'error.protein.invalid': 'Протеин {value}% недопустим. Разрешены: 10.5, 11.5, 12.5, 13.5.',
  'error.backup.failed': 'Автоматическая копия не создана: {message}',
  'error.batch.stale': 'Данные изменились во время сохранения. Обновите страницу и повторите.',
  'error.unexpected': 'Непредвиденная ошибка. Подробности записаны в журнал.',

  // Voyage page
  'voyage.new': 'Новый рейс',
  'voyage.seed_demo': 'Демо-данные KAVKAZ IV',
  'voyage.closed_suffix': '(закрыт)',
  'voyage.heading': 'Рейс {voyage_no}',
  'voyage.status.open': 'открыт',
  'voyage.status.closed': 'закрыт',
  'voyage.close': 'Закрыть рейс',
  'voyage.close.confirm': 'Закрыть рейс {voyage_no}? Закрытый рейс нельзя открыть снова. Перед закрытием создаётся автоматическая копия.',
  'voyage.copy': 'Копировать рейс',
  'voyage.copy.voyage_no': 'Номер нового рейса',
  'voyage.copy.submit': 'Создать копию',
  'voyage.copy.cancel': 'Отмена',

  // Voyage totals
  'voyage.totals.on_board': 'На борту',
  'voyage.totals.total_loaded': 'Всего погружено',
  'voyage.totals.total_discharged': 'Всего выгружено',
  'voyage.totals.total_empty_100': 'Свободно 100%',
  'voyage.totals.total_empty_98': 'Свободно 98%',
  'voyage.totals.unit_t': 'т',

  // New voyage form
  'voyage.form.title': 'Новый рейс',
  'voyage.form.vessel': 'Судно',
  'voyage.form.voyage_no': 'Номер рейса',
  'voyage.form.voyage_no_placeholder': 'V-001',
  'voyage.form.create': 'Создать',
  'voyage.form.cancel': 'Отмена',

  // Hold table
  'holds.col.hold': 'Трюм',
  'holds.col.volume_m3': 'Объём, м³',
  'holds.col.sf': 'SF',
  'holds.col.loaded': 'Погружено',
  'holds.col.discharged': 'Выгружено',
  'holds.col.remain': 'Остаток',
  'holds.col.capacity_98': 'Вмест. 98%',
  'holds.col.empty_98': 'Свободно 98%',
  'holds.col.empty_vol_pct': 'Пусто, %',
  'holds.action.add_lot': 'Добавить партию',
  'holds.action.discharge': 'Выгрузка',
  'holds.error.no_sf': 'не задан SF',

  // Discharge form
  'discharge.description_placeholder': 'Описание (необязательно)',

  // SOF panel
  'sof.title': 'Statement of Facts',
  'sof.empty': 'Событий пока нет.',
  'sof.col.date': 'Дата',
  'sof.col.from': 'С',
  'sof.col.to': 'По',
  'sof.col.category': 'Категория',
  'sof.col.description': 'Описание',
  'sof.delete_aria': 'Удалить событие',

  // SOF add event form
  'sof.form.title': 'Добавить событие',
  'sof.form.from_placeholder': 'С ЧЧ:ММ',
  'sof.form.to_placeholder': 'По ЧЧ:ММ',
  'sof.form.time_title': 'ЧЧ:ММ (24:00 допускается как конец суток)',
  'sof.form.description_placeholder': 'Описание',
  'sof.form.add': 'Добавить',

  // SOF categories
  'sof.category.arrival': 'Прибытие',
  'sof.category.nor_tendered': 'NOR подан',
  'sof.category.nor_accepted': 'NOR принят',
  'sof.category.berthed': 'Швартовка',
  'sof.category.loading_commenced': 'Начало погрузки',
  'sof.category.loading_completed': 'Окончание погрузки',
  'sof.category.discharging_commenced': 'Начало выгрузки',
  'sof.category.discharging_completed': 'Окончание выгрузки',
  'sof.category.shifting': 'Перешвартовка',
  'sof.category.waiting': 'Ожидание',
  'sof.category.weather': 'Погода',
  'sof.category.formalities': 'Формальности',
  'sof.category.bunkering': 'Бункеровка',
  'sof.category.maintenance': 'Обслуживание',
  'sof.category.cast_off': 'Отшвартовка',
  'sof.category.departure': 'Отход',
  'sof.category.other': 'Прочее',

  // Reference page
  'reference.title': 'Справочники',

  // Backup panel
  'backup.dialog.save_title': 'Сохранить бэкап',
  'backup.dialog.open_title': 'Открыть бэкап',

  // Import panel
  'import.pick_dialog_title': 'Выберите Load Stowage Plan + SOF (.xlsx)',
  'import.reading': 'Чтение…',
  'import.preview.vessel': 'Судно',
  'import.preview.voyage_no': 'Номер рейса',
  'import.preview.voyage_no_auto': '(авто)',
  'import.preview.loading_port': 'Порт погрузки',
  'import.preview.discharging_port': 'Порт выгрузки',
  'import.preview.col.hold': 'Трюм',
  'import.preview.col.sf': 'SF',
  'import.preview.col.cargo': 'Груз',
  'import.preview.applying': 'Применение…',
  'import.preview.apply': 'Применить',
  'import.preview.cancel': 'Отмена',
  'import.rejected_row': 'Лист {sheet}, ячейка {cell} (трюм {hold_no}) не импортирована: {reason}',

  // Audit log
  'audit.entity_all': 'Все',
  'audit.col.time': 'Время',
  'audit.col.entity': 'Сущность',
  'audit.col.id': 'Id',
  'audit.col.action': 'Действие',
  'audit.col.diff': 'Изменения',
  'audit.col.user': 'Пользователь',
  'audit.col.role': 'Роль',
  'audit.col.reason': 'Причина',
  'audit.export.dialog.title': 'Сохранить журнал аудита рейса',
  'audit.export.button': 'Экспорт журнала аудита (XLSX)',
  'audit.export.exporting': 'Экспорт…',

  // Export
  'export.dialog.title': 'Сохранить Load Plan',
  'export.button': 'Экспорт',
  'export.exporting': 'Экспорт…',

  // Demo / test
  'demo.with-param': 'Привет, {name}',
};
