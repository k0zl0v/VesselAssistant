# VesselAssistant — Claude Code guidance

Offline-first desktop-приложение для расчётов погрузки/разгрузки судов и оформления судовой документации (Load/Stowage Plan, OGV, Crane Correction, SOF). Работает автономно на судовом ПК без backend и постоянного интернета.

**Статус:** MVP закрыт по 22 FR + 13 AT. 113 unit/integration-тестов зелёные. Регрессия против реального `Kavkaz IV.xlsx` сходится в пределах 0.001.

## Source of truth

Авторитетный документ — [`TZ_shipping_calculations_offline_v3.md`](./TZ_shipping_calculations_offline_v3.md) (v3.0). При любом противоречии между этим файлом и ТЗ — побеждает ТЗ. Этот файл — короткая выжимка для быстрой ориентации.

## Tech stack

- **Tauri 2.x** + Rust для нативной части и доступа к ФС/SQLite. Rust — тонкий хост, бизнес-логика в TS.
- **React 19** + **TypeScript** (strict) + **Vite 7** для UI.
- **SQLite** через `tauri-plugin-sql` (с feature `sqlite`); миграции в `src-tauri/migrations/` регистрируются в `lib.rs`.
- **better-sqlite3** — *только* в тестах. **NOT `node:sqlite`** — Vite/Vitest не резолвят `node:` импорты в worker-pool.
- **Vitest** для unit + integration-тестов.
- **ExcelJS** для XLSX генерации/парсинга. **Импортируется лениво через `await import()`** — иначе вешает 940 KB на initial bundle.
- **Tauri-плагины:** `plugin-sql`, `plugin-dialog`, `plugin-fs`, `plugin-opener`. Capabilities в `src-tauri/capabilities/default.json`.
- **i18n:** свой минимальный store в `src/i18n/` (en + ru, ~190 ключей), без `i18next`.

## Domain glossary

- **Vessel** — судно (название, флаг, IMO, набор трюмов).
- **Voyage** — рейс: loading port → discharging port, груз, даты, статус (`open` / `closed`).
- **Hold** — трюм: номер, объём в м³, текущий груз и тоннаж.
- **Cargo lot** — партия груза от конкретного судна-источника, загруженная в трюм.
- **Cargo layer** — расчётный слой груза в трюме = партия или её часть; стек слоёв используется для LIFO-выгрузки.
- **OGV** (operational goods-vessel log) — операционный журнал погрузки/выгрузки по судам-источникам и трюмам.
- **SOF** (Statement of Facts) — хронологический журнал событий рейса.
- **SF** (Stowage Factor) — удельный погрузочный объём; **разный** для разных трюмов/судов/партий.
- **Protein** — % протеина в пшенице. Допустимые значения: 10.5, 11.5, 12.5, 13.5.
- **FillPercent** — допустимый процент заполнения трюма. Для MVP **только 0.98**.
- **Crane correction** — коэффициент поправки веса по крану/борту/типу операции.

## Hard business rules (нарушать запрещено)

1. **Округление до 3 знаков после запятой** во всём UI и всех экспортах (`0.000`). Внутреннее хранение может быть точнее. Промежуточные расчёты — без округления.
2. **FillPercent = 0.98** — основной расчёт. 100% — только справочный.
3. **LIFO при выгрузке** внутри каждого трюма: последняя загруженная партия (верхний слой) списывается первой. Ручной выбор нижней партии запрещён.
4. **SF — на уровне `(hold, cargo, vessel/lot)`**, не на уровне груза. Расчёты вместимости и empty space используют SF конкретной строки.
5. **Название основного судна — параметр**. `KAVKAZ IV` нигде в коде/шаблонах/именах сущностей не хардкодить (включая sheet name, имена файлов, default значения).
6. **В полях ввода нет формул**. Вся расчётная логика — только в `src/calc/` (pure) или сервисах. В экспортируемых XLSX — только вычисленные значения, никаких `=SUM(...)`.
7. **Итоговые поля только вычисляемые**, ручной правки не допускают.
8. **Деление на ноль по SF запрещено** — валидация перед расчётом (`capacityTons` бросает).
9. **`RemainHold[h] >= 0`** — отрицательный остаток в UI/экспорте подсвечивается как ошибка.
10. **AT-05 overload guard** в `CargoLotService.add` — лот, превышающий 98% capacity, бросает `OVERLOAD:<json>`. UI ловит и спрашивает подтверждение перед `acknowledge_overload: true`.

