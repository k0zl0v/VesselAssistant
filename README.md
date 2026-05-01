# VesselAssistant

Offline-first desktop-приложение для расчётов погрузки/разгрузки судов и оформления судовой документации.

**Status:** MVP — все 22 функциональных требования (FR-01..FR-22) и 13 приёмочных сценариев (AT-01..AT-13) из ТЗ v3.0 закрыты. 113 unit/integration-тестов, регрессия против реального `Kavkaz IV.xlsx` сходится в пределах 0.001.

## Назначение

Заменяет ручное ведение Excel-шаблона (`Load Stowage Plan + SOF`) автономным приложением, которое работает на компьютере судна без постоянного подключения к интернету. Хранит рейсы, суда, трюмы, грузы и операции; автоматически рассчитывает остатки, свободное место и формирует документы:

- **Load / Stowage Plan** — план и факт загрузки по трюмам.
- **OGV** (operational goods-vessel log) — операционный журнал по судам-источникам и трюмам.
- **Crane Correction** — расчёт скорректированного веса по коэффициентам кранов.
- **Statement of Facts** / Standard Time Sheet — хронологический журнал событий рейса.

Предметная область: судоходство, перевалка/трансшипмент, погрузка/выгрузка на рейде или в порту.

## Покрытие ТЗ

| FR | Возможность | Где реализовано |
|---|---|---|
| FR-01 | Управление рейсами | `VoyageService`, `VoyagePage`, `NewVoyageForm` |
| FR-02 | Справочники (vessels/holds/cargoes/cranes) | `ReferenceService`, `ReferencePage` |
| FR-03 | План погрузки | `CargoLotService.add` (lot + layer + auto SF в `hold_cargo_parameters`) |
| FR-04 | Факт операций (loading/discharging/SOF) | `CargoLotService`, `OgvService.discharge`, `SofService` |
| FR-05 | Расчёты Load Plan + регрессия | `CalculationService` (single SQL + pure formulas), `fixtures/kavkaz-iv.ts` |
| FR-06 | Крановые поправки | `CraneCorrectionService.findCoefficient/correctWeight`, `CraneCorrectionPanel` |
| FR-07 | SOF | `SofService` (24:00 как конец суток, валидация интервалов), `SofPanel` |
| FR-08 | Контроль ошибок | CHECK constraints, AT-05 overload, overlap warning, negative remain |
| FR-09 | Отчёты XLSX | `DocumentEngine.generateLoadPlan` — 4 листа: SOF / vessel / OGV / CRANE CORR. |
| FR-10 | Аудит изменений | SQL триггеры (`0002_audit_triggers.sql`), `AuditLogService`, `AuditLogPanel` |
| FR-11 | Многоязычность RU/EN | `src/i18n/`, `LanguageSwitcher`, ~190 ключей с en/ru parity |
| FR-12 | Импорт Excel | `ImportService.parseLoadPlan/applyImport`, `ImportPanel` |
| FR-13 | Офлайн-режим | вся бизнес-логика и БД локально, без backend |
| FR-14 | Локальные бэкапы | `BackupService` JSON envelope (15 таблиц), `BackupPanel` |
| FR-15 | Импорт/экспорт проекта | `BackupService.exportToJson/importFromJson` |
| FR-16 | Настраиваемое название судна | sheet name берётся из `vessels.name`, проверено тестом |
| FR-17 | LIFO выгрузка | pure `dischargeFromHold` + `OgvService.discharge` (транзакционно) |
| FR-18 | Отчёт по происхождению груза | `OgvService.availableBySource`, OGV-лист в экспорте |
| FR-19 | Protein для пшеницы | dropdown 10.5/11.5/12.5/13.5 в `AddLotForm` (только когда cargo wheat) |
| FR-20 | SF на уровне трюма/партии | `hold_cargo_parameters`, `CargoLotService.add` использует SF лота |
| FR-21 | OGV ↔ основной модуль | `OgvService.discharge` транзакционно обновляет `cargo_layers` |
| FR-22 | Разделение ввода и расчёта | формулы только в `src/calc/`, экспорт без формул Excel |

Все 13 AT (AT-01..AT-13) покрыты автоматическими тестами.

## Ключевые возможности (MVP)

