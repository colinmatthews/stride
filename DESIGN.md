---
version: alpha
name: Stride
description: Editorial, athletic design system for an endurance training product. Bold ink + bone + signal-orange palette; display serif-style geometric + utilitarian mono; spacious, data-dense, ticker-uppercase eyebrows.
colors:
  background: "#FAFAF7"
  foreground: "#2A241E"
  surface: "#FFFFFF"
  surface-2: "#F1EEE8"
  card: "#FFFFFF"
  card-foreground: "#2A241E"
  popover: "#FFFFFF"
  popover-foreground: "#2A241E"
  primary: "#E76A2D"            # signal orange
  primary-foreground: "#FCFCFC"
  secondary: "#332E27"           # deep ink
  secondary-foreground: "#FAFAF7"
  muted: "#EDE9E2"
  muted-foreground: "#6B635A"
  accent: "#E1B650"              # warm yellow
  accent-foreground: "#2A241E"
  destructive: "#D14A2F"
  destructive-foreground: "#FCFCFC"
  border: "#E2DDD4"
  input: "#E2DDD4"
  ring: "#E76A2D"
  kudos: "#E76A2D"
  pr: "#5DB57A"                  # PR green
typography:
  display-hero:
    fontFamily: "Space Grotesk"
    fontSize: "5.25rem"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  display-xl:
    fontFamily: "Space Grotesk"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  display-lg:
    fontFamily: "Space Grotesk"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-md:
    fontFamily: "Space Grotesk"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  display-sm:
    fontFamily: "Space Grotesk"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  body-lg:
    fontFamily: "Inter"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "0"
  body-md:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  body-sm:
    fontFamily: "Inter"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label-sm:
    fontFamily: "Inter"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  eyebrow-mono:
    fontFamily: "JetBrains Mono"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.22em"
  stat-num:
    fontFamily: "Space Grotesk"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
rounded:
  none: "0px"
  sm: "calc(0.5rem - 4px)"
  md: "calc(0.5rem - 2px)"
  lg: "0.5rem"
  xl: "calc(0.5rem + 4px)"
  full: "9999px"
spacing:
  base: "4px"                    # 4/8 rhythm
  step: "8px"
  section: "5rem"                # 80px between major page sections
  gutter: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  dialog:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  tabs-list:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
  tab-trigger-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  avatar:
    rounded: "{rounded.full}"
    size: "2.5rem"
  badge:
    rounded: "{rounded.md}"
    padding: "0.125rem 0.625rem"
---

# Stride — Design System

## Overview

Stride is a training home for runners, riders, and endurance athletes. The brand voice is **editorial, plain-spoken, and faintly competitive** — closer to a well-designed long-form magazine (think field-notes layouts, ticker mastheads, eyebrow labels) than a typical consumer fitness app. Nothing is decorative; every number has a reason.

Visual register:
- **Quiet bone background**, **deep ink** for gravitas, **signal orange** reserved for the single thing that matters per screen (KOM, CTA, primary action).
- **Typography does most of the work.** Huge display headlines, tight tracking, mono eyebrows in uppercase with `0.22em` letter-spacing. Body copy stays generous and calm.
- **Generous whitespace, section breaks are borders, not shadows.** Cards are rounded but elevation is light — the `:root` block has no `boxShadow` scale on purpose.
- **Numbers are first-class.** Tabular numerals are applied everywhere a metric appears (`.stat-num`, `.num`). Times, distances, paces, ranks must not shift width across rows.

_Best-effort draft — needs human review on brand voice and edge-case tone._

## Colors

Palette roles:
- **`primary` (signal orange, `oklch(0.68 0.21 38)`)** — the one color that means "this is the thing." KOM/QOM indicators, the single primary CTA on a screen, active tab accents, progress fills, eyebrow accents on editorial pages. Never use for body text or as a background for more than ~10% of the screen.
- **`secondary` (deep ink, `oklch(0.22 0.02 60)`)** — gravitas. Landing-page CTAs, course-record callouts, marquee bars. Paired with `secondary-foreground` (near-white) for high contrast.
- **`accent` (warm yellow)** — rarely used; reserved for secondary highlights or achievement affordances.
- **`kudos` / `pr`** — domain-specific semantic colors. `kudos` mirrors primary (the social-positive signal). `pr` is green — reserved for personal-record moments and "readiness: high" states.
- **`surface` / `surface-2`** — the subtle two-tone layering. `surface-2` is the slightly-tinted bone used for segmented controls, table headers, soft containment.
- **`muted` / `muted-foreground`** — disclaimer-grade text and inactive backgrounds.

The `:root` block uses `oklch()` values — those are authoritative. Hex in this file is an sRGB approximation for agents that need a scalar. _Prose above is best-effort; validate before shipping external materials._

## Typography

Three families:
- **Space Grotesk** (`--font-display`) — headlines, stat numbers, anything that must feel confident. Weight 700 at large sizes, 600 at subhead. Always negative tracking (`-0.02em` to `-0.03em`).
- **Inter** (`--font-body`) — default body. 400 for paragraphs, 500 for labels, 600 when adjacent to display text.
- **JetBrains Mono** (`--font-mono`) — uppercase eyebrows, timestamps, numeric affordances, fine print. Always uppercase when used as eyebrow; `letter-spacing: 0.22em`.

