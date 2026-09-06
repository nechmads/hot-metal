# Studio run record — internal

Not part of the shareable package. Critic inputs never include this file.

Budget per concept: initial build + fresh assessment, up to 2 critique-driven
revision rounds (target 8.5/10), then polish + frontend-review, plus the
reserved final assessment if polish changed the appearance. Max 4 valid
assessments per concept.

| concept | build | assess 1 | round 1 | assess 2 | round 2 | assess 3 | polish | review | final |
|---|---|---|---|---|---|---|---|---|---|
| 01 broadsheet | done | 7.5 | done | 8.0 | done | — | done | done | **8.0** |
| 02 signal | done | 7.5 | done | 7.5 | done | — | done | done | **7.5** |
| 03 atrium | done | 8.0 | done | 8.0 | done | — | done | done | **7.0** |
| 04 split | done | 7.5 | done | 7.5 | done | — | done | done | **7.5** |
| 05 marginalia | done | 7.5 | done | 7.5 | done | — | done | done | **7.5** |

Four valid assessments per concept, as budgeted. No concept reached the 8.5
target. Refinement stopped because the budget was spent, not because the
concepts were judged finished.

## Log

- 2026-09-06 — run created. Content sourced from the user's own public
  "Looking Ahead" publication (RSS + rendered pages). 7 featured images
  downscaled to 900px/q72 (~940KB total). 9 Google Fonts families bundled as
  local woff2 (latin + latin-ext only); no runtime network dependency.
- Exploration produced 5 directions with external entropy seeds; see BRIEF.md.
- Initial builds dispatched, one implementer per concept, all working from the
  same `_build/content.py` so the concepts are compared on identical material.

### Assessment 1 — headline findings

- **01 broadsheet 7.5** — four stacked header bands before any content; the About
  paragraph printed twice on the home page; a mobile seam where the briefs rail
  drops out but its rules remain; and the archive duotone welded to the accent
  hex (breaks the arbitrary-colour constraint). Praised: the imageless lead with
  its three-column lede breaking mid-sentence, the numbered issue rail, the
  Sources/Correspondence furniture.
- **02 signal 7.5** — a wide image strip sits directly under the lead's CTA and
  reads as the lead's hero, undoing the no-image proof; article measure 70–78ch
  on a dark ground; h2s losing to bolded run-in sentences; a ragged tail on two
  different right edges. Praised: the index itself, `NO IMAGE ON FILE` /
  `FIG. NNN` vocabulary, accent discipline, mobile.
- **03 atrium 8.0** — every plated story also appears as a catalogue row, so each
  headline is met twice; the article's right third never receives anything, so
  the asymmetry reads as a failed centring; h2s underpowered; several captions
  narrate the conceit. Praised: `NOW SHOWING / NO PLATE`, the plate treatment,
  hex-safe accent, the mobile article.
- **05 marginalia 7.5** — ~90ch measure; the lead loses the home page to seven
  archive thumbnails; nine identically-weighted section labels; the sources block
  duplicating the margin and admitting it in a note. Praised: the margin as a
  load-bearing column, the note-at-the-citing-line pairing, the mobile fold-in.

- **04 split 7.5** — the masthead is set ~40% larger than the lead headline, so
  the brand outshouts the story; the archive is one identical row seven times
  with dead space under short entries; thumbnails abut the accent plane with no
  gutter (fails against an arbitrary hex); mobile switches the tall crop to a
  wide full-bleed band. Praised: the lead's no-image construction, the numbered
  sources block, the container-free restraint, the mobile stacked header.

### Capture defect found and fixed

Three of four critics reported the artifact slices were not sequential; one
found overlapping centre crops and byte-identical duplicates. Root cause:
**`sips --cropOffset` measures from the image centre, not the top**, and clamps
so that offset 0 and offset +h/2 return the same crop — so every "tile 1" was a
centre crop. `_build/tile.py` now decodes the PNG and splits it into equal
bands directly (sips is still used for the width resample, which is correct),
and deletes stale tiles before writing. Verified: tile 1 is now the top of the
page and all bands are equal.

