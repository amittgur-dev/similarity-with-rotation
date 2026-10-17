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

Canvas navigation: drag empty space to move around, scroll to pan,
⌘/ctrl+scroll or the +/− buttons to zoom (the percentage resets the view, as does settings → reset view),
space+drag or the middle button also pan. Click an object to select it,
**shift-click** further objects to build a multi-selection, or **shift-drag**
a box; with three (or four) ungrouped objects selected press "make similarity
question" to group them. Whole questions join a selection the same way
(shift-click a member or the title; a box catches a question whole), so
several objects and questions can be chosen together: drag any of them to
move the selection as one, press Delete or *delete all* to remove it all,
or click one without shift to select just that one.

**Continuous rotation.** Any object on the canvas can turn on its own, in
two independent ways that combine. The **+** next to the shape's *orient*
opens the shape's rotation in place (the rest of the panel moves down):
direction (↺ ccw / still / ↻ cw), speed in degrees per second, and what
turns with it — the **whole figure** (the sub-shapes come along) or the
**shape only** (the sub-shapes keep their orientation). The **+** next to
the sub-shape's *orient* opens the sub-shapes' own rotation: direction and
speed, turning them in place. Set the two against each other for the shape
one way and the sub-shapes the other. Each object, including each member
of a question, has its own settings. The stored orientations never
change — the design is what the panels show and the PDF and images export
draw; on the canvas and in runs (pilot and participant) the figure turns
from that orientation, each trial starting afresh. Every object runs on
one shared clock, so objects with the same speed turn in step (two squares
at 30°/s always sit at the same angle from their starting orientations);
*restart all* in a rotation box puts every turning object back at its
starting orientation at the same instant, and an object's **offset** puts
it that many degrees ahead of the others (0: in step). Trial records carry
`spin_deg_per_s`, `spin_turns` and `spin_offset_deg` (the shape's, signed,
+ clockwise) and `sub_spin_deg_per_s` and `sub_spin_offset_deg` per member;
saved files carry `spin: {dps, scope, sub, phase0?, subPhase0?}` on the
object. The frame keeps its meaning throughout (`src/spin.js`, pure and
unit-tested).

**Titles and notes.** Double-click empty canvas to write a text where you
clicked (Enter keeps it, shift+Enter adds a line, Escape puts the old text
back; nothing written, nothing kept). Double-click a text to edit it in
place; the Text panel also edits it and sets its size. Texts drag, nudge
with the arrow keys, join a selection with shift-click or a box, and go
with Delete. They are annotations: saved with the canvas (`texts`), never
part of a stimulus, so runs, the PDF and the exports leave them out.

**pdf** (next to save / export / import) downloads every question on the
canvas as a vector PDF: six per A4 page, as many pages as needed, all drawn
at one scale so sizes stay comparable, each with its title and experiment
codes, and a footer scale bar showing 10 mm of the calibrated on-screen size.

**images** exports every stimulus on the canvas as its own image: one file
per distinct figure, not per question, in a zip. Every image is exactly the
size you choose (square, 64–4096 px, default 512), with a white background,
and all images share one scale, so relative sizes are preserved. By default
the scale is chosen so the largest stimulus fills the image at any rotation,
with an 8% margin on each side. Alternatively, set a fixed number of image
pixels per canvas pixel; anything that would be cut off is reported, and
export waits until everything fits. Each figure is centred on its rotation
centre, so rotated versions line up when shown in the same place. Identical
figures share one file (untick that for one file per object). The zip holds:
- `S001_….png`, plus the same image as SVG if you tick that option;
- `manifest.csv` / `.xlsx`: every parameter, the figure's size in image pixels
  and in mm on the designer's screen, the canvas object ids, and the questions
  that use each image (`Q3:B` = comparison B of question 3);
- a README.

Names read `S007_square-diamond_b045_s000_screen_r18_x100`: stimulus 7, a
square of diamonds, base 45°, sub-shapes 0°, screen frame, sub-shape size 18%,
scale 100%. `_tex5` marks a texture with 5 per side; solids read
`S009_triangle-solid_b090_x150`.

