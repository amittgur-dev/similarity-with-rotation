# Similarity with rotation

A research tool for studying how **rotation influences similarity perception**.
Stimuli are configural shapes: a base polygon whose vertices are occupied by
**sub-shapes** (a square made of diamonds, a hexagon made of triangles, …).
The researcher composes **similarity questions** — a reference object (A) and
two comparisons (B, C), asking "Is A more similar to B or to C?" — where B and C
differ from A only in rotations.

Zero-build vanilla ES modules: open `index.html` from any static server.
No dependencies, no bundler. Every push to `main` is deployed to GitHub Pages
by `.github/workflows/pages.yml` after the unit tests pass.

```
python3 -m http.server 8080      # then open http://localhost:8080/
npm test                         # unit tests (node --test, no packages needed)
```

`HANDOFF.md` is the original design brief and roadmap; `prototype/index-v9.html`
is the single-file prototype this code was split from (kept as the behavioural
reference — see *Verification* below).

## Layout

| file | contents |
|------|----------|
| `index.html`, `styles.css` | markup and the (unchanged) UI styling |
| `src/geometry.js` | **pure**: shape parser, vertex layout, `shapeMarkup()`, angle helpers, frame semantics |
| `src/variants.js` | **pure**: rotational variants, vary-grid parser, question structure, the two group variations, condition-code titles, A/B/C assignment |
| `src/io.js` | **pure** save-file (de)serialisation + migrations; thin download/file-read helpers |
| `src/state.js` | the shared mutable records: draft, tray, items, questions, selection, view |
| `src/questions.js` | grouping, rigid layout, ungroup/delete, group-variation commands |
| `src/console.js` | the right-hand panels (creation, object, selection, question) and single-object commands |
| `src/tray.js` | created-shape tray and drag-to-canvas placement |
| `src/canvas.js` | SVG rendering and all pointer / wheel / keyboard interaction |
| `src/main.js` | wiring: button actions, save/load, init |
| `tests/*.test.js` | unit tests for everything marked **pure** — these encode the science |
| `tests/browser/` | Playwright script that drives the prototype and this app identically and diffs the results |

The pure modules never touch the DOM, so they import cleanly into Node for
testing. Only `main.js` runs top-level initialisation.

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
manipulation — never break these semantics. They live in
`anchorOrientation()` / `shapeMarkup()` (`geometry.js`) and are compensated
for in `rotateParams()` (`variants.js`):

| scope | screen frame | vertex frame |
|-------|--------------|--------------|
| whole | baseRot +d, anchorRot +d | baseRot +d (sub-shapes follow) |
| shape | baseRot +d | baseRot +d, anchorRot −d (counter-rotated so only the configuration turns) |
| sub-shapes | anchorRot +d | anchorRot +d |

**Naming:** internal identifiers say `anchor*`; all user-facing text says
"sub-shape" / "sub-shape relative size". Keep that mapping.

Text input grammar: a shape name optionally followed by a rotation
(`square 45`, `hexagon -30°`). Named shapes, `7`/`7-gon` (3–24), `6 star`
(4–12 points), `circle`, `none`. A trailing number is always a rotation, so
`star 5` is a five-point star turned 5°, not a 5-star.

## Question (group) model

A question = `{a, b, c, cx, cy, s, anchorRatio, title}` referencing three items.
Invariants enforced by `layoutQuestion()` on every layout pass:
- fixed triangle: A top-center, B bottom-left, C bottom-right
- one scale and one sub-shape relative size for all members
- labels A/B/C assigned automatically
- moves as a rigid unit; members editable individually via **double-click**
  (rotations only)

Auto-titles are systematic condition codes:
`Q1 · square/diamond · A(0,0) B(45,0) C(0,45)` — the pairs are
(baseRot, anchorRot). Titles are generated once at creation and are
user-editable; they do NOT regenerate on later edits (deliberate).

## Group variations — the taxonomy (use these terms verbatim)

1. **same relation, different rotation** — A unchanged; B and C rebuilt from A
   with a new rotation magnitude applied to exactly the components (and
   directions) in which they originally differed. (`applyRelation()`)
2. **different reference, same relation** — all members turn together (whole,
   frame-aware); the exact A→B, A→C offsets are preserved; only the orientation
   of the reference structure changes. (`turnWhole()`)

Documented design decision: "structure" = *which components differ and in which
direction*, not magnitude ratios. If B = A + (shape 20°, subs 40°), a
same-relation variant at 45° gives (45°, 45°), discarding the 20:40 ratio.
Revisit only as a deliberate decision.

Other documented decisions:
- sub-shape relative size is uniform within a question and group-enforced
- an object with no sub-shapes renders as a solid fill; with sub-shapes,
  the configuration IS the sub-shapes (no outlines, ever — these are stimuli)
- stimuli render strictly black on white; only the surrounding UI is styled

## Save format (version 3)

JSON `{version, name, view, tray[], items[], questions[]}` produced by
`serializeCanvas()`; `deserializeCanvas()` migrates older files
(`sub*` keys → `anchor*`, v2 `trials` → `questions`). Saved canvases are
research artifacts — keep the migrations working (they are unit-tested).
The `canvases/` directory is the intended home for canvases kept in git.

## Verification

Phase 0 was a pure restructuring: no rendering or interaction behaviour
changed. Besides the unit tests, `tests/browser/compare-with-prototype.mjs`
drives `prototype/index-v9.html` and `index.html` through the same ~40-step
interaction script (creation, drops, panel edits, question, both group
variations, all three variant scopes, vary grid, duplicate/delete/⌘D, handle
drags, rubber band, pan/zoom, ungroup, save, reload) and diffs the save file,
the canvas SVG, the console panels and the post-reload state. They are
byte-identical. It needs Playwright (`npm i -g playwright`, chromium):

```
python3 -m http.server 8765 &
node tests/browser/compare-with-prototype.mjs http://localhost:8765 /tmp/out
```

## Roadmap

See `HANDOFF.md`. Phase 0 (this) is done; next are Phase 1 (autosave +
recent canvases, undo/redo), Phase 2 (SVG/PNG + batch export with manifest)
and Phase 3 (experiment run mode).

## Known rough edges (unchanged from the prototype, fix opportunistically)

- Rubber-band selection tests object centers only (not bounding boxes).
- Vary-grid placement can overlap existing objects.
- Removing a tray tile (×) only removes the tile: instances on the canvas keep
  working and the entry is still written to the save file, so it reappears on
  load.
- No undo. Add command-pattern undo/redo early in Phase 1.
- Question selection rectangle is approximate at extreme sizes.
- A stray text selection on the canvas can turn a drag into a native
  browser drag, which cancels the pointer gesture (rubber band gets stuck
  until the next click). `user-select: none` on the canvas would fix it.
- Double-clicking a grouped member relies on the browser's `dblclick`, which
  is fragile because the canvas re-renders on the first click.
