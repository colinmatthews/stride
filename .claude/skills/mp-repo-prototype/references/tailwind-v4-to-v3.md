# Translating Tailwind v4 → v3 for Magic Patterns

MP runs Tailwind v3. Read this file when the repo is on v4. Skip it if the repo is already v3 — copy its `tailwind.config.{js,ts}` mostly verbatim instead.

## Signs the repo is on Tailwind v4

- `@theme inline { ... }` block in the stylesheet
- `@custom-variant` directives
- Minimal or missing `tailwind.config.js`
- `@tailwindcss/postcss` or `@tailwindcss/vite` in `package.json` (v4-only packages)

If none of these are present, the repo is v3 — skip this file.

## Translation rules

### 1. Keep the `:root` block verbatim

The `:root { --foo: oklch(...) }` block in `index.css` stays exactly as the repo has it. CSS custom properties work identically in v3 and v4.

### 2. Move `@theme inline` into `tailwind.config.js`

Anything inside `@theme inline { --color-foo: var(--foo) }` becomes a mapping in `tailwind.config.js` `theme.extend.colors`:

```css
/* v4 (in index.css) */
@theme inline {
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-background: var(--background);
}
```

becomes:

```js
/* v3 (in tailwind.config.js) */
export default {
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        background: 'var(--background)',
      }
    }
  }
}
```

Use the Shadcn `{ DEFAULT, foreground }` shape for tokens with a paired foreground; plain `'var(--foo)'` for standalone tokens.

**Non-color entries in `@theme inline` map to their matching `theme.extend.*` key**, same idea:

| v4 `@theme inline` prefix | v3 `theme.extend.*` key |
|---|---|
| `--color-*` | `colors` |
| `--radius-*` | `borderRadius` |
| `--spacing-*` | `spacing` |
| `--font-size-*` | `fontSize` |
| `--font-*` (family) | `fontFamily` |
| `--breakpoint-*` | `screens` |
| `--shadow-*` | `boxShadow` |

`calc()` expressions work verbatim — e.g. `--radius-sm: calc(var(--radius) - 4px)` becomes `sm: 'calc(var(--radius) - 4px)'` under `borderRadius`.

### 3. Translate `@custom-variant dark`

```css
/* v4 */
@custom-variant dark (&:where(.dark, .dark *));
```

becomes:

```js
/* v3 */
export default {
  darkMode: 'selector', // uses the `.dark` class selector
  // ...
}
```

Wrap the app in a `.dark` class when dark mode is active (toggle it on `<html>` or a wrapper div).

### 4. Font imports must be at the very top of `index.css`

```css
/* CORRECT — fonts first */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';
```

CSS grammar requires `@import` statements before any other rules, and Tailwind v3 enforces it strictly. v4 was more forgiving, so v4 codebases sometimes have fonts further down — move them up when porting.

### 5. Custom utility classes carry over unchanged

Anything in `@layer utilities` or `@layer base` works identically in v3. No translation needed.

### 6. Strip `tw-animate-css` classes from ported primitives

Shadcn v4 projects commonly use [`tw-animate-css`](https://github.com/Wombosvideo/tw-animate-css) for the Radix-state animations in `dialog`, `sheet`, `dropdown-menu`, `popover`, `tooltip`, etc. MP doesn't ship this library — classes like `data-[state=open]:animate-in`, `data-[state=closed]:fade-out-0`, `data-[state=open]:zoom-in-95`, `data-[side=bottom]:slide-in-from-top-2` won't do anything.

Two options when porting:

- **Strip silently** (usual choice for prototypes): delete those classes from the primitive's `className` strings. The dialog still opens and closes, it just doesn't animate. No visible failure, the only cost is a slightly snappier UI than the real app.
- **Replace with Tailwind v3 built-ins**: use `transition-opacity`, `duration-200`, basic `animate-in fade-in-0` from the built-in animation utilities. More work; usually not worth it for a prototype.

Search for `data-[state=` and `data-[side=` in the primitive files you port — they're the telltale markers.

## Non-obvious gotchas

- **`@apply` with custom variants**: v4's `@apply dark:bg-muted` inside a component works in v3 only if `darkMode: 'selector'` is set and the class is reachable under `.dark`.
- **Tokens referenced but undefined**: if `tailwind.config.js` maps `colors.surface-2: 'var(--surface-2)'` but `:root` never defines `--surface-2`, the compile won't error but the class will render as an empty string. Double-check every token mapped in the config has a matching entry in `:root`.
- **Arbitrary values with CSS vars**: `bg-[var(--surface-2)]` works in both v3 and v4 — a decent escape hatch if a token is one-off and not worth putting in the config.