The console on the right can be resized by dragging the thin splitter on
its left edge; clicking the splitter (or dragging it all the way right)
collapses it, and clicking again brings it back. The width is remembered.

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
| `src/library.js` | **pure** in-browser canvas library over an injected storage (localStorage in the app) |
| `src/calibration.js`, `src/calibrate.js` | **pure** px-per-mm model + storage, and the card-outline overlay |
| `src/splitter.js` | resizable / collapsible console |
| `src/tour.js` | first-run walkthrough |
| `src/experiment.js`, `src/run.js` | **pure** experiments model, trial model, stimulus markup, CSV and summary; the strip, lens, experiment panel and pilot runner |
| `src/xlsx.js` | **pure** .xlsx writer (inline strings) for results and manifests |
| `src/history.js` | **pure** undo/redo over injected snapshot/restore |
| `src/stimexport.js`, `src/zip.js` | stimulus export (SVG + PNG + manifest) and a **pure** store-only zip writer |
| `src/stimimages.js`, `src/imagesdlg.js` | **pure** per-stimulus images (one fixed-size, one-scale image per distinct figure, with manifest and README, in a zip: the *images* button), and its dialog |
| `src/pdf.js` | **pure** minimal PDF writer and the question sheet: every question on the canvas as vector graphics, six per A4 page, one scale for all (the *pdf* button) |
| `src/online.js`, `src/cloud.js` | **pure** Supabase REST client (publishing, sessions, trials, results) and its page wiring: connections dialog, publish, results, the participant flow |
| `src/describe.js`, `src/assist.js` | **pure** "describe the experiment you want" request/plan/materialise, and its dialog |
| `server/supabase/` | the database schema + policies and the Edge Function that holds the Anthropic key (see its README) |
| `src/state.js` | the shared mutable records: draft, tray, items, questions, selection, view |
| `src/texts.js` | free text on the canvas: the inline editor and the Text panel |
| `src/spin.js` | **pure** continuous rotation: the phase, what turns by scope and frame, the frame loop for runs |
| `src/questions.js` | grouping, the presentation layout on the canvas, ungroup/delete, group-variation commands, moving overlapping questions apart when a canvas opens |
| `src/console.js` | the right-hand panels (creation, object, selection, question) and single-object commands |
| `src/tray.js` | created-shape tray and drag-to-canvas placement |
| `src/canvas.js` | SVG rendering and all pointer / wheel / keyboard interaction |
| `src/main.js` | wiring: button actions, save/load, init |
| `tests/*.test.js` | unit tests for everything marked **pure** — these encode the science |
| `tests/browser/` | Playwright script that drives the prototype and this app identically and diffs the results |

The pure modules never touch the DOM, so they import cleanly into Node for
testing. Only `main.js` runs top-level initialisation.

## Online participants (Prolific) and the AI function

Both need a Supabase project of your own; the one-time setup is in
[`server/supabase/README.md`](server/supabase/README.md). In the app,
⚙ settings → **online & AI** takes the project URL, the anon key and your
experimenter login.

- **publish for participants** (experiment panel) freezes the experiment
  and gives a self-contained participant link
  (`?run=<id>&sb=<project>&key=<anon key>`; the anon key is the public
  client key — row-level security is what protects the data). Paste it as
  the Prolific study URL with the standard `PROLIFIC_PID`/`STUDY_ID`/
  `SESSION_ID` parameters. Participants see instructions → bank-card
  calibration → the trials → a completion screen that returns them to
  Prolific. Every trial is stored the moment it is answered.
- **fetch results** lists the sessions and downloads all of them as .csv or
  .xlsx (the pilot columns plus session id, Prolific ids, completion).
  **unpublish** closes the link; the data stays.
- **describe…** (experiment strip) sends a description in words to Claude
  and materialises the answer — shapes, questions as rotation triples, a
  new experiment — on the canvas as one undo step. It runs through the
  project's `describe` Edge Function (the API key stays on the server) or,
  optionally, with your own key kept in the browser.

## Parameter model (the heart of the tool)

Every object is fully described by:

| parameter        | meaning                                              |
|------------------|------------------------------------------------------|
| `def`            | base shape (n-gon / diamond / star / circle / plus / x) |
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
(`square 45`, `hexagon -30°`). Named shapes (including `up triangle` and `down triangle`, distinct shapes pointing up / standing on a tip, both at 0°; plain `triangle` points up), `7`/`7-gon` (3–24), `6 star`
(4–12 points), `circle`, `plus` (also `+`, `cross`), `x` (also `ex`, `×`,
`times`), `none`. A trailing number is always a rotation, so
`star 5` is a five-point star turned 5°, not a 5-star.

**Plus and x** are two perpendicular lines through the centre, tip to tip
the same span as the other shapes; the x is the plus turned 45° in every
respect (solid, on vertices, texture, both frames), so `x` and `plus 45` are
the same figure. Solid, they are drawn as bars a quarter of the radius wide
to either side of the line. *On vertices* they are five elements: the centre,
where the lines cross, and the four tips. As a *texture* they are a
succession of elements along the two lines — see *Textures*.

## Textures

