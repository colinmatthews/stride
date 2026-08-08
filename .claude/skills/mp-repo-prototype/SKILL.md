---
name: mp-repo-prototype
description: Use when the user wants a high-fidelity Magic Patterns prototype that matches their actual codebase — real design tokens, real Shadcn components, real data shapes — without running the repo locally. Activates when the user mentions prototyping a feature, wants something testable with users, or asks to iterate on an existing MP prototype. Also activates when the user says "match my app", "use my components", or "bump this to v2" about a Magic Patterns URL.
---

# Magic Patterns prototype that matches the user's repo

Produce a Magic Patterns design that looks and behaves like the user's real app — same CSS tokens, same Shadcn primitives, same data shapes — then iterate on it across versions as stakeholders give feedback.

## When to use

Use this skill when **all four** are true:

1. The user wants a shareable prototype/demo of a UI feature.
2. They have a React + Tailwind + Shadcn codebase (verify via `components.json` and `src/components/ui/`).
3. They can't or won't run the codebase locally for this prototype.
4. They want the prototype to look like *their* app, not a generic MP theme.

**Also** use this skill when the user wants to iterate on an existing MP prototype built this way — e.g. "bump this to v2", "add a filter to that MP design", or they paste an MP URL with feedback.

Don't use for: static Figma mockups, one-off prompt-generated UI where codebase fidelity doesn't matter, or flows where building in the real repo is the right call.

## Bundled references

Load these only when the listed condition is true — they're not needed on every run.

- **`references/design-md-format.md`** — format spec for `DESIGN.md` (the repo-root design system artifact). Read before Step 0 so you know how to generate or consume one.
- **`references/file-templates.md`** — drop-in templates for the files a prototype needs. Read before calling `write_artifact_files` (v1 builds and v2+ rounds that edit file structure).
- **`references/tailwind-v4-to-v3.md`** — translation rules for porting a Tailwind v4 codebase to MP's v3 runtime. Read only when the repo shows v4 signals (`@theme inline`, `@custom-variant`, `@tailwindcss/postcss` dependency).

On a pure `send_prompt` iteration round, none are needed.

## Tools

All in the `mcp__magic-patterns__*` namespace. Load schemas via `ToolSearch` before calling.

| Tool | Purpose |
|---|---|
| `create_design` | First-time design creation. Always call with a `prompt`. |
| `get_design_status` | Poll for generation completion; fetch `activeArtifactId`. |
| `read_artifact_files` | Inspect files (mainly useful after `send_prompt`). |
| `write_artifact_files` | Write files directly. Batch all files in one call. |
| `publish_artifact` | Compile + activate. Preview URL updates after this. |
| `send_prompt` | Iterate via natural language. Good for cosmetic tweaks, risky for structure. |
| `create_new_artifact` | Fork a variant. Only after the root artifact has been published at least once. |
| `get_editor_id_from_url` | Resolve an MP URL to an `editorId` when the user pastes a link. |

If the user pastes an existing MP URL with iteration feedback, call `get_editor_id_from_url` first so you can operate on the right design.

---

## Part 1 — v1: first-time creation

### Step 0. Ensure `DESIGN.md` exists at the repo root

`DESIGN.md` is a committed, human-readable spec of the codebase's design system — brand voice, typography application, spacing rhythm, and other things the raw primitives and tokens don't speak to. Other skills and tools in this repo can read it too.

Read `references/design-md-format.md` for the format before generating or consuming one.

- **If `DESIGN.md` exists at the repo root:** read it. It frames how to apply the design system in Step 1 and Step 4.
- **If it doesn't exist:** generate one by deriving tokens/typography/spacing from the repo and taking a best-effort pass at the prose sections. Write it to the repo root. Tell the user:
  1. What you wrote (summary of sections + token counts).
  2. That the Overview, Do's & Don'ts, and prose under Colors/Layout are best-effort drafts that need human review — brand voice and guardrails are judgment calls the team owns.

DESIGN.md is a **gap-filler**, not a substitute for real code. The raw `:root { --... }` token block stays authoritative for exact color values; the Shadcn primitive source code stays authoritative for component styling. Step 1 still reads those.

Don't regenerate DESIGN.md on iteration rounds (Part 2) unless the user explicitly asks.

### Step 1. Read the rest of the codebase

DESIGN.md (from Step 0) frames intent. You still need to read source for everything it doesn't capture exactly:

