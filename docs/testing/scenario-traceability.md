# Трассировка сценариев S-1..S-14

Соответствие между пользовательскими сценариями `Requirements/scenarios.md` (vault, проект VesselAssistant, не в этом репозитории) и автотестами репозитория. Обновляется при любом изменении сценариев или их покрытия — вручную, отдельного CI-гейта на актуальность этого файла нет.

## Уровни пирамиды (см. `CLAUDE.md` § «Пирамида тестов»)

| Уровень | Команда |
|---|---|
| `calc` | `npx vitest run src/calc` |
| `service+SQLite` | `npx vitest run src/services` |
| `UI-компонент` | `npx vitest run src/components` |
| `e2e` | `npm run test:e2e` |
| `windows-smoke` | `npm run test:smoke` (Windows-only) |
| `rust` | `npm run test:rust` |

## Статусы

- **покрыт** — сценарий и его штатные отказы по пути проверены автотестом на заявленном уровне.
- **частично** — часть сценария проверена, часть — нет; причина обязательна.
- **не покрыт** — на сценарий нет автотеста; причина обязательна.

## Таблица

| Сценарий | Уровень (по scenarios.md) | Покрывает FR/AT | Статус | Тесты | Пробел/причина |
|---|---|---|---|---|---|
| S-1. Погрузка партии с баржи поверх лежащего слоя | `e2e`, приоритет | FR-03, FR-05, FR-10, FR-17, FR-19, FR-20; AT-10 | покрыт | `e2e/specs/s-01-load-lot.spec.ts` — `S-1: a VELES lot is loaded over DIANA MARIA through the form, recalculated and audited with the operator name` | — |
| S-2. Партия переполняет трюм сверх 98 % | `UI-компонент` | FR-03, FR-05, FR-08; AT-05 | покрыт | `src/components/__tests__/AddLotForm.test.tsx` — `S-2: 285 t over lot A → confirm; Cancel → the service is not called again, lot B not saved`, `S-2: Confirm → resubmitted with acknowledge_overload: true, lot B saved on top`, `S-2 boundary: 784 t into an empty hold → saved with no dialog`; `src/calc/__tests__/capacity.test.ts` — `S-2 scenario: TIGHT BARGE hold 1 (1000 m³, SF 1.25), lot A 500 t + lot B 285 t` | — |
| S-3. Создание рейса и расчёт свободного места под следующую баржу | `UI-компонент` | FR-01, FR-02, FR-05, FR-08, FR-16, FR-20; AT-01, AT-09 | покрыт | `src/components/__tests__/HoldTable.test.tsx` — `EmptySpace98 for holds 1–5 equals the S-3 values in 0.000 format`, `a hold with no SF is marked with the "SF not set" error and gets no capacity or empty space (rendered as "—", excluded from totals)` | — |
| S-4. Выгрузка на океанское судно через OGV | `e2e`, приоритет | FR-04, FR-05, FR-08, FR-17, FR-21; AT-02, AT-12 | покрыт | `e2e/specs/s-04-ogv-discharge.spec.ts` — `S-4: OGV discharge recalculates the load plan; a short hold is rejected whole in Russian` | — |
| S-5. Двухслойное LIFO-списание в одном трюме | `service+SQLite` | FR-17, FR-21; AT-07, AT-08 | покрыт | `src/calc/__tests__/discharge.test.ts` — `AT-07: discharging 500 t writes off only from VELES (top layer)`, `AT-08: subsequent 900 t discharge spans VELES and DIANA MARIA`; `src/services/__tests__/ogv.test.ts` — `AT-07: discharge 500 t writes off only VELES (top layer)`, `AT-08: subsequent 900 t discharge spans VELES then DIANA MARIA`, `rolls back the entire operation when the hold is short of cargo` | — |
| S-6. Отчёт по происхождению груза для таможни | `service+SQLite` | FR-18, FR-09; AT-07, AT-08 | покрыт | `src/services/__tests__/ogv.test.ts` — `availableBySource sums remaining_tons per source vessel`; `src/services/__tests__/document-engine.test.ts` — `OGV sheet contains the discharges from the KAVKAZ_IV fixture` | — |
| S-7. Ведение SOF с переходом через 24:00 | `e2e`, приоритет | FR-02, FR-07, FR-08; AT-04 | покрыт | `e2e/specs/s-07-sof-midnight.spec.ts` — `S-7: SOF events across midnight are entered through the form fields, ordered, checked and exported` | Плановая находка «предупреждение о пересечении не показано в UI» (Несоответствие 13 плана) не подтвердилась: `sof-overlap-warning` наблюдается в спеке напрямую, дефекта нет. Отказ «удаление после подтверждения» тоже в спеке (i18n-ключ `sof.delete.confirm` добавлен FIX-заходом при написании этого участка) — весь сценарий, включая оба отказа по пути, закрыт одним прогоном. |
| S-8. Крановая поправка веса | `service+SQLite` | FR-04, FR-06, FR-08; AT-03 | покрыт | `src/services/__tests__/crane.test.ts` — `AT-03: corrected_weight = scale_weight / coefficient, rounded to 3 decimals`, `TZ §8 rule 6: throws when no coefficient is active for the date`, `throws when operation_type does not match` | — |
| S-9. Ежедневный экспорт документов | `UI-компонент` | FR-09, FR-16; AT-06, AT-09, AT-13 | частично | `src/services/__tests__/document-engine.test.ts` — `AT-13: every numeric cell uses 3-decimal format across all sheets`, `contains no formula cells across all sheets (TZ §6 FR-22 / §8 rule 16)`, `uses the actual vessel name for the load plan sheet, never hard-coded` | Ветка PDF: FR-09 отложен (открытый вопрос владельца продукта, `Requirements/fr.md` § «Открытые вопросы» п.1 — PDF нигде в коде не реализован, ни один уровень его не проверяет). Отдельно: UI-требование «продукт сообщает об успехе и показывает путь к файлу» не реализовано в `src/components/ExportButton.tsx` (нет текста успеха/пути, `setError(String(e))` всё ещё на месте) — существовавший до ветки пробел, вне списка fix 1–9 этой ветки. |
| S-10. Передача рейса в офис файлом проекта | `service+SQLite` | FR-14, FR-15, FR-19 | покрыт | `src/services/__tests__/backup.test.ts` — `S-10: a snapshot carrying protein 14.0 is rejected whole, before any auto-backup` | — |
| S-11. Восстановление базы на другом компьютере после сбоя | `service+SQLite` | FR-13, FR-14 | покрыт | `src/services/__tests__/backup.test.ts` — `S-11: restoring with a real AutoBackupService first writes auto-*-restore.json of the replaced state` | — |
| S-12. Перенос данных из старого Excel | `service+SQLite` | FR-05, FR-12, FR-14, FR-19 | частично | `src/services/__tests__/import.test.ts` — `applyImport persists data so CalculationService matches KAVKAZ_IV_TOTALS` (включая прямую проверку строк `operations`: 1177/824 т), `rejects only the row with protein 14.0 and names sheet, cell and reason` | `ImportService.parseLoadPlan`/`applyImport` разбирает только лист грузового плана (по имени судна); `pickLoadPlanSheet`'s `SIBLINGS`-регулярка (`/^(sof|ogv|crane.*)$/i`) намеренно исключает вкладки SOF/OGV/CRANE CORR из разбора — их построчное содержимое не переносится в `sof_events` или отдельную таблицу крановых поправок. Выгрузка по трюмам (1177/824 т) реконструируется агрегатно из итоговых ячеек листа грузового плана (строка 26) и воспроизводится как `OgvService.discharge`-вызовы, проверено по строкам `operations`; отдельные SOF/CRANE CORR записи из файла не импортируются — существовавший до этой ветки пробел, не входит в список fix 1–9 (`Plans/01 § Классификация`). |
| S-13. Закрытие рейса и режим только для чтения | `e2e`, приоритет | FR-01, FR-09, FR-10, FR-14 | покрыт | `e2e/specs/s-13-close-voyage.spec.ts` — `S-13: closing asks first, snapshots, audits, and leaves the voyage read-only` | — |
| S-14. Корректировка закрытого рейса ролью с правом | `service+SQLite` | FR-01, FR-07, FR-10 | покрыт | `src/services/__tests__/sof.test.ts` — `supervisor with a reason changes time_to; audit keeps old/new/user/role/reason`, `supervisor without a reason → voyage.closed_reason_required, event keeps 04:00`, `operator, even with a reason → voyage.closed, event keeps 04:00` | — |