Sub-shapes can sit on the vertices of the base shape (the default) or form
a **texture**: in the sub-shape row choose *on vertices* / *texture*, and
for a texture its kind, *contour* or *full*. A **contour** texture is the outline only, a dotted line of elements
along every edge (a circle: around its rim; a plus or x: along its two
lines), with nothing inside. A **full** texture fills the whole shape: that
contour plus a lattice inside (a plus or x: its bars). The two share the
density, so switching keeps the spacing and the element size; only the
count changes. The layout of a full texture is led by the clarity of the
overall shape:

1. the contour is drawn explicitly: elements evenly spaced along every edge
   with one on each corner (a circle: evenly around its rim), so each edge
   is a straight row of elements;
2. the inside is a lattice matching the shape's symmetry (square for
   four-sided shapes, triangular otherwise), aligned with an edge and
   anchored on a corner. Triangles, squares, diamonds and hexagons come out
   as exact triangular / square / hexagonal arrangements.

The layout turns with the base orientation, and the rotation parameters keep
their meaning:

| what turns | how |
|------------|-----|
| the elements only | sub-shape *orient* (or rotational variant, scope *sub-shapes*) |
| the configuration only, elements keep their orientation | base *orient*, screen frame |
| everything together | base *orient*, vertex frame (elements co-rotate) |

**Density** is elements per side (across, for a circle). It is linked to
**relative size** and **fill** (element size relative to the spacing) by
`size = fill × side / (density − 1)`. One of the three is **held** (the
*hold* toggles) and editing another moves the third: hold fill and raise
density for more, smaller elements; hold size and raise density to pack the
same elements closer; hold density and enlarge the elements to shrink the
gaps. Fill is capped so elements never overlap; when a change is limited the
panel says why.

The minimum density is 3 per side (two points are always collinear; it
takes three to read as a straight edge), and a circle needs 12 elements on
its rim. A new texture starts at the lowest density giving at least 15
elements (square 4 per side, triangle 5). Every trial record carries
`arrangement` and `density` per member.

A **plus or x** as a *contour* texture is its two lines, one element at the
centre and the same number out along each of the four arms, so the figure
has 5, 9, 13, 17, … elements (4n − 3 for a density n of elements from the
centre to each tip, the centre included). As a *full* texture the same
square lattice fills the bars: as many rows to either side of each line as
come nearest to the solid bar's width (density 5: three rows, 45 elements;
9: five rows, 145). Because only some counts exist, the panel shows and
takes the **total number of elements** for these shapes and uses the nearest
the lines allow (ask for 15 on the contour, get 17); the spinner steps to
the next count. A new contour plus starts at 17 elements, a full one at 33.
Density, size and fill are linked as for the other shapes, with the arm
(centre to tip) as the side: `size = fill × radius / (density − 1)`. In the
save file and the records `density` is the per-arm value (17 elements on
the contour = density 5).

## Question (group) model

A question has a reference A and **two or three comparisons**: select three
objects for B and C, or four for B, C and D ("Is A more similar to B, C or
D?"). With three comparisons they sit on an arc under A (B left, C below,
D right; see *Presentation spacing*); in a run their left-to-right order is a random permutation when
"swap comparison sides" is on, recorded per trial as `order` (e.g. `DBC`)
and `B_side` (left / middle / right), with `n_comparisons` and `D_*` member
columns. Everything else below applies to both kinds.


A question = `{a, b, c, d?, cx, cy, s, anchorRatio, title}` referencing three or four items.
Invariants enforced by `layoutQuestion()` on every layout pass:
- the presentation layout below: A on top, every comparison the same
  distance from A (B bottom-left, C bottom-right; with D: B left, C below, D right)
- one scale and one sub-shape relative size for all members
- labels A/B/C assigned automatically
- moves as a rigid unit; members editable individually via **double-click**
  (rotations only)

### Presentation spacing (2AFC / 3AFC)

One layout, `questionLayout()` in `src/geometry.js`, places the members
everywhere they appear: on the canvas, in pilot and participant runs, in the
PDF and in the per-question stimulus export.

- **Every comparison is the same distance from A.** With two comparisons the
  figures form an equilateral triangle (A on top, B and C below). With three,
  B, C and D sit on an arc under A at −60°, 0° and +60°. Distance itself
  changes judged similarity: in perceptual judgements of appearance, items
  shown closer together were rated *less* similar (Casasanto 2008). Unequal
  A–B and A–C distances would therefore confound the answer; the earlier
  three-comparison row put C nearer to A than B and D.