## Architecture

```
React UI (src/)
   ↓ через t() из src/i18n/
Pages (VoyagePage, ReferencePage, ToolsPage)
   ↓
Services (src/services/) — TS, бизнес-логика
   - VoyageService, CargoLotService, OgvService
   - CalculationService (агрегаты по рейсу)
   - SofService, CraneCorrectionService
   - ReferenceService (vessels/holds/cargoes/cranes)
   - BackupService (JSON envelope), ImportService (XLSX → DB)
   - DocumentEngine (DB → XLSX), AuditLogService
   ↓
Db interface (src/services/db.ts)
   ↓                                   ↓
TauriDb (prod, plugin-sql)          NodeDb (tests, better-sqlite3)
   ↓
SQLite (локальный файл)
   ↑
SQL триггеры audit_log (src-tauri/migrations/0002_audit_triggers.sql)
```

Pure функции (`src/calc/`) — ниже всего, без зависимостей: `round`, `capacity`, `discharge` (LIFO), `time` (SOF intervals).

## Project structure

```
src/
  App.tsx                  # tab nav: Voyages | Reference | Tools
  main.tsx                 # React entry
  db.ts                    # TauriDb singleton
  seedDemo.ts              # KAVKAZ IV demo voyage seeder
  calc/                    # CalculationEngine — pure functions
    round.ts capacity.ts discharge.ts time.ts
    types.ts index.ts
    __tests__/             # 35 unit-тестов
  services/                # бизнес-логика, зависит от Db
    db.ts db-tauri.ts db-node.ts
    VoyageService.ts CargoLotService.ts OgvService.ts
    CalculationService.ts SofService.ts CraneCorrectionService.ts
    ReferenceService.ts AuditLogService.ts
    BackupService.ts ImportService.ts DocumentEngine.ts
    HoldLotsView.ts
    types.ts sofCategories.ts
    __tests__/             # 78 integration-тестов в openTestDb
  components/              # AddLotForm, AddSofEventForm, AuditLogPanel,
                           # BackupPanel, CraneCorrectionPanel,
                           # DischargeForm, ExportButton, HoldTable,
                           # ImportPanel, LanguageSwitcher,
                           # NewVoyageForm, SofPanel, VoyageTotals
  pages/                   # VoyagePage, ReferencePage, ToolsPage
  i18n/                    # index.ts (store + useT hook)
                           # en.ts, ru.ts (~190 keys, en/ru parity)
                           # __tests__/i18n.test.ts
  fixtures/
    kavkaz-iv.ts           # Appendix C baseline (real xlsx values)

src-tauri/
  src/lib.rs               # Tauri Builder + plugins + migrations Vec
  src/main.rs              # vessel_assistant_lib::run()
  migrations/
    0001_initial_schema.sql
    0002_audit_triggers.sql
  capabilities/default.json
  Cargo.toml tauri.conf.json
  icons/

scripts/
  inspect-xlsx.mjs         # одноразовый дампер xlsx (для разведки)

.github/
  workflows/release.yml    # macOS arm64 + Windows x64 на тег v*.*.*
```

## Commands