## Требования вне сценариев

Пункт FR-10 «Журнал аудита рейса экспортируется» не описан ни одним сценарием. Сценарии S-1, S-13 и S-14 проверяют запись в журнал, а не его выгрузку. Поэтому их строки в таблице не меняются.

Экспорт проверяет `src/services/__tests__/audit-export.test.ts` на уровне `service+SQLite`: методы `AuditLogService.listForVoyage` и `DocumentEngine.generateAuditLog`. В выгрузку попадают записи только этого рейса, включая `discharge_allocations` удалённой операции. Записи второго рейса и `crane_coefficients` в неё не попадают. У каждой строки заполнены оператор, роль, причина, время и сущность. Кнопку `AuditExportButton` автотест не покрывает: как и `ExportButton`, она вызывает Tauri-плагины `dialog`/`fs`.

## Итог

12 из 14 — `покрыт`, 2 — `частично` (S-9, S-12), 0 — `не покрыт`. S-3 закрыт: `HoldTable` теперь помечает трюм без SF отдельным i18n-ключом `holds.error.no_sf` и классом `error`, а не нейтральным `—`. Оставшиеся два пробела частичного покрытия существовали до этой ветки и не входят в список дефектов, которые она закрывает (`Plans/01` § «Классификация: дефект vs. отложенная фича»).
