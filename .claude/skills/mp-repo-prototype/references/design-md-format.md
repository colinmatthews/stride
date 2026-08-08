# DESIGN.md — format reference

`DESIGN.md` is a plain-text spec of a brand + product's visual identity, designed to be read by humans and AI agents alike. It lives at the repo root, is committed, and is meant to be human-maintained.

## Role in this skill

DESIGN.md is a **gap-filler**, not a substitute for real code.

The source-of-truth hierarchy when building a prototype:

1. **Real Shadcn primitives** (`src/components/ui/*.tsx`) — authoritative for component styling. Port verbatim.
2. **Raw `:root { --... }` token block** — authoritative for exact color values, especially when the repo uses `oklch()` / `hsl()` that lose fidelity as hex. Port verbatim.
3. **DESIGN.md** — fills in what the above don't speak to: brand voice, typography application on pages, spacing rhythm, section hierarchy, empty-state feel, emotional register.

Never substitute DESIGN.md's Components section for a real Shadcn primitive. Never substitute DESIGN.md's color hex values for the repo's `:root` token block in the prototype's `index.css`.

## File location

`DESIGN.md` at the repo root. Commit it. Also include a copy in the Magic Patterns artifact (see SKILL.md Step 4) so the prototype carries the spec on board — anyone iterating via `send_prompt` or forking the artifact has the brand guidance available.

## Structure

Two parts:

- **YAML frontmatter** (optional) — machine-readable design tokens between `---` fences at the top.
- **Markdown body** — prose + guidance in canonical section order.

## YAML frontmatter schema

```yaml
---
version: alpha                    # optional, current: "alpha"
name: <string>
description: <string>             # optional
colors:
  <token-name>: "#RRGGBB"         # hex, sRGB
typography:
  <token-name>:
    fontFamily: <string>
    fontSize: <dimension>         # e.g. "16px", "1.5rem"
    fontWeight: <number>          # e.g. 400, 600
    lineHeight: <dimension | unitless number>
    letterSpacing: <dimension>
    fontFeature: <string>         # optional — OpenType feature tags for font-feature-settings, e.g. "tnum" (tabular numerals), "ss01", "liga"
    fontVariation: <string>       # optional — variable-font axis values for font-variation-settings, e.g. "wght" 400, "wdth" 100
rounded:
  <scale>: <dimension>            # e.g. sm: 4px, full: 9999px
spacing:
  <scale>: <dimension | number>
components:
  <component-name>:
    backgroundColor: <color | {colors.X}>
    textColor: <color | {colors.X}>
    typography: <{typography.X}>
    rounded: <dimension | {rounded.X}>
    padding: <dimension>
    size | height | width: <dimension>
---
```

**Token references** — `{path.to.token}` resolves against the YAML tree. Used in `components`. Example: `backgroundColor: "{colors.primary}"`.

**Dimensions** — strings with unit: `px`, `em`, `rem`.

**Colors** — hex strings starting with `#`, sRGB.

## Section order

All h2s. Omit sections that don't apply; keep the order for those present. An optional h1 may appear for document title.

1. **Overview** (aka "Brand & Style") — holistic look and feel. Brand personality, audience, emotional register (playful/professional, dense/spacious). Guides decisions when a specific token doesn't speak.
2. **Colors** — define at least `primary`. Common palette roles: `primary`, `secondary`, `tertiary`, `neutral`. Prose may use evocative names ("Midnight Forest Green"); tokens use systematic names (`primary`). Tokens are normative; prose is context.
3. **Typography** — most systems have 9–15 levels. Common naming: `headline`, `display`, `body`, `label`, `caption`, optionally split by `sm`/`md`/`lg`. Describe the voice each family/level embodies.
4. **Layout** (aka "Layout & Spacing") — grid / spacing strategy: fluid vs. fixed-max-width, base unit (8px + 4px half-step is common), containment patterns.
5. **Elevation & Depth** — how visual hierarchy is conveyed. Shadows, tonal layers, borders, color contrast.
6. **Shapes** — corner radius language. Use `rounded.*` tokens.
7. **Components** — brand-level guidance for atoms (buttons, chips, lists, tooltips, inputs). Variants go under related keys: `button-primary`, `button-primary-hover`, `button-primary-active`. **In a Shadcn codebase, the primitive source code is authoritative for exact styling**; the Components section here captures when/how to use each and any brand-level overrides.
8. **Do's and Don'ts** — short, practical guardrails. "Do use primary only for the single most important action per screen." "Don't mix rounded and sharp corners on the same view."

## Recommended token names (non-normative)

- **Colors:** `primary`, `secondary`, `tertiary`, `neutral`, `surface`, `on-surface`, `error`
- **Typography:** `headline-display`, `headline-lg`, `headline-md`, `body-lg`, `body-md`, `body-sm`, `label-lg`, `label-md`, `label-sm`
- **Rounded:** `none`, `sm`, `md`, `lg`, `xl`, `full`

## Unknown content

| Scenario | Behavior |
|---|---|
| Unknown section heading | Preserve; don't error |
| Unknown color/typography/spacing token name | Accept if value is valid |
| Unknown component property | Accept with a note |
| Duplicate section heading | Reject the file |

---

## Generating DESIGN.md from a codebase

Work top-down from hardest (human judgment) to easiest (mechanical):

| Section | Source |
|---|---|
| Overview | 1–2 example pages + any `README` brand notes. **Best-effort draft** — needs human review. |
| Colors (tokens) | Every color CSS var in `:root` / `.dark`. Convert `oklch()`/`hsl()` to hex for the YAML; flag that the originals are in the stylesheet. |
| Colors (prose) | Name each palette role based on its apparent use. Best-effort. |
| Typography | `tailwind.config.js` `fontFamily` + `fontSize` scale. Cross-reference against actual usage on 1–2 pages to pick 9–15 levels that are really used. |
| Layout | Derive from `tailwind.config.js` `spacing` + real page structure. Prose narrative is best-effort. |
| Elevation | Look at `boxShadow` scale + real card/modal usage. |
| Shapes | `--radius-*` tokens + Shadcn primitive defaults. |
| Components | `cva` variants inside each `src/components/ui/*.tsx`. Capture the variant structure, not exact styling (which the source code owns). |
| Do's and Don'ts | Best-effort inference. Flag for human review. |

After generating, tell the user which sections are best-effort drafts (Overview, Do's & Don'ts, prose under Colors/Layout) and suggest they refine them.

## Consuming DESIGN.md in a prototype

When DESIGN.md is present:

- Read it **first**, before the rest of the codebase — it frames how tokens and primitives are meant to be applied.
- Use it for decisions where primitives and raw tokens don't speak: page backgrounds, section hierarchy, typography application on screens, empty-state feel, emotional register.
- Do **not** substitute it for real code. The raw `:root` block and real primitives remain the source of truth for exact values and component styling.
- If DESIGN.md and the repo disagree (e.g. a color in DESIGN.md doesn't match `:root`), trust the repo and note the drift — DESIGN.md may be stale.
