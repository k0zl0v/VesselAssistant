/** Load / Stowage Plan screen: hold table, totals, toolbar. */
export const en = {
  'holds.col.cargo': 'Cargo',
  'holds.col.fill_98': 'Fill to 98%',
  'holds.lots_count': 'lots: {count}',
  'holds.totals': 'Voyage total',
  'holds.totals_empty_100': 'Empty 100%:',
  'holds.negative.title': 'Negative remain',
  'holds.negative.text': 'Hold {holds}: more was discharged than is recorded as loaded — plan and fact disagree.',
  'holds.negative.hint': 'Check the OGV operations of these holds or enter a correction.',
  'holds.negative.action': 'Show operations',
  'holds.no_holds.title': 'The vessel has no holds',
  'holds.no_holds.text': 'Add holds with their volumes in Reference data — capacity is calculated from them.',
  'holds.search': 'Hold, cargo…',
  'holds.filter.all': 'All cargoes',
  'holds.footnote': 'All values are rounded to 0.000 and calculated from the SF of the specific hold. Totals are not editable — recalculation only.',
} as const;

export const ru: { [K in keyof typeof en]: string } = {
  'holds.col.cargo': 'Груз',
  'holds.col.fill_98': 'Заполнение к 98%',
  'holds.lots_count': 'партий: {count}',
  'holds.totals': 'Итого по рейсу',
  'holds.totals_empty_100': 'Empty 100%:',
  'holds.negative.title': 'Отрицательный остаток',
  'holds.negative.text': 'Трюм {holds}: выгружено больше, чем числится загруженным — план и факт разошлись.',
  'holds.negative.hint': 'Проверьте операции OGV по этим трюмам или внесите корректировку.',
  'holds.negative.action': 'Показать операции',
  'holds.no_holds.title': 'У судна нет трюмов',
  'holds.no_holds.text': 'Добавьте трюмы с объёмами в справочниках — от них считается вместимость.',
  'holds.search': 'Трюм, груз…',
  'holds.filter.all': 'Все грузы',
  'holds.footnote': 'Все значения округлены до 0.000 и рассчитаны от SF конкретного трюма. Итоговые поля не редактируются — только пересчёт.',
} as const;
