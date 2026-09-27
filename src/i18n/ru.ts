import { en } from './en';

/**
 * Russian dictionary. Must mirror every key in `en`. The shape is enforced
 * statically (every English key is required) and at runtime by tests.
 */
type Dict = { [K in keyof typeof en]: string };

export const ru: Dict = {
  // App shell / nav
  'app.brand': 'VesselAssistant',
  'app.nav.voyages': 'Рейсы',
  'app.nav.reference': 'Справочники',
  'app.nav.tools': 'Инструменты',
  'app.loading': 'Загрузка…',
  'app.db_error': 'Ошибка базы данных: {message}',
  'app.lang.en': 'EN',
  'app.lang.ru': 'RU',
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
  'voyage.title': 'Рейсы',
  'voyage.new': 'Новый рейс',
  'voyage.seed_demo': 'Заполнить демо (KAVKAZ IV)',
  'voyage.closed_suffix': '(закрыт)',
  'voyage.empty_hint':
    'Рейсов пока нет. Нажмите <em>Заполнить демо</em> для базового рейса KAVKAZ IV или <em>Новый рейс</em>, если судно уже добавлено в <strong>Справочниках</strong>.',
  'voyage.heading': 'Рейс {voyage_no} —',
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

  // Sub-tabs
  'voyage.subtab.holds': 'Трюмы',
  'voyage.subtab.sof': 'SOF ({count})',

  // New voyage form
  'voyage.form.no_vessels':
    'Сначала добавьте хотя бы одно судно в <strong>Справочниках</strong>.',
  'voyage.form.close': 'Закрыть',
  'voyage.form.title': 'Новый рейс',
  'voyage.form.vessel': 'Судно',
  'voyage.form.voyage_no': 'Номер рейса',
  'voyage.form.voyage_no_placeholder': 'V-001',
  'voyage.form.create': 'Создать',
  'voyage.form.cancel': 'Отмена',

  // Hold table
  'holds.col.hold': 'Трюм',
  'holds.col.volume_m3': 'Объём м³',
  'holds.col.sf': 'SF',
  'holds.col.loaded': 'Погружено',
  'holds.col.discharged': 'Выгружено',
  'holds.col.remain': 'Остаток',
  'holds.col.capacity_98': 'Вмест. 98%',
  'holds.col.empty_98': 'Свободно 98%',
  'holds.col.empty_vol_pct': 'Свободно об. %',
  'holds.toggle_aria': 'Раскрыть детали трюма',
  'holds.lots.title_top': 'Партии в трюме (старые → новые, верх стека: #{seq})',
  'holds.lots.title_empty': 'Партии в трюме (старые → новые, верх стека: —)',
  'holds.lots.empty': 'Партии ещё не загружены.',
  'holds.lots.line':
    '#{seq} {vessel} — {cargo}{protein}, SF {sf}, погружено {loaded}, остаток {remain} т',
  'holds.action.add_lot': '+ Добавить партию',
  'holds.action.discharge': '↓ Выгрузить',

  // Add lot form
  'lot.no_cargoes': 'Сначала добавьте хотя бы один груз в <strong>Справочниках</strong>.',
  'lot.title': 'Добавить партию',
  'lot.source_vessel_placeholder': 'Судно-источник',
  'lot.protein_none': 'Протеин —',
  'lot.sf_placeholder': 'SF',
  'lot.tons_placeholder': 'Тонны',
  'lot.add': 'Добавить',
  'lot.error.required': 'Нужны судно-источник, SF > 0 и тонны > 0',
  'lot.confirm.overload':
    'Эта погрузка превышает 98% вместимости на {overshoot} т. Продолжить?',

  // Discharge form
  'discharge.title': 'Выгрузка (LIFO)',
  'discharge.tons_placeholder': 'Тонны',
  'discharge.description_placeholder': 'Описание (необязательно)',
  'discharge.submit': 'Выгрузить',
  'discharge.error.tons_positive': 'Тонны должны быть > 0',

  // SOF panel
  'sof.title': 'Statement of Facts',
  'sof.empty': 'Событий пока нет.',
  'sof.warning.overlap_one': '⚠ {count} событие с пересекающимся интервалом — проверьте подсвеченные строки.',
  'sof.warning.overlap_many': '⚠ {count} событий с пересекающимися интервалами — проверьте подсвеченные строки.',
  'sof.col.date': 'Дата',
  'sof.col.from': 'С',
  'sof.col.to': 'По',
  'sof.col.category': 'Категория',
  'sof.col.description': 'Описание',
  'sof.delete_aria': 'Удалить событие',
  'sof.delete.confirm': 'Удалить это событие SOF?',

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
  'reference.vessels.title': 'Суда',
  'reference.vessels.col.name': 'Название',
  'reference.vessels.col.flag': 'Флаг',
  'reference.vessels.col.owner': 'Владелец',
  'reference.vessels.col.imo': 'IMO',
  'reference.vessels.col.holds': 'Трюмов',
  'reference.vessels.empty': 'Судов пока нет.',
  'reference.vessels.add_title': 'Добавить судно',
  'reference.vessels.name_placeholder': 'Название',
  'reference.vessels.flag_placeholder': 'Флаг (необязательно)',
  'reference.vessels.add': 'Добавить',

  'reference.holds.title': 'Трюмы (по судам)',
  'reference.holds.empty_vessel': 'Трюмов пока нет.',
  'reference.holds.no_vessels': 'Сначала добавьте судно.',
  'reference.holds.add_title': 'Добавить трюм',
  'reference.holds.no_placeholder': '№',
  'reference.holds.volume_placeholder': 'Объём м³',
  'reference.holds.add': 'Добавить',

  'reference.cranes.title': 'Краны',
  'reference.cranes.col.name': 'Название',
  'reference.cranes.col.notes': 'Примечания',
  'reference.cranes.empty': 'Кранов пока нет.',
  'reference.cranes.add_title': 'Добавить кран',
  'reference.cranes.name_placeholder': 'Название (например, CRANE # 1)',
  'reference.cranes.notes_placeholder': 'Примечания (необязательно)',
  'reference.cranes.add': 'Добавить',

  'reference.cargoes.title': 'Грузы',
  'reference.cargoes.col.name': 'Название',
  'reference.cargoes.col.default_protein': 'Протеин по умолчанию',
  'reference.cargoes.empty': 'Грузов пока нет.',
  'reference.cargoes.add_title': 'Добавить груз',
  'reference.cargoes.name_placeholder': 'Название (например, WHEAT, SFM)',
  'reference.cargoes.protein_placeholder': 'Протеин %',
  'reference.cargoes.add': 'Добавить',

  // Crane corrections
  'crane.title': 'Поправки кранов',
  'crane.no_cranes_hint': 'Сначала добавьте хотя бы один кран выше.',
  'crane.filter.label': 'Фильтр по крану',
  'crane.filter.all': 'Все краны',
  'crane.col.crane': 'Кран',
  'crane.col.op_type': 'Тип операции',
  'crane.col.side': 'Борт',
  'crane.col.vessel': 'Судно',
  'crane.col.valid_from': 'Действ. с',
  'crane.col.valid_to': 'Действ. по',
  'crane.col.coefficient': 'Коэффициент',
  'crane.empty': 'Коэффициентов пока нет.',
  'crane.side.any': 'любой',
  'crane.vessel.any': 'любое',
  'crane.add_title': 'Добавить коэффициент',
  'crane.side.any_option': 'любой борт',
  'crane.vessel.any_option': 'любое судно',
  'crane.valid_to_placeholder': 'Действ. по',
  'crane.coef_placeholder': 'Коэф.',
  'crane.add': 'Добавить',

  'crane.calc.title': 'Калькулятор поправки',
  'crane.calc.scale_weight_placeholder': 'Вес по весам',
  'crane.calc.calculate': 'Рассчитать',
  'crane.calc.error.scale_positive': 'Вес по весам должен быть > 0',
  'crane.calc.scale_weight': 'Вес по весам',
  'crane.calc.coefficient': 'Коэффициент',
  'crane.calc.corrected_weight': 'Скорректированный вес',
  'crane.calc.unit_t': 'т',

  // Tools page
  'tools.title': 'Инструменты',
  'tools.intro':
    'Операции уровня проекта — локальный бэкап/восстановление (FR-14), импорт Excel из шаблонов KAVKAZ IV (FR-12) и просмотр аудит-лога (FR-10).',
  'tools.backup_section': 'Бэкап и восстановление',
  'tools.import_section': 'Импорт из Excel',
  'tools.audit_section': 'Аудит-лог',

  // Backup panel
  'backup.title': 'Бэкап и восстановление',
  'backup.intro':
    'Выгрузить весь проект (все рейсы, партии, слои, SOF-события, документы, аудит-лог) в один JSON-файл. Импорт заменяет текущее состояние проекта.',
  'backup.export': 'Экспорт бэкапа',
  'backup.exporting': 'Экспорт…',
  'backup.import': 'Импорт бэкапа',
  'backup.importing': 'Импорт…',
  'backup.dialog.save_title': 'Сохранить бэкап',
  'backup.dialog.open_title': 'Открыть бэкап',
  'backup.confirm.import':
    'Импорт этого бэкапа СОТРЁТ все текущие данные проекта и заменит их содержимым бэкапа. Отменить нельзя. Продолжить?',
  'backup.confirm.import_title': 'Подтвердите импорт',
  'backup.confirm.reload':
    'Импорт завершён. Приложение должно перезагрузиться, чтобы обновить состояние. Перезагрузить сейчас?',
  'backup.confirm.reload_title': 'Перезагрузить приложение',
  'backup.info.saved': 'Бэкап сохранён в {path}',
  'backup.info.import_done': 'Импорт завершён. Перезагрузите приложение, чтобы увидеть импортированные данные.',

  // Import panel
  'import.title': 'Импорт',
  'import.intro':
    'Прочитать книгу Load Stowage Plan + SOF и подготовить значения по трюмам для проверки перед применением.',
  'import.pick_dialog_title': 'Выберите Load Stowage Plan + SOF (.xlsx)',
  'import.reading': 'Чтение…',
  'import.pick': 'Импорт xlsx (формат KAVKAZ IV)',
  'import.applied': 'Импортировано. Идентификатор рейса: {id}. Откройте вкладку «Рейсы» для проверки.',
  'import.preview.title': 'Предпросмотр',
  'import.preview.vessel': 'Судно',
  'import.preview.voyage_no': 'Номер рейса',
  'import.preview.voyage_no_auto': '(авто)',
  'import.preview.loading_port': 'Порт погрузки',
  'import.preview.discharging_port': 'Порт выгрузки',
  'import.preview.col.hold': 'Трюм',
  'import.preview.col.volume_m3': 'Объём м³',
  'import.preview.col.sf': 'SF',
  'import.preview.col.cargo': 'Груз',
  'import.preview.col.loaded': 'Погружено',
  'import.preview.col.discharged': 'Выгружено',
  'import.preview.applying': 'Применение…',
  'import.preview.apply': 'Применить',
  'import.preview.cancel': 'Отмена',
  'import.rejected_row': 'Лист {sheet}, ячейка {cell} (трюм {hold_no}) не импортирована: {reason}',

  // Audit log
  'audit.title': 'Аудит-лог',
  'audit.intro': 'Последние 200 изменений в базе данных. Только для чтения.',
  'audit.entity_label': 'Сущность:',
  'audit.entity_all': 'Все',
  'audit.loading': 'Загрузка…',
  'audit.empty': 'Записей аудита нет.',
  'audit.col.time': 'Время',
  'audit.col.entity': 'Сущность',
  'audit.col.id': 'Id',
  'audit.col.action': 'Действие',
  'audit.col.diff': 'Изменения',
  'audit.col.user': 'Пользователь',
  'audit.col.role': 'Роль',
  'audit.col.reason': 'Причина',

  // Export
  'export.dialog.title': 'Сохранить Load Plan',
  'export.button': 'Экспорт Load Plan (XLSX)',
  'export.exporting': 'Экспорт…',

  // Demo / test
  'demo.with-param': 'Привет, {name}',
};
