# VesselAssistant — Claude Code guidance

Offline-first desktop-приложение для расчётов погрузки/разгрузки судов и оформления судовой документации (Load/Stowage Plan, OGV, Crane Correction, SOF). Работает автономно на судовом ПК без backend и постоянного интернета.

**Статус:** MVP закрыт по 22 FR + 13 AT, плюс 14 пользовательских сценариев `Requirements/scenarios.md` (S-1..S-14, трассировка — `docs/testing/scenario-traceability.md`). 415 Vitest, 5 e2e (Playwright, ×3 повтора стабильно), 11 Rust — всё зелёное, 0 skipped. Регрессия против реального `Kavkaz IV.xlsx` сходится в пределах 0.001.

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
- **i18n:** свой минимальный store в `src/i18n/` (en + ru, общие ключи в `en.ts`/`ru.ts` + по файлу на экран в `src/i18n/parts/`), без `i18next`.

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
10. **AT-05 overload guard** в `CargoLotService.add` — лот, превышающий 98% capacity, бросает `OVERLOAD:<json>`. UI (`AddLotForm`) считает проверку вместимости вживую и показывает inline-панель перегруза с чекбоксом подтверждения перед `acknowledge_overload: true` — без `window.confirm`.

## Architecture

```
React UI (src/)
   ↓ через t() из src/i18n/
Shell (src/shell/: Rail, VoyageProvider, PageHeader) → Pages (LoadPlan, CargoLayers, Ogv, Sof, Documents, Reference, Tools, Audit)
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
   ↓                  ↓
   |          --execute_batch--> src-tauri/src/{batch,commands}.rs (Rust,
   |                              одна IMMEDIATE-транзакция на пуле плагина)
   ↓
SQLite (локальный файл)
   ↑                    ↑
SQL триггеры audit_log   app_session → триггеры подставляют user_id/user_role/reason
(0002_audit_triggers.sql, переписаны в 0003_operator_context.sql)
```

Pure функции (`src/calc/`) — ниже всего, без зависимостей: `round`, `capacity`, `discharge` (LIFO), `time` (SOF intervals).

## Project structure

```
src/
  App.tsx                  # навигационный рельс (разделы ТЗ §10) + VoyageProvider
  shell/                   # Rail, VoyageContext (данные выбранного рейса), PageHeader, NewVoyageDialog
  styles/                  # tokens.css (дизайн-токены) + CSS по экрану; App.css — база и общие классы
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
                           # BackupPanel, CraneCorrectionPanel, DischargeForm,
                           # ErrorBoundary, ExportButton, HoldTable,
                           # ImportPanel, LanguageSwitcher, NewVoyageForm,
                           # SessionGate, SofPanel, VoyageTotals
  pages/                   # LoadPlan, CargoLayers, Ogv, Sof, Documents, Reference, Tools, Audit
                           # UI-правила — skill `ui-kit`, макеты — docs/ui/
  i18n/                    # index.ts (store + useT hook)
                           # en.ts, ru.ts + parts/<screen>.ts (en/ru parity)
                           # errors.ts (describeError), __tests__/
  fixtures/
    kavkaz-iv.ts           # Appendix C baseline (real xlsx values)

e2e/                       # Playwright over `vite preview` + hand-written IPC bridge
  fixtures.ts seeds.ts tsconfig.json
  tauri-bridge/            # init-script.ts, node-side.ts, install.ts + contract test
  specs/                   # app-boot, s-01/s-04/s-07/s-13 (приоритетные сценарии)

e2e-smoke/                 # Windows-only: WebdriverIO + tauri-driver, реальный Tauri-хост
  wdio.conf.ts tauri-ipc.ts specs/smoke.spec.ts

docs/
  adr/                     # README.md (MADR short, нумерация 0001+) + записи
  analysis/                # пост-MVP разбор (У1)
  testing/                 # scenario-traceability.md (S-1..S-14 → уровень/тесты/статус)

src-tauri/
  src/lib.rs               # Tauri Builder + plugins + migrations()
  src/main.rs              # vessel_assistant_lib::run()
  src/batch.rs             # run_batch — одна IMMEDIATE-транзакция, typed bind, rollback
  src/commands.rs          # execute_batch Tauri-команда, соединение из пула plugin-sql
  migrations/
    0001_initial_schema.sql
    0002_audit_triggers.sql
    0003_operator_context.sql
    0004_immutability_guards.sql
    0005_protein_percent_guard.sql
  tests/                   # common/mod.rs (fresh_db), batch.rs, migrations.rs — 11 тестов
  capabilities/default.json
  Cargo.toml tauri.conf.json
  icons/

scripts/
  inspect-xlsx.mjs         # одноразовый дампер xlsx (для разведки)
  generate-import-fixture.ts  # генератор коммитящейся XLSX-фикстуры импорта
  assert-no-skips.mjs      # падает при любом skipped/todo/pending/N ignored

.github/
  workflows/release.yml    # macOS arm64 + Windows x64 на тег v*.*.*, + cargo test
  workflows/ci.yml         # push/PR/nightly/dispatch — см. «Пирамида тестов»
```