Application rules:
- All h1–h4 get `font-display`, `font-weight: 700`, `letter-spacing: -0.02em` automatically (base layer CSS).
- Any displayed metric (distance, time, kudos count, rank) uses `.stat-num` (display family + tabular-nums + tight tracking) or at minimum `.num` (tabular-nums on body font).
- Eyebrow labels above sections/cards: mono, `text-[10px]` or `text-[11px]`, uppercase, `tracking-[0.22em]`, `text-muted-foreground`. This is the single most recognizable Stride tic — don't omit it.

## Layout

- **Max content width**: `1320px` (`max-w-[1320px]`). Beyond that, horizontal padding (`px-6 lg:px-10`) holds edges.
- **Grid**: 8px rhythm with 4px half-steps. Gaps of `gap-6` / `gap-8` inside content grids; `space-y-5` between feed cards.
- **Page structure**: header → hero/section bands → editorial grid → CTA band → footer. Full-width bands (marquee, CTA) break out with negative horizontal margins (`-mx-6 lg:-mx-10`) against a fixed max-width inner container.
- **Containment**: preferred via 1px `border border-border` + `rounded-xl`. Shadows are rare and subtle (`shadow-sm` when used). No glassmorphism.

_Best-effort draft — page-structure rules are inferred from landing + feed + segment-detail; may not hold for every view._

## Elevation & Depth

Hierarchy comes from **contrast and tonal layering**, not shadows.

1. **Page background** (`--background`, bone) — floor.
2. **Surface** (`--surface`, pure white) — cards, table bodies, dialogs.
3. **Surface-2** (`--surface-2`, warm off-bone) — table headers, segmented controls, inactive tab backgrounds.
4. **Secondary** (`--secondary`, deep ink) — high-stakes blocks: landing CTA, course-record callout, marquee.
5. **Borders** (`--border`) — the main divider. 1px, full-opacity on surface, `border/70` when softened.

Shadcn default `shadow` / `shadow-sm` are accepted on interactive elements (buttons, popovers, dropdowns) but avoided on static containers.

## Shapes

- **Radius scale** anchors on `--radius: 0.5rem`.
  - `sm` → `calc(var(--radius) - 4px)` ≈ 4px
  - `md` → `calc(var(--radius) - 2px)` ≈ 6px
  - `lg` → `var(--radius)` = 8px
  - `xl` → `calc(var(--radius) + 4px)` = 12px
  - `full` → 9999px (avatars, progress bars)
- **Avatars** are always `rounded-full`.
- **Progress / KOM indicators** use `rounded-full` tracks.
- **Cards / dialogs / table shells** use `rounded-xl`.
- **Buttons / badges / tabs** use `rounded-md`.
- Landing-page hero "magazine blocks" break the rule and use **sharp corners** (no radius) for editorial weight.

## Components

Brand-level guidance. The Shadcn primitive source in `src/components/ui/*.tsx` owns exact styling — this is _when_ and _why_, not _how_.

- **Button** — variants `default` (primary orange), `secondary` (ink), `outline`, `ghost`, `link`. One `default` button per screen max; use `outline` or `ghost` for secondary actions.
- **Dialog** — centered modal, 1px border, `bg-background`, `p-6`, `sm:rounded-lg`, overlay `bg-black/80`. Title in `text-lg font-semibold`. Description `text-sm text-muted-foreground`. X close in top-right.
- **Tabs** — horizontal tab list uses `bg-muted` with active tab `bg-background text-foreground shadow`. Eyebrow mono labels appear _above_ tabs, not inside them.
- **Avatar** — `h-10 w-10 rounded-full`; scales down to `h-7 w-7` inside dense table rows, up to `h-14 w-14` in testimonial figures.
- **Badge** — default is primary; use `secondary` for sport tags, `outline` for neutral chips. Sport badges carry uppercase tracking.
- **Table (editorial)** — `bg-surface`, `rounded-xl`, border wrapper, `bg-surface-2` thead with mono uppercase tracking. Row hover is `bg-muted/50` or `bg-primary/5` for "you"-rows. Rank/time/pace columns always monospace + tabular.

_The Components section draws from real `cva` variants; specific styling is owned by the primitives._

## Do's and Don'ts

**Do:**
- Reserve signal orange for the single most important thing per screen (CTA, KOM indicator, primary stat).
- Use mono uppercase eyebrows (`tracking-[0.22em]`) above every major block of content — it's the clearest Stride tic.
- Put `.stat-num` or `.num` on every displayed metric, no exceptions.
- Let borders and tonal shifts carry hierarchy. Prefer a border + tint to a drop shadow.
- Keep the deep-ink `secondary` block for moments that earn gravitas (course record, hero CTA, marquee).

**Don't:**
- Don't use primary orange as a field-level background (banners, full cards, hero panels). It overwhelms and loses its signal value.
- Don't mix rounded-xl cards with sharp-cornered editorial blocks on the same surface — pick one register per section.
- Don't use non-tabular numerals in tables or leaderboards. Ranks shifting width across rows is a bug.
- Don't rely on icon-only affordances without mono eyebrow context — this app talks to athletes who scan text faster than icons.
- Don't use more than two display-font sizes in a single modal or card.

_Best-effort draft — team should refine Don'ts from usage and real product review._
