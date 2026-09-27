/** Statement of Facts screen: summary tiles, overlap card, timeline, event dialog. */
export const en = {
  'sof.action.print': 'Print form',
  'sof.action.add': 'Add event',

  'sof.stat.events': 'Events in log',
  'sof.stat.events_note': '{range} · period {days} d',
  'sof.stat.working': 'Working time',
  'sof.stat.working_note': 'loading + discharging, overlaps once',
  'sof.stat.weather': 'Weather delay',
  'sof.stat.weather_note': '«Weather» events: {count}',
  'sof.stat.overlaps': 'Overlaps',
  'sof.stat.overlaps_note': 'needs correction',
  'sof.stat.overlaps_none': 'intervals do not overlap',

  'sof.overlap.text': 'Overlapping intervals {pairs}. Laytime needs one continuous sequence.',
  'sof.overlap.pair': '{date}: «{a}» and «{b}»',
  'sof.overlap.fix': 'Fix time',

  'sof.timeline.title': 'Timeline by day',
  'sof.timeline.no_end': 'no end time',

  'sof.group.loading': 'Loading',
  'sof.group.discharging': 'Discharging',
  'sof.group.weather': 'Weather',
  'sof.group.port': 'Port and formalities',
  'sof.group.other': 'Other',

  'sof.weekday.0': 'Sun',
  'sof.weekday.1': 'Mon',
  'sof.weekday.2': 'Tue',
  'sof.weekday.3': 'Wed',
  'sof.weekday.4': 'Thu',
  'sof.weekday.5': 'Fri',
  'sof.weekday.6': 'Sat',

  'sof.col.duration': 'Dur.',
  'sof.col.actions': 'Actions',
  'sof.row.edit': 'Edit',
  'sof.row.edit_aria': 'Edit event',
  'sof.footnote.count': 'Events: {count}',
  'sof.footnote.midnight': '{time} means the end of the day',

  'sof.empty.text': 'Record arrival, NOR, berthing, cargo operations and delays — the summary and the daily timeline are built from them.',

  'sof.delete.prompt': 'Delete «{label}» {date} {time}? The deletion is recorded in the audit log.',
  'sof.delete.submit': 'Delete',
  'sof.delete.cancel': 'Cancel',

  'sof.dialog.edit_title': 'Edit event',
  'sof.dialog.subtitle': 'Times as HH:MM; 24:00 closes the day. An event crossing midnight is two entries.',
  'sof.form.save': 'Save',
  'sof.form.cancel': 'Cancel',
  'sof.form.error.date': 'Enter the date.',
  'sof.form.error.time': 'Time must be HH:MM between 00:00 and 24:00.',
  'sof.form.error.from_midnight': '24:00 is only valid as an end time — start the next day at 00:00.',
  'sof.form.error.order': '«To» is earlier than «From».',
} as const;

export const ru: { [K in keyof typeof en]: string } = {
  'sof.action.print': 'Печатная форма',
  'sof.action.add': 'Добавить событие',

  'sof.stat.events': 'Событий в журнале',
  'sof.stat.events_note': '{range} · период {days} сут.',
  'sof.stat.working': 'Рабочее время',
  'sof.stat.working_note': 'погрузка + выгрузка, пересечения один раз',
  'sof.stat.weather': 'Простой по погоде',
  'sof.stat.weather_note': 'событий «Погода»: {count}',
  'sof.stat.overlaps': 'Пересечений',
  'sof.stat.overlaps_note': 'требует правки',
  'sof.stat.overlaps_none': 'интервалы не пересекаются',

  'sof.overlap.text': 'Пересечение интервалов {pairs}. Для подсчёта сталии нужен один непрерывный ряд.',
  'sof.overlap.pair': '{date}: «{a}» и «{b}»',
  'sof.overlap.fix': 'Исправить время',

  'sof.timeline.title': 'Хронология по суткам',
  'sof.timeline.no_end': 'без времени окончания',

  'sof.group.loading': 'Погрузка',
  'sof.group.discharging': 'Выгрузка',
  'sof.group.weather': 'Погода',
  'sof.group.port': 'Порт и формальности',
  'sof.group.other': 'Прочее',

  'sof.weekday.0': 'Вс',
  'sof.weekday.1': 'Пн',
  'sof.weekday.2': 'Вт',
  'sof.weekday.3': 'Ср',
  'sof.weekday.4': 'Чт',
  'sof.weekday.5': 'Пт',
  'sof.weekday.6': 'Сб',

  'sof.col.duration': 'Длит.',
  'sof.col.actions': 'Действия',
  'sof.row.edit': 'Изменить',
  'sof.row.edit_aria': 'Изменить событие',
  'sof.footnote.count': 'Событий: {count}',
  'sof.footnote.midnight': '{time} трактуется как конец суток',

  'sof.empty.text': 'Запишите прибытие, NOR, швартовку, грузовые операции и простои — по ним строятся сводка и хронология по суткам.',

  'sof.delete.prompt': 'Удалить «{label}» {date} {time}? Удаление попадёт в журнал аудита.',
  'sof.delete.submit': 'Удалить',
  'sof.delete.cancel': 'Отмена',

  'sof.dialog.edit_title': 'Изменить событие',
  'sof.dialog.subtitle': 'Время в формате ЧЧ:ММ; 24:00 закрывает сутки. Событие через полночь — две записи.',
  'sof.form.save': 'Сохранить',
  'sof.form.cancel': 'Отмена',
  'sof.form.error.date': 'Укажите дату.',
  'sof.form.error.time': 'Время — ЧЧ:ММ от 00:00 до 24:00.',
  'sof.form.error.from_midnight': '24:00 допустимо только как окончание — следующие сутки начинаются с 00:00.',
  'sof.form.error.order': '«По» раньше, чем «С».',
};