The critics compensated by re-cropping before reviewing and their findings are
concrete and content-specific, so assessment 1 stands for all five.

Additional capture note for concept 04: a fixed-position panel paints only once
in a full-page screenshot, so the panel cannot be seen beside mid-page content.
Capture that concept as viewport screenshots at scroll positions instead.

### Round 1 — what each concept changed

- **01 broadsheet** — header 4 bands → 2; wordmark fitted to the measure
  (823/1240px at 1440, was ~450); duotone moved off the accent onto a fixed ink
  (`--plate: #1d1a14`) so any hex survives; About printed once; mobile rail and
  its phantom divider removed together; one archive row now has NO image and
  renders a date-stamp plate; end matter reclaims the full measure.
- **02 signal** — the strip moved below the index as its own labelled band with
  its owner stated, so the lead no longer appears to have a hero; measure
  62–65ch; h2 24 → 32px with a `§NN` marker and run-in bolds demoted; tail
  squared to one right edge at 988px; tag chips unboxed; related dispatches
  became numbered index rows with no thumbnails.
- **03 atrium** — a plated work IS its catalogue entry, so no story appears
  twice (home 6,300 → 5,380px, 8 unique headlines); the outer field now carries
  a sticky running section marker and hung plates break into it; h2 33.6 →
  42.4px; self-narrating captions cut; archive rhythm inverted correctly.
  Found a real bug: `overflow-x: hidden` on `body` made it a scroll container
  and silently disabled `position: sticky`; fixed with `overflow-x: clip` on
  the root. Dropped the scroll-reveal entirely rather than harden it, which
  also removes the print / no-JS / screenshot failure class.
- **05 marginalia** — measure 41.5 → 34rem with all reclaimed width given to
  the note column (336px at 1440), so source titles set in 1–2 lines not 3;
  home archive thumbnails removed so the imageless lead wins; lead given a
  full-sheet rule, full-width title and drop cap; accent dashes 9 → 1 per page;
  sources compressed to a bibliography and the apologetic note removed;
  `--accent-ink` contrast-floored (pale `#ffd400` 1.25 → 6.47 on paper).

### Assessment 2 — headline findings

- **01 broadsheet 8.0** (7.5 → 8.0) — article page's right third empty and
  unexplained while the end matter snaps to full width mid-scroll; the briefs
  rail duplicates the archive verbatim; ruled columns finish at uneven depths;
  related posts enlarge the weakest images into a three-up card row. The
  typographic date plate for the missing image was singled out as the best
  answer in the design to the absent-image constraint.
- **02 signal 7.5** (no change) — the article has two left axes and an empty
  right third for its full length; the home page runs two features (the strip
  band moved in round 1 is now an orphaned second lead — remove it); the index
  numbers are dim grey, so the numbered-log signature disappears at a glance.
- **03 atrium 8.0** (no change) — hierarchy inversion: plate entries have small
  centred italic titles while text entries are large and left-aligned, so the
  archive scans as two competing list systems; the desktop right column is
  leftover rather than composed; the accent carries small-caps *text*, which
  fails at a pale hex.
- **04 split 7.5** (no change) — **functional defect: the panel caption does not
  track**, still reading "My thesis" two sections later; ~60% of the plane is
  empty; measure back up to 85–90ch; desktop thumbnails over-shrank to ~80×96
  near-squares, regressing the tall-crop rule that mobile gets right.
- **05 marginalia 7.5** (no change) — the signature device is the quietest thing
  on the page: the in-text superscript is accent-red but its margin partner is a
  grey numeral in a pale box with a mono title; the home margin is two-thirds
  empty; the drop cap is mis-set; the body uses straight quotes while every
  other block uses proper ones.

Where round-1 and round-2 critics disagreed (broadsheet's briefs rail: praised,
then called redundant), the round-2 instruction was to re-cut it rather than
delete it, so the earlier critic's value is kept.

### Second capture defect: Chrome's full-page screenshot limit

Three round-2 critics reported duplicated or discontinuous slices on the tallest
pages. Cause: Chrome's full-page screenshot breaks past ~16384 device pixels,
and at deviceScaleFactor 2 every mobile article page (21,900–22,500px) and two
desktop article pages (17,200px) exceeded it, so the capture repeated or
truncated content. The tiler was not at fault this time.