- **Distant enough.** The clear gap between neighbouring figures is at least
  one figure diameter. It is also at least 1.5 × the largest spacing between
  elements inside a figure, so each figure groups as one unit: grouping by
  proximity follows relative distance (Kubovy, Holcombe & Wagemans 1998).
  With the eyes on A, every neighbour then lies outside the crowding zone of
  about half the eccentricity (Bouma's rule; Pelli & Tillman 2008).
- **Original size.** Figures are never shrunk to make room; the spacing
  scales with the figures instead (size and sub-shape size). The diameter used
  bounds the figure at every rotation, so all rotations of a question share
  one layout.
- **Not too far.** For the default square of diamonds at 100% the centres
  are 87 mm apart on a 96 dpi screen (≈ 8.8° at 57 cm). The question panel shows the centre distance in mm and degrees and
  warns above 10°. Comparison between separated stimuli has been shown to
  stay precise up to about that separation (Danilova & Mollon 2003); larger
  displays need eye movements between figures.

References: Casasanto, D. (2008). Similarity and proximity: When does close
in space mean close in mind? *Memory & Cognition*, 36, 1047–1056 ·
Kubovy, M., Holcombe, A. O., & Wagemans, J. (1998). On the lawfulness of
grouping by proximity. *Cognitive Psychology*, 35, 71–98 · Pelli, D. G., &
Tillman, K. A. (2008). The uncrowded window of object recognition. *Nature
Neuroscience*, 11, 1129–1135 · Danilova, M. V., & Mollon, J. D. (2003).
Comparison at a distance. *Perception*, 32, 395–414.

Runs draw at 1:1 canvas pixels, so the calibrated size on screen is what the
panels report.

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

## Deployment and versions

`.github/workflows/pages.yml` runs the unit tests, stamps every module and
stylesheet URL with the commit (`?v=<sha>`), writes `version.txt` and fills
the build id shown at the bottom of ⚙ settings. GitHub Pages caches files
for 10 minutes; the stamps keep a page and its modules from ever mixing
builds, and the app probes `version.txt` on load and when the tab becomes
visible, offering "new version available · click to reload" when a newer
build exists. The deploy fails if any local script or stylesheet reference
escaped the stamp.

## Working safely: undo, autosave, keyboard

Every edit is undoable: ⌘/ctrl Z undoes, ⌘/ctrl ⇧Z or ⌘/ctrl Y redoes
(`src/history.js` keeps state snapshots; edits made while typing are
coalesced). The working canvas is autosaved to this browser after every
edit and restored on the next visit ("restored your last session"); a blue
dot on **save** marks changes not yet saved to the library. Keyboard:
⌘/ctrl S saves, arrow keys nudge the selected object or question (⇧ ×10),
Esc deselects, Delete removes, ⌘/ctrl D duplicates.

## First-run walkthrough

After the calibration on a first visit, a seven-step walkthrough appears as
a centered pop-up over the page (shape, sub-shape, tray, canvas and
questions, save/library, experiment, settings); the element being described
gets a light dashed outline. Next/back, arrow keys, skip, Esc or a click
outside end it. Replay it from ⚙ settings → show walkthrough (`src/tour.js`).

## Screen calibration (absolute size)

On the first visit the app shows a card-shaped outline: hold a bank card
(ISO/IEC 7810 ID-1, 85.60 × 53.98 mm) against the screen, resize the outline
until it matches, and confirm. That measures CSS pixels per millimetre for
this screen and is stored in the browser (`src/calibration.js`). Object and
question panels then show the drawn figure's on-screen width × height in
mm and in degrees of visual angle at the viewing distance set in ⚙ settings
(default 57 cm, where 1 cm ≈ 1°). The base radius is 70 canvas units, so
vertices of an object at size 100% and zoom 100% lie on a 140 px circle.
Selecting a shape (or a question) shows dimension lines with the drawn
figure's width and height in mm, sub-shapes included (≈ when
uncalibrated); resting the pointer on any other shape for 1.2 s shows its
lines too, until the pointer moves on. "Show absolute size" in a shape's console rows pins that
line, and pinned lines are saved with the canvas.
The ⚙ **settings** button at the bottom-left shows the current px/mm and offers **re-calibrate screen** (and **reset view**); "skip" uses the nominal
96 dpi and marks readouts *uncalibrated*. Redo the calibration after changing
screen or browser zoom — those change the pixel size and the app cannot tell.

## Experiments

An experiment is a named subset of the canvas's questions with its own run
settings; a canvas can hold several, and a question can be in several.
Each gets a code (E1, E2…) that never changes, shown in grey after the
titles of its questions on the canvas and stamped into every result row,
so renaming an experiment never breaks an analysis join.

