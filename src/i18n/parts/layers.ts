/** Cargo layers screen: LIFO stacks per hold, remains by source vessel, discharge history. */
export const en = {
  'layers.title': 'Cargo layers by hold',
  'layers.lifo_note': 'Strict LIFO write-off — top layer first',
  'layers.action.discharge': 'Discharge from hold',

  'layers.legend.discharged': 'Discharged',
  'layers.legend.capacity': 'Capacity 98 %',
  'layers.legend.scale': 'Block height is proportional to loaded tons',

  'layers.layer': 'LAYER {n}',
  'layers.layer_top': 'LAYER {n} · TOP',
  'layers.layer_closed': 'layer closed',
  'layers.stacks_label': 'Layer stacks by hold, top layer first',

  'layers.hold': 'Hold No.{no}',
  'layers.hold.sf': 'SF {sf}',
  'layers.hold.no_sf': 'SF —',
  'layers.hold.remain': 'Remain',
  'layers.hold.free_98': 'Free 98 %',
  'layers.hold.select': 'Select hold No.{no} for discharge',

  'layers.sources.title': 'Remains by source vessel',
  'layers.sources.subtitle': 'FR-18 · sum over all holds',
  'layers.sources.holds': 'holds {holds}',
  'layers.sources.written_off': 'written off in {holds}',
  'layers.sources.on_board': 'Total on board',

  'layers.history.title': 'Discharge history',
  'layers.history.subtitle': 'Which layers each discharge closed',
  'layers.history.op': 'OGV-{n}',
  'layers.history.hold': 'Hold No.{no}',
  'layers.history.remain': 'remain {tons}',
  'layers.history.empty': 'No discharges yet — every layer is intact.',
  'layers.history.by_scale': 'by scale',
  'layers.history.crane': '{crane} · {mode} · k {k} → {tons} t',
  'layers.history.crane_only': '{crane} · no crane-sheet line',
  'layers.history.no_crane': 'no crane recorded',
  'layers.history.ogv_hold': '→ OGV hold №{no}',
  'layers.footnote':
    'A lower layer cannot be picked by hand. A correction is a separate operation with a reason and an audit log entry.',

  'layers.empty.title': 'No lots loaded yet',
  'layers.empty.text': 'Layers appear after the first lot. Each new lot in a hold becomes its top layer.',
  'layers.error.title': 'Cargo layers could not be read',
} as const;

export const ru: { [K in keyof typeof en]: string } = {
  'layers.title': 'Слои груза по трюмам',
  'layers.lifo_note': 'Списание строго LIFO — верхний слой первым',
  'layers.action.discharge': 'Выгрузить из трюма',

  'layers.legend.discharged': 'Списано',
  'layers.legend.capacity': 'Вместимость 98 %',
  'layers.legend.scale': 'Высота блока пропорциональна погруженным тоннам',

  'layers.layer': 'СЛОЙ {n}',
  'layers.layer_top': 'СЛОЙ {n} · ВЕРХ',
  'layers.layer_closed': 'слой закрыт',
  'layers.stacks_label': 'Стеки слоёв по трюмам, верхний слой первым',

  'layers.hold': 'Трюм №{no}',
  'layers.hold.sf': 'SF {sf}',
  'layers.hold.no_sf': 'SF —',
  'layers.hold.remain': 'Остаток',
  'layers.hold.free_98': 'Свободно 98 %',
  'layers.hold.select': 'Выбрать трюм №{no} для выгрузки',

  'layers.sources.title': 'Остатки по судам-источникам',
  'layers.sources.subtitle': 'FR-18 · сумма по всем трюмам',
  'layers.sources.holds': 'трюмы {holds}',
  'layers.sources.written_off': 'в {holds} списан',
  'layers.sources.on_board': 'Итого на борту',

  'layers.history.title': 'История списания',
  'layers.history.subtitle': 'Какие слои закрыла каждая выгрузка',
  'layers.history.op': 'OGV-{n}',
  'layers.history.hold': 'Трюм №{no}',
  'layers.history.remain': 'остаток {tons}',
  'layers.history.empty': 'Выгрузок ещё не было — все слои целы.',
  'layers.history.by_scale': 'по весам',
  'layers.history.crane': '{crane} · {mode} · k {k} → {tons} т',
  'layers.history.crane_only': '{crane} · без строки CRANE CORR.',
  'layers.history.no_crane': 'кран не указан',
  'layers.history.ogv_hold': '→ трюм OGV №{no}',
  'layers.footnote':
    'Выбрать нижний слой вручную нельзя. Корректировка — отдельной операцией с причиной и записью в журнал аудита.',

  'layers.empty.title': 'Партий ещё нет',
  'layers.empty.text': 'Слои появятся после первой партии. Каждая новая партия ложится в трюм верхним слоем.',
  'layers.error.title': 'Слои груза не прочитаны',
};
