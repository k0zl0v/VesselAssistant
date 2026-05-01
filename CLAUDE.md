# VesselAssistant — Claude Code guidance

Offline-first desktop-приложение для расчётов погрузки/разгрузки судов и оформления судовой документации (Load/Stowage Plan, OGV, Crane Correction, SOF). Работает автономно на судовом ПК без backend и постоянного интернета.

## Source of truth

Авторитетный документ — [`TZ_shipping_calculations_offline_v3.md`](./TZ_shipping_calculations_offline_v3.md) (v3.0). При любом противоречии между этим файлом и ТЗ — побеждает ТЗ. Этот файл — короткая выжимка для быстрой ориентации.

## Tech stack

- **Tauri 2.x** + Rust для нативной части и доступа к ФС/SQLite.
- **React 18** + **TypeScript** (strict) + **Vite** для UI.
- **SQLite** через `tauri-plugin-sql` (или `rusqlite` напрямую) — локальная БД.
- **Vitest** для unit-тестов чистого расчётного модуля.
- **ExcelJS** / `rust_xlsxwriter` — генерация XLSX. **pdf-lib** / `printpdf` — PDF.

## Domain glossary

- **Vessel** — судно (название, флаг, IMO, набор трюмов).
- **Voyage** — рейс: loading port → discharging port, груз, даты, статус.
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

1. **Округление до 3 знаков после запятой** во всём UI и всех экспортах (`0.000`). Внутреннее хранение может быть точнее.
2. **FillPercent = 0.98** — основной расчёт. 100% — только справочный.
3. **LIFO при выгрузке** внутри каждого трюма: последняя загруженная партия (верхний слой) списывается первой. Ручной выбор нижней партии запрещён.
4. **SF — на уровне `(hold, cargo, vessel/lot)`**, не на уровне груза. Расчёты вместимости и empty space используют SF конкретной строки.
5. **Название основного судна — параметр**. `KAVKAZ IV` нигде в коде/шаблонах/именах сущностей не хардкодить.
6. **В полях ввода нет формул**. Вся расчётная логика — только в `CalculationEngine`.
7. **Итоговые поля только вычисляемые**, ручной правки не допускают.
8. **Деление на ноль по SF запрещено** — валидация перед расчётом.
9. **`RemainHold[h] >= 0`** — отрицательный остаток подсвечивается как ошибка.

## Architecture

```
UI (React)
  ↓
Services (VoyageService, CargoLotService, CargoLayerService,
          OperationService, OgvService, SofService, ReferenceService,
          BackupService, DocumentEngine)
  ↓
CalculationEngine — pure functions, без UI/DB зависимостей
  ↓
SQLite (локальный файл проекта)
```

Полный список сервисов и их назначение — в ТЗ §11.

## Project structure

```
src/
  App.tsx, main.tsx        # точка входа React
  calc/                    # CalculationEngine — pure functions
    round.ts               # roundTo3 / formatTons
    capacity.ts            # capacityTons, emptySpace, totalEmpty, correctedWeight
    discharge.ts           # LIFO dischargeFromHold
    types.ts               # Layer, DischargeAllocation, ...
    __tests__/             # Vitest tests (17 базовых + контрольные сценарии)
  services/                # сервисный слой (Tauri commands + бизнес-логика)
  components/, pages/      # React UI (пока пусто)
src-tauri/
  src/lib.rs               # Tauri Builder + регистрация плагинов и миграций
  src/main.rs              # bin entry → vessel_assistant_lib::run()
  migrations/              # SQLite миграции (0001_initial_schema.sql)
  Cargo.toml               # crate name: vessel-assistant
  tauri.conf.json          # productName: VesselAssistant, identifier: com.vesselassistant.app
templates/                 # XLSX/DOCX шаблоны (пока пусто)
```

## Commands

- `npm install` — зависимости.
- `npm run dev` — Vite dev server (только UI, http://localhost:1420).
- `npm run tauri dev` — desktop dev режим (требует установленный `rustup`).
- `npm run tauri build` — production билд десктопа.
- `npm test` — Vitest (single run).
- `npm run test:watch` — Vitest в watch-режиме.
- `npm run typecheck` — `tsc --noEmit`, без сборки.
- `npm run build` — production-билд только UI (typecheck + Vite).

## Conventions

- **TypeScript strict mode**, никаких `any` без явного `// eslint-disable` с пояснением.
- **Расчётные функции pure и детерминированные**. Не читают БД, не зависят от Date.now() напрямую — время передаётся параметром.
- **Все публичные функции `CalculationEngine` имеют unit-тесты**, включая контрольные значения из Приложения C ТЗ (On Board = 23683.955; Total Empty Space 98% = 15881.924).
- **Числа в БД — `REAL`** (SQLite). Конвертация в строку для UI/экспорта — через единый `formatNumber(x) => x.toFixed(3)`.
- **Миграции необратимыми не бывают** — каждая имеет `up.sql` и `down.sql`.
- **Коммиты на английском**, тип по conventional-commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`).

## What NOT to do

- ❌ Хардкодить `KAVKAZ IV` где бы то ни было.
- ❌ Использовать единый SF на уровне груза в расчётах.
- ❌ Записывать формулы Excel в экспортируемые XLSX (только вычисленные значения).
- ❌ Позволять пользователю вручную выбрать «снять с нижней партии» — это нарушает LIFO.
- ❌ Округлять промежуточные расчёты — только финальное отображение/экспорт.
- ❌ Хранить вычисляемые поля как пользовательский ввод.
- ❌ Делать API-вызовы к внешним сервисам в основных функциях (offline-first).

## Skills

В `.claude/skills/` размещены доменные skills, которые подгружаются автоматически:

- `shipping-calculations` — формулы из §5, LIFO-алгоритм, контрольные значения.
- `excel-export` — структура листов, маппинг на исходный шаблон.
- `acceptance-tests` — сценарии AT-01..AT-13 как regression tests.
- `db-migrations` — схема таблиц из §9, соглашения по миграциям.