- `npm install` — зависимости.
- `npm test` / `npm run test:watch` — Vitest (113 тестов).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` — production UI (`tsc && vite build`). Initial bundle ~285 KB / 84 KB gzip + ленивые ExcelJS/DocumentEngine/ImportService чанки.
- `npm run dev` — только Vite (без Tauri runtime; `TauriDb` упадёт).
- `npm run tauri dev` — desktop dev. Требует `. "$HOME/.cargo/env"` в свежем shell.
- `npm run tauri build` — релиз `.dmg`/`.app` под текущую ОС. Cargo cache держит вторые сборки в ~30 сек.

Релизный flow (см. `release-flow` skill):

```bash
# Бамп версии в трёх файлах одинаково:
#   package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json
git commit -am "chore: bump to vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
# GitHub Actions соберёт macOS arm64 + Windows x64 → draft Release
```

## Conventions

- **TypeScript strict mode**, никаких `any`. Type-only импорты через `import type` где можно.
- **Расчётные функции (`src/calc/`) pure и детерминированные**. Не читают БД, не зависят от `Date.now()` — время передаётся параметром.
- **Сервисы (`src/services/`) зависят только от интерфейса `Db`** — не от конкретной импл. Это позволяет интеграционным тестам работать через in-memory better-sqlite3.
- **Транзакционность мутаций.** Любая операция, затрагивающая >1 таблицы (например, `CargoLotService.add` пишет lot + layer + параметры; `OgvService.discharge` — operations + allocations + layers), оборачивается в `db.transaction(async (tx) => { ... })`. Откат при exception.
- **ID — `crypto.randomUUID()`**. SQLite `id` колонки — `TEXT PRIMARY KEY`. Исключение: `audit_log.id` — `INTEGER AUTOINCREMENT`.
- **Округление только на границе UI/экспорта** через `formatTons` (или `numFmt = '0.000'` в ExcelJS). В БД и расчётах храним полную точность IEEE 754 double.
- **Все публичные функции CalculationService покрыты тестами**, включая Appendix C baseline (`src/fixtures/kavkaz-iv.ts` → On Board = 23683.955, Total Empty 98% = 15881.924).
- **Новая SQL миграция?** Три действия: создать `src-tauri/migrations/NNNN_*.sql`, добавить в `Vec<Migration>` в `src-tauri/src/lib.rs`, добавить чтение/применение в `src/services/__tests__/helpers.ts` `openTestDb`.
- **Аудит — автоматический.** SQL триггеры в миграции 0002 пишут в `audit_log` для каждого `INSERT/UPDATE/DELETE` восьми ключевых таблиц. Сервисы аудит-логирование не вызывают.
- **i18n:** все user-facing строки — через `t('key')`. Новый ключ → добавить в `src/i18n/en.ts` И `src/i18n/ru.ts` (typecheck заставит). Тесты сервисов пишут английские error-messages — это OK, они не пропускаются в UI без `t()`.
- **ExcelJS — динамический импорт.** Любой компонент/сервис, тянущий `exceljs`, должен загружаться через `await import('../services/...')` в момент клика, иначе initial bundle вырастет с 285 KB до 1.2 MB.
- **Коммиты на английском**, conventional-commits (`feat`, `fix`, `chore`, `docs`, `ci`, `refactor`, `test`).

## What NOT to do

- ❌ **Хардкодить `KAVKAZ IV`** где бы то ни было — sheet names, файлы экспорта, default-значения, тестовые ассерты. Имя берётся из `vessels.name`.
- ❌ **Использовать единый SF на уровне груза** в расчётах. SF идёт из `cargo_lots.sf` (write time) или `hold_cargo_parameters.sf` (calc time).
- ❌ **Записывать формулы Excel в экспортируемые XLSX.** Только числовые значения. `DocumentEngine` имеет defensive sweep, бросающий при формуле в ячейке.
- ❌ **Импортировать `node:sqlite`.** Vite/Vitest не справляются. Используется `better-sqlite3` (есть в devDependencies).
- ❌ **Импортировать `exceljs` или `DocumentEngine`/`ImportService` синхронно** в файлах, грузящихся на старт (App, pages). Только через `await import()` в момент действия пользователя.
- ❌ **Хардкодить английские строки в UI.** Через `t()` всегда.
- ❌ **Позволять пользователю выбрать «снять с нижней партии»** — это нарушает LIFO. Корректировка — отдельная операция с записью в audit trail.
- ❌ **Округлять промежуточные расчёты** — только финальное отображение/экспорт.
- ❌ **Класть SOF первым листом в XLSX-экспорт.** Excel/Numbers открывают первый лист по умолчанию; пустой SOF выглядит как сломанный экспорт. Порядок: vessel-name (Load Plan) → SOF → OGV → CRANE CORR.
- ❌ **Добавлять свой audit-вызов в сервисы** — триггеры покроют. Дублирование запутает.
- ❌ **Делать API-вызовы к внешним сервисам** в основных функциях (offline-first).
- ❌ **Запускать Rust команды без `. "$HOME/.cargo/env"`** в свежем shell — `--no-modify-path` использовался при установке `rustup`.
- ❌ **`cargo check`/`cargo build` через `cd src-tauri`** — лучше через `--manifest-path src-tauri/Cargo.toml`. cwd может неожиданно сброситься.

## Lessons from MVP build (для будущих изменений)

- **Параллельные агенты на аддитивном коде работают.** Wave 1 (DocumentEngine extension + BackupService + ImportService) — 3 агента, нулевые конфликты, потому что каждый писал в свои файлы. Конфликтные изменения (i18n, общий tsconfig) — solo.
- **`audit_log.id` AUTOINCREMENT + триггеры × BackupService.importFromJson коллизия.** Триггеры на бизнес-таблицах генерят rows во время import → ID совпадают с теми, что прилетают из JSON-снимка. Решение в текущем коде: `BEFORE INSERT` дедупликационный триггер на `audit_log` с `RAISE(IGNORE)`. При добавлении новых триггеров — учитывать.
- **`hold_cargo_parameters.sf` — кеш SF от первого лота в `(voyage, hold, cargo)`.** `CargoLotService.add` авто-создаёт строку при первом лоте; **последующие лоты НЕ перезаписывают** SF (один SF на трюм, как в исходном Excel). При расчётах capacity берётся из `hold_cargo_parameters`, не из `cargo_lots`.
- **AT-05 SF-источник для guard.** Overload-проверка использует SF *самого нового лота* (`input.sf`), а не уже сохранённый в `hold_cargo_parameters`. Логика: оператор сейчас декларирует физику этого груза — этим и проверяем.
- **Cross-compile macOS → Windows для Tauri невозможен.** Установщики используют WiX/NSIS — Windows-specific. Решение: GitHub Actions matrix.
- **Tag формат `vX.Y.Z`** — workflow триггерится только на `v*.*.*`. Без `v` префикса не сработает (был такой инцидент).
- **Бинарь не подписан** Apple Developer ID / Authenticode. На macOS правый клик → Open или `xattr -dr com.apple.quarantine`. На Windows — SmartScreen More info → Run anyway.
- **БД при апгрейде .dmg сохраняется** — она в `~/Library/Application Support/com.vesselassistant.app/`, .app-бандл лежит отдельно в `/Applications/`.
- **`exceljs` тащит 940 KB.** Любой новый сервис с экспортом/парсингом — обязательно lazy import.

## Skills

В `.claude/skills/` размещены доменные skills, которые подгружаются автоматически:

- `shipping-calculations` — формулы из §5, LIFO, AT-05 overload guard, контрольные значения.
- `excel-export` — структура листов, defensive no-formula sweep, lazy-import requirement, Load Plan FIRST правило.
- `acceptance-tests` — сценарии AT-01..AT-13 с указанием где покрыты.
- `db-migrations` — схема таблиц из §9, audit triggers, helpers.ts mirror, регистрация миграций в lib.rs.
- `service-layer` — Db interface, транзакции, как добавить новый сервис.
- `i18n` — useT, en/ru parity, ключевые соглашения.
- `release-flow` — версии в 3 файлах, тег формат, GitHub Actions.