## Commands

- `npm install` — зависимости.
- `npm test` / `npm run test:watch` — Vitest (415 тестов). Отдельные уровни и остальные раннеры — «Пирамида тестов» ниже.
- `npm run typecheck` — три прогона `tsc --noEmit`: корень, `e2e/`, `e2e-smoke/`.
- `npm run build` — production UI (`tsc && vite build`). Initial bundle ~450 KB / 126 KB gzip (после редизайна UI; рост — код экранов и строки) + шрифты IBM Plex (локально, `@fontsource`) + ленивые ExcelJS/DocumentEngine/ImportService чанки.
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

## Пирамида тестов

| Уровень | Что доказывает | Команда | Фикстуры |
|---|---|---|---|
| `calc` (`src/calc/__tests__/`) | Чистые функции (`round`/`capacity`/`discharge`/`time`) детерминированы, без БД | `npx vitest run src/calc` | inline данные + `src/fixtures/kavkaz-iv.ts` |
| `services` (`src/services/__tests__/`) | Бизнес-логика через реальный SQLite (`better-sqlite3`, `openTestDb`) | `npx vitest run src/services` | `openTestDb()` — применяет всё из `src-tauri/migrations/` по имени файла |
| `components` (`src/components/__tests__/`) | React-компонент + `openTestDb`/jsdom, без Tauri | `npx vitest run src/components` | те же `openTestDb`/`seedReferenceData` |
| `e2e` (`e2e/specs/`) | UI → сервис → SQLite одним прогоном, через рукописный мост `window.__TAURI_INTERNALS__` (не `mockIPC` — теряет третий аргумент `invoke`, нужный `plugin-fs`) над честной сборкой `vite preview` | `npm run test:e2e` | `e2e/seeds.ts`, коммиченная `appendix-c-load-plan.xlsx` |
| `windows-smoke` (`e2e-smoke/specs/`) | То же самое, но настоящий Tauri-хост (`tauri-driver` + `msedgedriver`), только Windows | `npm run test:smoke` (только на `windows-latest`) | реальные IPC-команды на живом пуле `plugin-sql` |
| `rust` (`src-tauri/tests/`) | Миграции зарегистрированы и непрерывны, `execute_batch` атомарен на одном соединении | `npm run test:rust` | `common::fresh_db()` — те же файлы `src-tauri/migrations/` через `sqlx::Migrator` |

