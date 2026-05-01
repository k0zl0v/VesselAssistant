---
name: i18n
description: Use when adding or modifying user-facing strings, working in src/i18n/, src/components/, src/pages/, App.tsx, or any UI element that renders text. Triggers on edits to src/i18n/en.ts, src/i18n/ru.ts, or any React component that needs labels, placeholders, error messages, or aria-labels.
---

# i18n — Russian / English language switching (FR-11)

The app supports RU/EN switching via a custom in-house store (no `i18next` or other library — keeps the bundle small). The active language persists across sessions in `localStorage` (key `vessel-assistant.lang`). Default is English.

## Files

```
src/i18n/
  index.ts                   # store, useT() hook, setLang/getLang/subscribeLang
  en.ts                      # canonical dictionary (`as const`)
  ru.ts                      # mirror — typed { [K in keyof typeof en]: string }
  __tests__/i18n.test.ts     # 6 tests covering parity, fallback, params

src/components/LanguageSwitcher.tsx   # EN / RU pill buttons in App.tsx top nav
```

## Adding a new string

1. Add the key to `src/i18n/en.ts` first — it's the canonical dictionary.
2. Add the same key to `src/i18n/ru.ts` with the Russian translation. **TypeScript will fail if you forget** because `ru.ts` is typed as `{ [K in keyof typeof en]: string }`.
3. Use it in your component:

```tsx
import { useT } from '../i18n';

export function Foo() {
  const t = useT();
  return <button>{t('foo.action.save')}</button>;
}
```

`useT()` re-renders the component when the language changes (via `useSyncExternalStore`). Don't import `t` directly from `../i18n` in components — use the hook so you actually re-render on lang change.

The parity test in `i18n.test.ts` walks every key of `en` and asserts existence in `ru`. If you forget to translate, **the test breaks** — run `npm test` before committing.

## Key naming convention

Pattern: `<area>.<context>.<thing>`. Examples currently in use:

| Prefix | Used by |
|---|---|
| `app.*` | top nav (`app.brand`, `app.nav.voyages`) |
| `voyage.*` | voyage page (totals, status, voyage form) |
| `holds.*` | hold table column headers, lot list, action buttons |
| `lot.*` | AddLotForm |
| `discharge.*` | DischargeForm |
| `sof.*` | SofPanel + AddSofEventForm + SOF event categories |
| `crane.*` | CraneCorrectionPanel |
| `reference.*` | ReferencePage |
| `tools.*` | ToolsPage |
| `backup.*`, `import.*`, `audit.*`, `export.*` | Tools-tab panels |

## Parameter interpolation

```ts
t('overlap_one', { count: 3 })  // "1 event overlaps" or "{count} events overlap"
```

`{name}` placeholders inside the dictionary string are replaced by the `params` map. For pluralization use `_one` / `_many` suffix keys and pick at the call site:

```tsx
t(count === 1 ? 'sof.warning.overlap_one' : 'sof.warning.overlap_many', { count })
```

This is a deliberate simplification — full ICU MessageFormat would be overkill.

## SOF event categories — special case

The 17 SOF categories live in `src/services/sofCategories.ts` as canonical objects with `key` + `defaultDescription`. They have a `label` field for the original English, but **the UI ignores `label`** and looks up `t(\`sof.category.\${cat.key}\`)` instead. When you add a new category:

1. Add it to `sofCategories.ts` with the English fallback label.
2. Add `sof.category.<key>` to BOTH `en.ts` and `ru.ts`.
3. The export sheet (DocumentEngine) writes `category` raw (not via `t`) — this is intentional because Excel is locale-agnostic and the raw key is more searchable.

## Strings with embedded HTML

Some translation strings contain `<em>` / `<strong>` tags for inline emphasis — e.g. `voyage.empty_hint` says "Click _Seed demo_…". These are rendered via `dangerouslySetInnerHTML`:

```tsx
<p dangerouslySetInnerHTML={{ __html: t('voyage.empty_hint') }} />
```

Be cautious — only put plain inline emphasis tags here, never user-derived content.

## What NOT to translate

- **Service-layer error messages** — they go to logs and stay in English. UI catches and either shows raw or wraps in a translated header. The `OVERLOAD:` prefix specifically must NOT be translated; it's a programmatic marker parsed by `AddLotForm`.
- **DB column names, SQL, migration descriptions** — engineering-facing, English only.
- **XLSX export sheet names** ("SOF", "OGV", "CRANE CORR.") — match the original template, language-neutral.
- **Numeric formatting** — uses `formatTons`/`toFixed`, locale-neutral. Localizing decimal/thousands separators is out of scope.
- **Date format `YYYY-MM-DD`** — ISO, language-neutral.

## Confirm prompts

Native `confirm(message)` (browser dialog) and Tauri `confirm(message)` (plugin-dialog) both accept translatable strings:

```tsx
const confirmed = window.confirm(t('lot.overload_confirm', { tons: '1.234' }));
```

```tsx
import { confirm } from '@tauri-apps/plugin-dialog';
const yes = await confirm(t('backup.import_confirm'), { kind: 'warning' });
```

## Common pitfalls

- **Hardcoded English string in JSX** — easy to miss because it works in EN. Grep for `>[A-Z][a-z]` after major UI changes.
- **Forgetting `useT()` hook** — using a direct `import { t }` works for static text but breaks reactivity (component won't re-render on lang switch).
- **Missing key in `ru.ts`** — typecheck catches this *if* you typed `ru` as the structural mirror. Don't loosen that type.
- **`{` in raw strings** — interpolation scans for `{name}` greedily; a literal `{` will be eaten. Use HTML entity `&#123;` if needed (rare).
- **Aria-labels unlocalized** — accessibility regression. Always pass `aria-label={t(...)}`.
- **Translating a programmatic marker** like `OVERLOAD:` — breaks the form's parsing. Programmatic prefixes are NOT user-facing.