Fix for the final capture: use deviceScaleFactor 1 for any page whose CSS height
exceeds ~8,000px, or capture it as viewport screenshots at scroll positions the
way concept 04 already is. Check `docH x dpr <= 16384` before every full-page
shot.

### Cross-cutting defect found during polish: no-JS form submission leak

Concept 03's frontend review found that with JavaScript disabled, submitting a
comment or subscribe form navigated and wrote the entered name, email and
comment into the URL query string. The forms declare no `method`, so they
default to GET against the current document.

Checked across the set: only 03 was fixed by its own agent (`method="dialog"`).
01, 02, 04 and 05 all still carry method-less forms and have the same leak.
This is worth carrying into the real Astro templates, not just the prototypes —
a demo form that silently puts a commenter's email in the URL is the kind of
thing that survives a port.

Fix applied centrally after the polish agents finished, so as not to race them
for the files they own.

### Second accent failure class

03 also found that its numerals were contrast-floored but its hairline rules and
in-text link underline still used the raw accent: at `#ffd400` the underline
measured 1.34:1, so in-text links lost their only distinguishing mark. Routing
every accent mark through one `--accent-ink` token took it to 4.67:1. Worth
checking the same split (floored text vs raw rules) in the other concepts.

### Final assessment — after polish and frontend review

- **01 broadsheet 8.0** — highest of the set, and the only one a critic scored
  9/10 on product fit, identity and distinctiveness. Remaining: the article page
  still carries three different left edges and a dead right third; the subject
  index occupies the front page's most valuable column and is fragile across
  publications (a publication with 4 tags looks broken, one with 60 runs
  forever); accent still carried as small text in several places.
- **02 signal 7.5** — the lead headline uses only ~31% of its container, so the
  no-image hero reads as absence rather than intent; the four-cell metadata
  strip is the one generic module; index column headers are the faintest thing
  on the page; row numerals depend solely on the accent, which fails for a dark
  hex on a near-black ground.
- **03 atrium 7.0 (down from 8.0)** — the sharpest disagreement in the run. This
  critic judged the plate — the element the direction is named for — as its
  least resolved detail: mat and image each carry an outline, the image aligns
  to nothing, and the PLATE caption is stranded in the rail ~200px above the
  picture it names. It also found the round-2 frame narrowing produced "a narrow
  centred column with a mostly empty gutter" rather than composed asymmetry.
  Both earlier critics had praised the plate device, so this is a genuine
  difference of judgement, not a regression I introduced — but the alignment
  faults it names are specific and checkable.
- **04 split 7.5** — the panel's interior is filled by stretching nav across it
  rather than composing it; the article has three right edges and a ~45-50char
  measure; mobile craft trails desktop. Caption tracking verified working.
- **05 marginalia 7.5** — the margin has long empty stretches (~350px on one
  screen, a whole empty column on another); bold run-in lead-ins out-rank the
  h2s; the archive thumbnail introduces an alignment that exists nowhere else.

### Packaging

Scaffolding removed from 04-split before delivery: a "Prototype note" block with
four live accent swatches sat in its footer, and only that concept had one — its
critic flagged it as shipping scaffolding and docked craft for it. Markup, CSS,
JS and the swatch constant all removed; caption tracking re-verified at 6 offsets
afterwards. The derived-colour system it demonstrated is unchanged; the measured
contrast values are recorded above instead.

Package verified by copying to a fresh location outside the repo: 191 relative
references resolve, 0 missing, 8.2MB, `_build`/`_shots`/`_shared` excluded.


### Artifact cleanup before commit

`_shots/` (56MB of full-page screenshot sets) and the packaged zip (7.6MB) were
deleted and gitignored — 77MB total, all regenerable, none of it belonging in
clone history. The two screenshots the record actually cites were kept in
`review/`. The concept folders, `_build/` and `_shared/` remain so the
prototypes can be reopened and rebuilt.

Re-run `python3 _build/cN.py` to rebuild a concept, and the capture procedure in
this file to regenerate screenshots.