- **Фикстуры — только коммиченные файлы**, никаких личных путей (`existsSync`/`console.warn`-скип запрещены — см. «What NOT to do»). `appendix-c-load-plan.xlsx` генерируется `scripts/generate-import-fixture.ts` из `src/fixtures/kavkaz-iv.ts` и коммитится; `import-fixture-freshness.test.ts` гейтит дрейф.
- **CI (`«.github/workflows/ci.yml»`)** — `changes` (path-filter: **консервативный deny-list** — всё, кроме чистой документации `**/*.md`/`.claude/**`/`.vscode/**`/`.gitignore`; `predicate-quantifier: 'every'` обязателен — при умолчании `some` паттерн `'**'` совпадает с любым файлом и `!`-исключения не работают; `npm run build`, который вызывает `tauri build`, компилирует весь `src/**`, поэтому узкий allowlist дважды отставал от реальной зависимости джобы) → `web` (typecheck + Vitest json + Playwright json + `scripts/assert-no-skips.mjs`) → `rust`/`windows-smoke` (условно на `changes.rust` или `schedule`/`workflow_dispatch`). `assert-no-skips.mjs` — жёсткий гейт: `skipped`/`todo`/`pending`/`N ignored` > 0 роняет сборку, пропущенная джоба ничего не доказывает (`CLAUDE.md` уровня vault, § «Диагностика падений»).
- **Пробел: macOS-webview не покрыт автотестом.** Нет headless-раннера для нативного WKWebView. Компенсация — ручной `npm run tauri dev` перед релизом + `cargo test` на `macos-14` внутри `release.yml` (проверяет Rust-слой, не сам webview).
- **Node 22 в CI, Node 26 локально.** `.github/workflows/{ci,release}.yml` пинят `node-version: 22`; разработческая машина может стоять на более новом Node — расхождение известно, разрыва пока не наблюдалось.

## Conventions