- `components.json` — confirms Shadcn style variant and path alias (usually `@/*` → `src/*`).
- The raw global stylesheet (`src/styles.css`, `src/index.css`, or `app/globals.css`) — grab the full `:root { --... }` block, font imports, and any custom utility classes **verbatim**. DESIGN.md summarizes these; the stylesheet holds the authoritative values (especially when the repo uses `oklch()` / `hsl()` that lose fidelity as hex).
- Wherever `cn` lives, usually `src/lib/utils.ts` — confirm the helper's signature.
- The types file(s) for the entities the prototype will use — copy declarations verbatim so the prototype compiles against real shapes.
- 1–2 existing pages/routes that share the visual register with what you're building — DESIGN.md gives you the system; pages show you how it's applied.

Read only the Shadcn primitives the prototype will use, from `src/components/ui/*.tsx`. Common picks: `button`, `input`, `switch`, `checkbox`, `radio-group`, `select`, `slider`, `progress`, `card`, `dialog`, `tabs`. Port these **verbatim** — DESIGN.md's Components section is brand-level guidance, not a replacement for the real primitive source code.

While reading, check for Tailwind v4 signals. If present, also read `references/tailwind-v4-to-v3.md` before building the config.

### Step 2. Create the MP design

```ts
mcp__magic-patterns__create_design({
  name: "<project> — <feature> v1",
  prompt: "Minimal placeholder: a centered heading. We'll overwrite all files immediately after this — just need the scaffold."
})
```

Response returns `editorId`, `Editor URL`, `Preview URL`, and `activeArtifactId`. Keep all four.

**Never omit the prompt.** Blank scaffolds hit an MP bug where publishing throws `Cannot read properties of undefined (reading 'compilationId')`. The minimal-prompt approach forces MP's full generation pipeline and correctly sets compilation metadata.

**Never pass `designSystem: "Shadcn"`.** The preset currently 500s with `outline-ring/50 class does not exist`. You're porting Shadcn manually anyway.

### Step 3. Poll until generation completes

```ts
mcp__magic-patterns__get_design_status({ editorId })
```

- `isGenerating: true` → wait ~60s and re-poll. Minimal prompts usually finish under a minute.
- `isGenerating: false` → proceed. Use the returned `activeArtifactId` as your write target.

### Step 4. Write all files in one batch to the root artifact

Do **not** call `create_new_artifact` first — branching before the root has been published hits the same `compilationId` bug.

Read `references/file-templates.md` for the drop-in templates.

Include a copy of `DESIGN.md` in the batch so the MP artifact carries the design spec on board — anyone iterating via `send_prompt` or forking the artifact then has the brand guidance available without having to leave MP.

```ts
mcp__magic-patterns__write_artifact_files({
  artifactId: <activeArtifactId>,
  files: [
    { fileName: "DESIGN.md",                    content: "..." },   // copy from repo root
    { fileName: "index.css",                    content: "..." },
    { fileName: "tailwind.config.js",           content: "..." },
    { fileName: "lib/utils.ts",                 content: "..." },
    { fileName: "lib/mock-data.ts",             content: "..." },
    { fileName: "components/ui/button.tsx",     content: "..." },
    // ...one entry per Shadcn primitive actually used
    { fileName: "App.tsx",                      content: "..." }
  ]
})
```

MP's bundler ignores `.md` files for the compiled output — they sit alongside the code as static artifact files. No compile impact.

### Step 5. Publish

```ts
mcp__magic-patterns__publish_artifact({
  artifactId: <activeArtifactId>,
  editorId
})
```

Success returns `index.js`, `index.js.map`, `index.css` in the compiled files list. On compile failure, read the error, fix the offending file, republish. Common causes: a missing relative import, a CSS token referenced in `tailwind.config.js` but not defined in `:root`, or a font import below the `@import 'tailwindcss/base'` line.

### Step 6. Share both URLs with a visible version marker

The prototype should render its current version in the UI (see `references/file-templates.md`, `App.tsx` section). This is the fastest way to confirm a viewer is looking at the new bundle vs. a cached one.

Share both URLs in the handoff:

- **Editor URL** (`magicpatterns.com/c/<editorId>`) — user iterates here
- **Preview URL** (`project-<slug>.magicpatterns.app`) — for sharing with testers

