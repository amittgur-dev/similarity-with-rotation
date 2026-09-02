# Stimulus Builder — Claude Code Handoff

## What this is

A research tool for studying how **rotation influences similarity perception**.
Stimuli are configural shapes: a base polygon whose vertices are occupied by
**sub-shapes** (a square made of diamonds, a hexagon made of triangles...).
The researcher composes **similarity questions** — a reference object (A) and
two comparisons (B, C), asking "Is A more similar to B or to C?" — where B and C
differ from A only in rotations.

`index.html` is the working prototype (v9), developed iteratively in claude.ai.
It is a single self-contained file: no dependencies, no build step. It works —
treat it as the seed and the specification, not as sacred code.

## Parameter model (the heart of the tool)

Every object is fully described by:

| parameter        | meaning                                              |
|------------------|------------------------------------------------------|
| `def`            | base shape (n-gon / diamond / star / circle)         |
| `baseRot`        | rotation of the vertex configuration (deg)           |
| `anchor`         | sub-shape placed at each vertex (internal name — UI says "sub-shape") |
| `anchorRot`      | sub-shape orientation (deg)                          |
| `anchorRatio`    | sub-shape relative size (fraction of base radius, default 0.18) |
| `frame`          | `screen` or `vertex` — see below                     |
| `scale`, `x`, `y`| display size and canvas position                     |

**The frame is theoretically critical.** In `screen` frame, sub-shapes hold
absolute orientation when the base configuration rotates. In `vertex` frame,
sub-shapes point outward from the center and co-rotate with the base. This
dissociation (configural vs. elemental rotation) is the core experimental
manipulation — never break these semantics. They are implemented in
`shapeMarkup()` and compensated for in the variant functions.

**Naming:** internal identifiers say `anchor*`; all user-facing text says
"sub-shape" / "sub-shape relative size". Keep that mapping (or do a careful
global rename to `sub*` early, updating the save-file migration — see below).

## Group (question) model

A question = `{a, b, c, cx, cy, s, anchorRatio, title}` referencing three items.
Invariants enforced by `layoutQuestion()`:
- fixed triangle: A top-center, B bottom-left, C bottom-right
- one scale and one sub-shape relative size for all members
- labels A/B/C assigned automatically
- moves as a rigid unit; members editable individually via **double-click**
  (rotations only)

Auto-titles are systematic condition codes:
`Q1 · square/diamond · A(0,0) B(45,0) C(0,45)` — the pairs are
(baseRot, anchorRot). Titles are generated once at creation and are user-editable;
they do NOT regenerate on later edits (deliberate, but a "regenerate title"
affordance would be welcome).

## Group variations — the user's taxonomy (use these terms verbatim)

1. **same relation, different rotation** — A unchanged; B and C rebuilt from A
   with a new rotation magnitude applied to exactly the components (and
   directions) in which they originally differed.
2. **different reference, same relation** — all members turn together (whole,
   frame-aware); the exact A→B, A→C offsets are preserved; only the orientation
   of the reference structure changes.

Documented design decision: "structure" = *which components differ and in which
direction*, not magnitude ratios. If B = A + (shape 20°, subs 40°), a
same-relation variant at 45° gives (45°, 45°), discarding the 20:40 ratio.
Revisit only as a deliberate decision.

Other documented decisions:
- sub-shape relative size is uniform within a question and group-enforced
  (re-applied on every layout pass)
- an object with no sub-shapes renders as a solid fill; with sub-shapes,
  the configuration IS the sub-shapes (no outlines, ever — these are stimuli)
- stimuli render strictly black on white; only the surrounding UI is styled

## Current save format (version 3+)

JSON: `{version, name, view, tray[], items[], questions[]}` — see
`saveCanvas()` / the load handler. The loader migrates older files
(`sub*` keys → `anchor*`, v2 `trials` → `questions`). Keep migrations working;
saved canvases are research artifacts.

## Roadmap (in intended order)

### Phase 0 — repo
- Split into modules: `geometry.js` (pure functions: parser, polyPts,
  shapeMarkup...), `state.js`, `canvas.js` (view/interaction), `console.js`
  (panels), `questions.js`, `io.js` (save/load/export), plus `styles.css`.
- Keep zero-build vanilla ES modules if possible (deployable on GitHub Pages
  as-is). Add a README that includes the parameter model and taxonomy above.
- Unit-test the pure geometry (frame semantics, signedDelta, variant logic) —
  these encode the science.

### Phase 1 — persistence
- Keep file-based save/load (shareable, versionable — canvases belong in git).
- Now that this runs as a real site (not a sandboxed artifact), ADD
  localStorage/IndexedDB autosave + a canvas list ("recent canvases"), with
  file export remaining the canonical format.

### Phase 2 — stimulus export (for running experiments)
- Export any object or question as **SVG and rasterized PNG** at chosen
  resolution (SVG → canvas → PNG, all client-side).
- **Batch export**: all questions of a canvas → zip of PNGs plus a
  `manifest.json`/CSV mapping filename → full parameter record (question title,
  member parameters, positions). The manifest is what analysis scripts join on.
- Deterministic filenames from the systematic titles.

### Phase 3 — experiment mode (same application)
- A "run" mode: presents the canvas's questions as trials — A on top, B/C
  below, click B or C to respond; records response + RT.
- Trial sequence: randomized order option, optional repetition, fixation/ITI.
- Output: CSV download (participant id, trial, all stimulus parameters,
  response, RT). Parameters must come from the same objects that were rendered
  — no duplication of the model.
- Consider a jsPsych export path as an alternative backend, but the built-in
  runner is the priority (the whole point is one application).
- Later: participant-facing URL (GitHub Pages) with results posted to a simple
  endpoint or downloaded locally by the experimenter.

## Suggested opening prompt for Claude Code

> This repo starts from `index.html`, a working single-file prototype of a
> perception-research stimulus builder. Read HANDOFF.md fully first — it
> contains the parameter model, the frame semantics that must not change, and
> the roadmap. Start with Phase 0: modularize into vanilla ES modules with no
> build step, write unit tests for the geometry and variant functions, verify
> the app still behaves identically, then init git and push. Do not change any
> rendering or interaction behavior in Phase 0.

## Known rough edges (fix opportunistically)

- Rubber-band selection tests object centers only (not bounding boxes).
- Vary-grid placement can overlap existing objects.
- Tray items can be removed even if instances on canvas reference them
  (instances keep working — trayRef is a live reference — but the tray entry
  is gone from the save's tray list only if removed before saving: check this
  path when modularizing).
- No undo. Add command-pattern undo/redo early in Phase 0/1; it will pay off.
- Question selection rectangle is approximate at extreme sizes.
