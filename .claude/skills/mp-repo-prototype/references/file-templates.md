# File templates

Drop-in templates for the 6–10 files a Magic Patterns prototype needs. Read this when you're about to call `write_artifact_files` — on v1 or on v2+ rounds that edit structure.

Replace the `/* ... from repo ... */` blocks with real values read from the codebase. Only port tokens, fonts, and utility classes the repo actually defines — don't fabricate extras.

## Contents

1. [`index.css`](#indexcss) — CSS tokens, font imports, base layer
2. [`tailwind.config.js`](#tailwindconfigjs) — color and font mapping to CSS vars
3. [`lib/utils.ts`](#libutilsts) — `cn` helper
4. [`lib/mock-data.ts`](#libmock-datats) — types + seed data
5. [`components/ui/<primitive>.tsx`](#componentsuiprimitivetsx) — ported Shadcn primitives
6. [`App.tsx`](#apptsx) — the prototype itself

---

## `index.css`

If the repo uses `@font-face` pointing at local font files (e.g. `@font-face { src: url('/fonts/Inter.woff2') }`), **swap to Google Fonts `@import url()` instead** — MP can't serve local font files from an artifact. Match the family name the repo uses so `font-family` references still resolve.

```css
/* Font imports — MUST be above the tailwind imports */
/* @import url('https://fonts.googleapis.com/...') — one per font family the repo actually uses */

@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';

:root {
  /* Paste the :root { --foo: ... } block from the repo verbatim.
     Keep oklch()/hsl() exactly as the repo has them — don't convert. */
}

/* If the repo has a .dark { --foo: ... } block, paste that too. */

@layer base {
  * { border-color: var(--border); }
  html, body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: <repo's default font stack>;
    -webkit-font-smoothing: antialiased;
  }
  /* Port any custom utility classes the repo defines
     (e.g. .font-display, .stat-num, .num). Skip ones the prototype won't use. */
}
```

## `tailwind.config.js`

MP runs Tailwind v3. If the repo is already v3, copy its config mostly verbatim. If the repo is v4, see `tailwind-v4-to-v3.md` in this directory for the translation.

```js
export default {
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        /* One entry per token the repo defines in :root.
           Shape matches Shadcn's convention:
             foo: { DEFAULT: 'var(--foo)', foreground: 'var(--foo-foreground)' }
           for tokens with foreground pairs, and just 'var(--foo)' otherwise. */
      },
      fontFamily: {
        /* Only include families the repo actually uses. */
      },
      /* Port borderRadius, spacing, etc. only if the repo extends them. */
    }
  }
}
```

## `lib/utils.ts`

Copy verbatim from the repo. Shadcn's default is:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## `lib/mock-data.ts`

Copy **type definitions** verbatim from the repo's types/schema file. Seed a small hand-authored set (3–8 items per entity), enough to exercise UI states — loading, empty, long text, edge values. The real repo usually has DB-seeded data you don't have access to.

```ts
/* Types: copied verbatim from the repo */
export interface Entity { /* ... */ }

export const ENTITIES: Entity[] = [
  /* 3–8 hand-authored items — cover the UI states that matter */
];
```

## `components/ui/<primitive>.tsx`

Copy **verbatim** from `src/components/ui/<primitive>.tsx`. The only change is the `cn` import:

```diff
- import { cn } from "@/lib/utils";
+ import { cn } from "../../lib/utils";
```

Leave Radix imports, `cva` variants, and forwardRef machinery alone.

## `App.tsx`

Consolidate the entire prototype into one file. Import real primitives via relative paths.

**MP's scaffold `index.tsx` imports `App` as a _named_ export.** Use `export function App()` — `export default function App()` will break the compile with `No matching export ... for import "App"`. If you want both, add an explicit `export { App }` alongside a default.

```tsx
import React, { useState } from "react";
import { Button } from "./components/ui/button";
import { ENTITIES } from "./lib/mock-data";
import { cn } from "./lib/utils";

export function App() {
  // Prototype state + JSX
}
```

Stub server calls with `console.log` + `alert`, and comment what the real call would be:

```tsx
function handleSubmit() {
  // Real impl: await api.createEntity({ ... }); analytics.capture("entity_created", ...);
  console.log("Submit:", state);
  alert("Prototype: see console for payload.");
}
```

Render a version marker somewhere visible:

```tsx
<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
  v1
</span>
```

Keep a short changelog as a comment block at the top once you're past v1:

```tsx
// v1 — initial build
// v2 — switched hero to stacked layout; added filter row
// v3 — tightened card spacing; replaced toggle with segmented control
```