- The strip under the console lists the experiments as chips
  ("E1 pilot · 6"); "+ experiment" creates one. Opening a chip shows the
  experiment panel and a **lens** on the canvas: questions outside the
  experiment fade, and every title gets a □/■ box that toggles membership
  in place. The lens ends when the panel closes (done, Esc, any other
  selection).
- The experiment panel: code and editable name, a summary line, the list
  of all questions with a checkbox each (hovering a row frames that question
  on the canvas, clicking its title opens it), run settings saved with the
  experiment (repeats, shuffle, swap B/C sides, fixation cross, full
  screen), participant id, **pilot this experiment**, the last run's results
  as .csv or .xlsx (results sheet + per-question summary), **export stimuli
  (zip)** (SVG + PNG per question with manifest.csv and manifest.xlsx), and
  duplicate / delete.
- The question panel shows one chip per experiment (filled when the
  question is a member) and "+" to start a new experiment containing it.
- A run: start screen (space begins), then per trial an optional 500 ms
  fixation, the question as "Is A more similar to B or C?" drawn from the
  same objects as the canvas at 1:1 pixels with A/B/C labels, keys B / C or
  the buttons, 400 ms blank. Results carry participant, canvas, experiment
  id/code/name, trial, repeat, question index, response, RT, B side, every
  member's parameters and on-screen size in mm and degrees, px/mm, viewing
  distance and fixation (`src/experiment.js`, pure and unit-tested).
- Save format v4 adds `experiments[]`; v3 files with "include in
  experiment" stars load as one experiment "experiment 1".

## Saving: library and files

**save** stores the canvas under its name in this browser's library
(localStorage). The dropdown at the top-left of the canvas lists saved
canvases, most recent first; picking one opens it. **new** starts a blank
canvas, **remove** deletes the selected library entry. The library is
per-browser and per-site, so it does not follow you to another machine.

**export** downloads the same JSON as a file, **import** loads one. Files
are the canonical, shareable format — the `canvases/` directory is the
intended home for canvases kept in git.

JSON `{version, name, view, tray[], items[], questions[], experiments[], texts[]}`
(version 5; `texts` only when there are any) is produced by `serializeCanvas()`; `deserializeCanvas()`
migrates older files (`sub*` keys → `anchor*`, v2 `trials` → `questions`, v3
stars → experiment 1, and v4 plus/x textures → `contour`, since before v5 a
plus or x texture was always its two lines). A texture's `contour: true`
marks the outline-only kind; records and manifests report `arrangement` as
`vertices`, `contour` or `texture` (full). Saved canvases are
research artifacts — keep the migrations working (they are unit-tested).

Opening a canvas re-applies the current presentation layout. Questions whose
frames then overlap are moved to the right just far enough to clear each
other, with a notice. This can happen to three-comparison questions placed
for the earlier, narrower row. Questions that don't overlap stay where they
are; save to keep the new positions.

## Verification

Phase 0 was a pure restructuring: no rendering or interaction behaviour
changed. Since then, deliberate changes: dragging empty canvas pans
(box-select is shift-drag), the in-browser library, the presentation layout
(the script loads `src/geometry.js` into the prototype and routes its
question placement through `questionLayout()`), and box-select catching any
object whose box overlaps the band (patched into the prototype the same way).
Besides the unit tests, `tests/browser/compare-with-prototype.mjs`
drives `prototype/index-v9.html` and `index.html` through the same ~40-step
interaction script (creation, drops, panel edits, question, both group
variations, all three variant scopes, vary grid, duplicate/delete/⌘D, handle
drags, rubber band, pan/zoom, ungroup, export, reload) and diffs the save file,
the canvas SVG, the console panels and the post-reload state. They are
byte-identical. It needs Playwright (`npm i -g playwright`, chromium):

```
python3 -m http.server 8765 &
node tests/browser/compare-with-prototype.mjs http://localhost:8765 /tmp/out
```

## Roadmap

See `HANDOFF.md`. Phase 0 is done and the Phase 1 canvas library is in;
undo/redo, stimulus export and the pilot runner are in. Next: a participant-facing run URL with results posted to an endpoint, and jsPsych export as an alternative backend.

## Known rough edges (unchanged from the prototype, fix opportunistically)

- Vary-grid placement can overlap existing objects.
- Question selection rectangle is approximate at extreme sizes.
- (fixed) A stray text selection could turn a drag into a native browser
  drag, which cancelled the pointer gesture and left the rubber band stuck:
  the canvas no longer selects text or starts native drags, a shift-press
  clears any selection, and a cancelled gesture ends cleanly.
- (fixed) Double-clicks are detected from the presses themselves, since the
  canvas re-renders on the first click and the browser then reports none.