- **TypeScript strict mode**, никаких `any`. Type-only импорты через `import type` где можно.
- **Расчётные функции (`src/calc/`) pure и детерминированные**. Не читают БД, не зависят от `Date.now()` — время передаётся параметром.
- **Сервисы (`src/services/`) зависят только от интерфейса `Db`** — не от конкретной импл. Это позволяет интеграционным тестам работать через in-memory better-sqlite3.
- **Транзакционность мутаций.** Операция, затрагивающая >1 таблицы, либо оборачивается в `db.transaction(async (tx) => { ... })` (`ImportService`, `BackupService.importFromJson` — откат при exception), либо, для новых многотабличных записей, собирается как один `Db.executeBatch(BatchStatement[])` (`OgvService.discharge`, `VoyageService.copy`, `CargoLotService.add` — текущие примеры): все statement'ы идут на одно соединение из пула `tauri-plugin-sql`, `BEGIN IMMEDIATE`→`COMMIT`/`ROLLBACK` считает Rust (`src-tauri/src/batch.rs`), а не JS. Новый код с многотабличной записью — `executeBatch`, не `db.transaction` (снимает риск «два писателя», см. `docs/adr/0002-atomic-writes-execute-batch.md`).
- **Guard закрытого рейса — `withVoyageGuard`** (`src/services/voyageGuard.ts`). Оборачивает `CargoLotService.add`, `OgvService.discharge`, `SofService.create/update/delete`: закрытый рейс отклоняет мутацию, если вызывающий не `supervisor`/`admin` с непустой причиной (пишется в `audit_log`, чистится после). Новый мутирующий метод сервиса — тоже через этот guard, если рейс может быть закрыт.
- **Ошибки сервисов — `AppError`** (`src/services/errors.ts`), не голый `Error`/строка. UI переводит через `describeError(e)` (`src/i18n/errors.ts`) — никогда `String(e)` (см. «What NOT to do»). Исключение: `CargoLotService.add`'s `OVERLOAD:<json>` (унаследовано, не мигрировано — вне скоупа этой ветки).
- **Автобэкап — обязательный параметр конструктора.** `VoyageService`/`ImportService`/`BackupService` принимают `AutoBackupHook` последним аргументом; продовый код всегда передаёт реальный `AutoBackupService` (`src/autoBackup.ts`), тесты — `NOOP_AUTO_BACKUP` (`src/services/__tests__/helpers.ts`). Не подставлять no-op в прод-код.
- **ID — `crypto.randomUUID()`**. SQLite `id` колонки — `TEXT PRIMARY KEY`. Исключение: `audit_log.id` — `INTEGER AUTOINCREMENT`.
- **Округление только на границе UI/экспорта** через `formatTons` (или `numFmt = '0.000'` в ExcelJS). В БД и расчётах храним полную точность IEEE 754 double.
- **Все публичные функции CalculationService покрыты тестами**, включая Appendix C baseline (`src/fixtures/kavkaz-iv.ts` → On Board = 23683.955, Total Empty 98% = 15881.924).
- **Новая SQL миграция?** Два действия: создать `src-tauri/migrations/NNNN_*.sql`, добавить в `migrations()` (`src-tauri/src/lib.rs`). Мирроить в тестах вручную не нужно — `src/services/__tests__/helpers.ts` `openTestDb` читает каталог `src-tauri/migrations/` по маске `\d{4}_.+\.sql` и применяет по имени файла. Страж — `cargo test` (`src-tauri/tests/migrations.rs`): падает, если число файлов ≠ длине `migrations()` или версии не непрерывны с 1.
- **Аудит — автоматический, актор — `app_session`.** SQL-триггеры (`0002_audit_triggers.sql`, актор-колонки добавлены `0003_operator_context.sql`) пишут в `audit_log` для каждого `INSERT/UPDATE/DELETE` восьми ключевых таблиц, подставляя `user_id`/`user_role`/`reason` из единственной строки `app_session` (id=1, пишет `SessionService.start()`/`withVoyageGuard`). Сервисы аудит-логирование не вызывают.
- **i18n:** все user-facing строки — через `t('key')`. Новый ключ → добавить в `src/i18n/en.ts` И `src/i18n/ru.ts` (typecheck заставит). Тесты сервисов пишут английские error-messages — это OK, они не пропускаются в UI без `t()`.
- **ExcelJS — динамический импорт.** Любой компонент/сервис, тянущий `exceljs`, должен загружаться через `await import('../services/...')` в момент клика, иначе initial bundle вырастет на ~940 KB.
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
- ❌ **`setError(String(e))` в обработчиках.** Текст ошибки — `describeError(e)`; техническая строка — только в свёрнутых «Подробностях» (`ErrorState.details`).
- ❌ **`it.skip`/`maybeIt`/`existsSync`-скип, зависящий от наличия личного файла.** Отсутствующая фикстура — красный тест, не пропущенный (`scripts/assert-no-skips.mjs` это гейтит). Фикстуры — коммиченные файлы, не личные пути разработчика.
- ❌ **`BEGIN`/`COMMIT` вручную через `plugin-sql` в новом коде.** Для одной таблицы — обычный `execute`; для нескольких — `executeBatch` (Rust-уровень, атомарность на одном соединении). `db.transaction` остаётся только в двух унаследованных местах из «Conventions» (`ImportService`, `BackupService.importFromJson`) и образцом для нового кода не служит. Ручной `BEGIN` через plugin-sql не гарантирует то же соединение на последующих вызовах — наблюдалось вживую в `tauri build` на `CargoLotService.add` (лог: `cannot rollback - no transaction is active`, затем `cannot start a transaction within a transaction`); Vitest и e2e-мост этого не видят — у них одно соединение better-sqlite3.

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
- `acceptance-tests` — сценарии AT-01..AT-13 с указанием где покрыты, плюс как заводить новый пользовательский сценарий (`S-N` из `Requirements/scenarios.md`) и его автотест.
- `db-migrations` — схема таблиц из §9, audit triggers (актор — `app_session`), регистрация миграций в `lib.rs` (2 шага + `cargo test`-страж).
- `service-layer` — Db interface, `AppError`/`executeBatch`/`withVoyageGuard`, автобэкап-DI, как добавить новый сервис.
- `i18n` — useT, en/ru parity, ключевые соглашения.
- `release-flow` — версии в 3 файлах, тег формат, GitHub Actions, macOS Rust-покрытие в релизной сборке.

Архитектурные решения без «истории вопроса» в самом коде — `docs/adr/` (MADR short form, `docs/adr/README.md` — конвенция и список).
