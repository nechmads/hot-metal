---
title: "Capturing long pages: Chrome's 16384px limit and sips crop offsets"
kind: "workflow"
status: "active"
visibility: "shared"
applies_to:
  - "design-prototypes"
tags:
  - "screenshots"
  - "tooling"
  - "design-review"
created_at: "2026-09-06"
updated_at: "2026-09-06"
created_by: "claude"
verified_at: "2026-09-06"
supersedes: []
superseded_by: null
---

Two capture traps that each cost a wasted design-review cycle, because a
mis-sliced page is indistinguishable from a badly composed one to a reviewer.

- **Chrome's full-page screenshot silently breaks past ~16384 device pixels**
  (CSS height x deviceScaleFactor). Beyond it, content repeats or truncates
  with no error. Check `docH * dpr <= 16384` first; drop to dpr 1, or capture
  viewport screenshots at scroll offsets, for taller pages. Long article pages
  at dpr 2 routinely hit 21,000-22,000px.
- **`sips --cropOffset` measures from the image centre, not the top**, despite
  its `offsetY offsetX` signature, and it clamps such that offset 0 and offset
  +h/2 return identical output. It cannot produce sequential top-to-bottom
  tiles. `design-prototypes/emdash-2026-09-06/_build/tile.py` splits the PNG
  directly instead (zlib + per-row unfilter) and uses sips only for the width
  resample, which is correct.

Also: **a fixed-position element paints only once in a full-page screenshot**,
at the top, so a design with a fixed panel or sidebar must be captured as
viewport screenshots at scroll positions or the reviewer cannot see it beside
mid-page content.

Always prime a page before capturing — scroll to the bottom and back — so
scroll-triggered reveals have fired.

## Evidence

- `design-prototypes/emdash-2026-09-06/_build/tile.py` and the capture-defect
  sections of `_build/NOTES.md`.