Always include the handoff summary from [What's out of scope](#whats-out-of-scope) so stakeholders don't assume the prototype is closer to shippable than it is.

---

## Part 2 — v2 and beyond: iterating

Most prototypes go through 3–5 rounds once real people look at them. Plan for iteration, don't improvise.

### Resolve the artifact first

If the user pastes an MP URL or mentions "the Strava prototype" without an `editorId`, call `get_editor_id_from_url` to resolve it. Then `get_design_status` to confirm the current `activeArtifactId`.

### Pick the right tool for the change

| Kind of change | Use | Why |
|---|---|---|
| Cosmetic tweak ("make this darker", "reduce padding") | `send_prompt` | Fast, natural language. Low-risk for visual-only changes. |
| Data shape, logic, interaction, or copy change | `write_artifact_files` on same artifact | Deterministic. `send_prompt` can regress CSS tokens or rewrite `App.tsx` in MP's default style. |
| New Shadcn primitive or new local file | `write_artifact_files` on same artifact | Add the new file(s); re-send `App.tsx` only if its imports changed. |
| Fork a variant to A/B-compare | `create_new_artifact` from the root | Safe now that the root has been published. Keeps the original preview URL working. |
| Fundamentally different direction | New `create_design` | The old artifact stays around for comparison. Don't fight the old version. |

Rule of thumb: if you'd have to name a specific file or variable in English to describe the change, skip `send_prompt` and edit the file directly.

### The iteration sub-loop

For each bump from `v_N` → `v_N+1`:

1. **Cluster the feedback.** Cosmetic, structural, data, copy, or "wrong direction"? Different tools for different kinds.
2. **Pick the tool** from the table above.
3. **Edit minimally.** With `write_artifact_files`, send only the files that changed — you don't have to re-send the whole tree.
4. **Bump the version marker** in `App.tsx` (e.g. `v1` → `v2`).
5. **Publish** (`publish_artifact`) if you wrote files, or re-poll `get_design_status` if you used `send_prompt`.
6. **Reshare** the Preview URL with a one-line changelog of what moved.

### Keep a running changelog

Three iterations in, you won't remember why v2 looked different from v1. Keep a short changelog at the top of `App.tsx` (or as a `CHANGES.md` in the artifact) — see `references/file-templates.md` for the pattern.

### Avoid regressions

`send_prompt` can quietly rewrite `index.css` or drop CSS vars. After any `send_prompt`, run `read_artifact_files` on `index.css` and `tailwind.config.js` and diff against what you expect. If tokens have drifted, restore them with `write_artifact_files`.

The `:root { --... }` token block is the one thing that makes the prototype look like the real app. Treat it as load-bearing.

### When to start fresh

If feedback is "I actually want this to look completely different," do a new `create_design` rather than forcing iteration on the old artifact. Keep the old Preview URL around for comparison.

---

## Known MP issues and workarounds

| Issue | Symptom | Workaround |
|---|---|---|
| Blank scaffold missing `compilationId` | Preview URL throws `Cannot read properties of undefined (reading 'compilationId')` | Always pass a `prompt` to `create_design` |
| Broken Shadcn preset | `create_design({ designSystem: "Shadcn" })` returns 500 with `outline-ring/50 class does not exist` | Omit `designSystem`, port Shadcn manually |
| Branching before first publish | Same `compilationId` error | Write + publish the root artifact first; only branch with `create_new_artifact` after |
| Tailwind v4 syntax in MP | `@theme inline`, `@custom-variant` don't work | See `references/tailwind-v4-to-v3.md` |
| `@/` alias missing | `Module not found: @/lib/utils` | Rewrite `@/` imports to relative paths when porting |
| Font imports misplaced | Fonts silently don't load | Font `@import url(...)` must be the very first lines of `index.css` |
| `send_prompt` drifts tokens | Preview starts looking generic after a natural-language iteration | `read_artifact_files` on `index.css` + `tailwind.config.js` after each `send_prompt`; restore via `write_artifact_files` if needed |

---

## File set sizing

Typical prototype is 7–11 files:

- `DESIGN.md` — copied from the repo root (see Step 0)
- `index.css`
- `tailwind.config.js`
- `lib/utils.ts`
- `lib/mock-data.ts`
- `components/ui/*.tsx` — one per Shadcn primitive actually used
- `App.tsx`

MP's scaffold also includes `index.tsx` that mounts `App` into the DOM — leave it alone, don't overwrite it and don't write your own. Because that file imports `App` as a _named_ export, your `App.tsx` must use `export function App()` (see `references/file-templates.md`).

Never port primitives or types the prototype doesn't use. A lean file tree iterates faster.

---

## What's out of scope

State this explicitly alongside the URLs on every handoff — v1 or v5:

- **No real backend** — API calls are stubbed to `console.log` / `alert`.
- **No analytics** — PostHog/Segment/etc. calls aren't emitted.
- **No auth, routing, or middleware** — `App.tsx` renders directly.
- **No real permissions or integrations** — flags, role checks, and external services are simulated or skipped.

List what the real implementation would wire up, so stakeholders understand where the prototype ends and the real work begins.
