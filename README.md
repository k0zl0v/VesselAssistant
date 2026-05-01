# VesselAssistant

Offline-first desktop-приложение для расчётов погрузки/разгрузки судов и оформления судовой документации.

**Status:** MVP / в разработке

## Назначение

Заменяет ручное ведение Excel-шаблона (`Load Stowage Plan + SOF`) автономным приложением, которое работает на компьютере судна без постоянного подключения к интернету. Хранит рейсы, суда, трюмы, грузы и операции; автоматически рассчитывает остатки, свободное место и формирует документы:

- **Load / Stowage Plan** — план и факт загрузки по трюмам.
- **OGV** (operational goods-vessel log) — операционный журнал по судам-источникам и трюмам.
- **Crane Correction** — расчёт скорректированного веса по коэффициентам кранов.
- **Statement of Facts** / Standard Time Sheet — хронологический журнал событий рейса.

Предметная область: судоходство, перевалка/трансшипмент, погрузка/выгрузка на рейде или в порту.

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

## Документация

- [`TZ_shipping_calculations_offline_v3.md`](./TZ_shipping_calculations_offline_v3.md) — полное техническое задание (v3.0). Источник истины для всех бизнес-правил, расчётных формул, схемы БД и приёмочных сценариев.
- [`CLAUDE.md`](./CLAUDE.md) — короткая выжимка для разработки и работы с Claude Code.

## Лицензия

TBD.