- Справочники судов, трюмов, грузов и коэффициентов кранов.
- Создание рейса с произвольным названием основного судна.
- Ввод плана и факта погрузки по трюмам, партиям и судам-источникам.
- Расчёт `remain`, `empty space 98%`, процентов заполнения и итогов с округлением до 3 знаков.
- LIFO-списание партий при выгрузке (последняя загруженная — первая выгружается) с отчётом по остаткам судов-источников.
- SF (Stowage Factor) на уровне трюма / партии / судна.
- Связь модуля OGV с основным Load/Stowage Plan: операции в OGV автоматически обновляют остатки.
- Protein для пшеницы: 10.5%, 11.5%, 12.5%, 13.5%.
- SOF-журнал с экспортом печатной формы.
- Экспорт Load Plan, OGV, SOF в XLSX/PDF.
- Локальный журнал аудита и базовая ролевая модель.
- Локальное резервное копирование и восстановление.

## Стек

- **Tauri 2** + Rust — нативная оболочка и доступ к ФС/SQLite.
- **React 18** + **TypeScript** + **Vite** — UI.
- **SQLite** — локальная база данных (через `tauri-plugin-sql`).
- **Vitest** — unit-тесты расчётного модуля.
- **ExcelJS** / `rust_xlsxwriter`, `pdf-lib` / `printpdf` — генерация документов.

## Установка для разработки

Требования: Node.js 20+ (проверено на 24), Rust toolchain (`rustup`), системные зависимости Tauri ([docs](https://tauri.app/start/prerequisites/)).

```bash
npm install
npm test                 # Vitest — расчётный модуль
npm run typecheck        # tsc --noEmit
npm run dev              # Vite dev server (только UI, http://localhost:1420)
npm run tauri dev        # desktop dev — требует rustup
npm run tauri build      # production-билд десктопа
```

Если Rust ещё не установлен:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Структура репозитория

```
.
├── CLAUDE.md                                  # guidance для Claude Code
├── README.md
├── TZ_shipping_calculations_offline_v3.md     # техническое задание (источник истины)
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── index.html
├── src/                                       # React + расчётный модуль
│   ├── calc/                                  # pure CalculationEngine + tests
│   ├── services/                              # сервисный слой (заглушка)
│   ├── components/, pages/                    # UI (заглушки)
│   ├── App.tsx, main.tsx
│   └── assets/
├── src-tauri/                                 # Rust + миграции SQLite
│   ├── src/lib.rs, src/main.rs
│   ├── migrations/0001_initial_schema.sql
│   ├── Cargo.toml, tauri.conf.json
│   └── icons/, capabilities/
├── templates/                                 # XLSX/PDF шаблоны (пока пусто)
├── .claude/skills/                            # доменные skills для Claude Code
│   ├── shipping-calculations/
│   ├── excel-export/
│   ├── acceptance-tests/
│   └── db-migrations/
└── .gitignore
```

## Сборка релиза через GitHub Actions

Workflow `.github/workflows/release.yml` собирает бинарники под **macOS arm64** и **Windows x64** при пуше тега вида `vX.Y.Z`. Полный цикл:

```bash
# Бамп версии в src-tauri/Cargo.toml, src-tauri/tauri.conf.json и package.json (всё одинаковое значение).
git commit -am "chore: bump to v0.1.1"
git tag v0.1.1
git push origin main --tags
```

GitHub Actions запустит два параллельных runner'а (`macos-14` + `windows-latest`), прогонит тесты и typecheck, соберёт бандлы и создаст **draft release** в `https://github.com/k0zl0v/VesselAssistant/releases` с приложенными:

- `VesselAssistant_X.Y.Z_aarch64.dmg` — установщик для Apple Silicon Mac
- `VesselAssistant_X.Y.Z_x64-setup.exe` — NSIS-установщик для Windows
- `VesselAssistant_X.Y.Z_x64_en-US.msi` — Windows Installer
- Plus `.app.tar.gz` и `.sig` для будущих автообновлений

Через ~15 минут после `git push --tags` зайти в Releases, нажать **Edit draft → Publish release**, переслать `.dmg` коллегам на Mac или `.exe` — на Windows.

Можно также запустить workflow вручную через **Actions → Release → Run workflow** для smoke-теста без релиза — артефакты появятся в логе run'а.

## Документация

- [`TZ_shipping_calculations_offline_v3.md`](./TZ_shipping_calculations_offline_v3.md) — полное техническое задание (v3.0). Источник истины для всех бизнес-правил, расчётных формул, схемы БД и приёмочных сценариев.
- [`CLAUDE.md`](./CLAUDE.md) — короткая выжимка для разработки и работы с Claude Code.

## Лицензия

TBD.
