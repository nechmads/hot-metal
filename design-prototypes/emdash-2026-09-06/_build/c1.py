"""Concept 1 — Broadsheet.

A modern paper of record: masthead, dateline rule, a lead story carried entirely
by type (it has no featured image and needs none), an index rail, and an archive
that runs as ruled columns. Images are duotoned press illustrations, boxed small.
Accent appears only through `--accent`, always darkened into `--accent-ink` so an
arbitrary publication hex stays legible on paper.
"""

import os, re

import common
import content as C

OUT = os.path.join(common.RUN, "01-broadsheet")
FONTS = ["instrument-serif", "ibm-plex-sans", "source-serif"]

# Featured images are frequently missing in real publications, so the demo set
# drops one archive post's image on purpose: the template has to look composed
# with a hole in the picture column, not just when every cut is present.
NO_IMAGE = "the-hyper-learner"
POSTS = [dict(p, img=None) if p["slug"] == NO_IMAGE else p for p in C.POSTS]

IMAGES = [p["img"] for p in POSTS if p["img"]]

LEAD = POSTS[0]
ARCHIVE = POSTS[1:]
# Four, so the run fills whole rows of two on its own and needs no closing cell.
RELATED = POSTS[1:5]

BODY_PARAS = re.findall(r"<p>.*?</p>", C.ARTICLE_BODY, re.S)


def unlink(html):
    """Drop anchors from the front-page lede, keeping their words.

    The lede is set in clipped columns, so a link inside it is usually cut in
    half — and focusing one makes the browser scroll the clipped box, which
    silently replaces the opening paragraph and its drop cap with text from the
    middle of the piece. A teaser also has no business sending the reader away
    before the story: the one affordance here is “read the whole piece”.
    """
    return re.sub(r"</?a\b[^>]*>", "", html)


def lede_layout(paras, take=5):
    """Decide how the front-page lede is set.

    The lede is only ruled into columns and cut to a common baseline when there
    is demonstrably more text than the widest arrangement can hold — otherwise
    a "continued" cue would be a lie and the columns would end at different
    depths. A two-sentence lead therefore runs as a single unruled paragraph at
    its natural depth; only a full opening earns the three-column cut.
    """
    html = unlink("".join(paras[:take]))
    chars = len(re.sub(r"<[^>]+>", "", html))
    # capacity of the roomiest ruled setting the lede can land in: two columns
    # of roughly 53 characters over twelve lines, on a tablet-width front page.
    if chars > 1400:
        return html, "lead-body--c3 lead-body--cut", True
    if chars > 760:
        return html, "lead-body--c2", False
    return html, "lead-body--c1", False


LEDE, LEDE_CLASS, LEDE_CUT = lede_layout(BODY_PARAS)

# The subject index that the briefs rail carries: every tag in the issue, set
# against the item numbers it appears under. Item 01 is the lead, 02… the
# archive, exactly as the front page numbers them. Drawn from the posts' own
# tags — the platform records no popularity, so the rail claims none.
def topic_index(posts):
    seen = {}
    for n, post in enumerate(posts, start=1):
        for tag in post["tags"]:
            seen.setdefault(tag.lower(), []).append("%02d" % n)
    return sorted(seen.items())


TOPICS = topic_index(POSTS)

PULL = (
    "Your agent interface isn’t the stripped-down version of your product for "
    "robots. For a growing share of your users, it <em>is</em> the product."
)

ARTICLE_HTML = common.body_with_ids(C.ARTICLE["body"], C.ARTICLE["sections"])


# ---------------------------------------------------------------- styles ----

CSS = common.font_css(FONTS) + """
*, *::before, *::after { box-sizing: border-box; }

:root {
  --accent: #b4361f;
  --accent-ink: #b4361f;
  --paper: #faf9f6;
  --paper-2: #f2f0ea;
  --ink: #14130f;
  --ink-2: #4b4842;
  --ink-3: #75716a;
  --rule: #cfccc3;
  --rule-soft: #e2dfd7;
  /* the plate ink the duotone prints in — a warm near-black drawn from the text
     colour, never the accent, so a neon or pale publication hex cannot make the
     archive's pictures unreadable */
  --plate: #1d1a14;

  --serif: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  --display: 'Instrument Serif', 'Source Serif 4', Georgia, serif;
  --sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;

  --pad: clamp(1.15rem, 3.2vw, 2.5rem);
  --gut: clamp(1.5rem, 2.6vw, 2.75rem);
}

/* The accent is a publication's own arbitrary hex, so nothing uses it raw, and
   it is confined to kickers, rules and links — never to imagery.
   --accent-ink is the printable version used for every kicker, rule and mark:
   mixed 46% toward ink, it clears 4.5:1 on this paper for every hue tested,
   including the pathological bright ones (yellow, lime, cyan, white). */
@supports (color: color-mix(in oklab, red, blue)) {
  :root {
    --accent-ink: color-mix(in oklab, var(--accent) 46%, #100f0c);
    --accent-wash: color-mix(in srgb, var(--accent) 12%, transparent);
  }
}

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 1.0625rem;
  line-height: 1.6;
  font-synthesis-weight: none;
  hanging-punctuation: first last;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  /* `hidden` on the body makes it a scroll container and kills sticky rails;
     `clip` contains the same overflow without one. */
  overflow-x: hidden;
  overflow-x: clip;
}

img { max-width: 100%; display: block; }

a { color: inherit; }

a:focus-visible, button:focus-visible, input:focus-visible,
textarea:focus-visible, summary:focus-visible {
  outline: 2px solid var(--accent-ink);
  outline-offset: 3px;
  border-radius: 1px;
}

::selection { background: var(--accent-wash, #e6ded9); }

.shell {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 var(--pad);
}

.skip {
  position: absolute; left: -9999px; top: 0; z-index: 20;
  background: var(--ink); color: var(--paper); padding: .6rem 1rem;
  font-family: var(--sans); font-size: .8rem;
}
.skip:focus { left: .5rem; top: .5rem; }

/* ------------------------------------------------------------ type kit --- */

.caps {
  font-family: var(--sans);
  font-weight: 600;
  font-size: .6875rem;
  letter-spacing: .13em;
  text-transform: uppercase;
  line-height: 1.3;
  /* the label kit is used on <p> as often as on <span>; the default paragraph
     margin would silently loosen every rule it sits against */
  margin: 0;
}

.num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }

.kicker {
  font-family: var(--sans);
  font-weight: 600;
  font-size: .6875rem;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--accent-ink);
  margin: 0;
}

.meta {
  font-family: var(--sans);
  font-weight: 400;
  font-size: .75rem;
  letter-spacing: .05em;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  margin: 0;
}
.meta b { font-weight: 600; color: var(--ink-2); }
.sep { color: var(--rule); padding: 0 .45em; }

/* ------------------------------------------------------------ masthead --- */

/* The header is two bands and no more: the nameplate, then a single dateline
   rule carrying issue, date and navigation. Nothing is stated twice. */

.top-rule { border-top: 2px solid var(--ink); }

.masthead {
  text-align: center;
  padding: clamp(.6rem, 1.4vw, 1rem) 0 clamp(.5rem, 1vw, .8rem);
}

/* The nameplate is set from the publication's own name length (--wm-vw and
   --wm-cap are derived at build time), so a long title lands at a smaller,
   safe size with no script at all. It wraps by default: only once the fitter
   has proved the name fits the measure on one line is it locked to one line. */
.wordmark {
  font-family: var(--display);
  font-weight: 400;
  font-size: clamp(1.9rem, var(--wm-vw, 12vw), var(--wm-cap, 7rem));
  line-height: .95;
  letter-spacing: -0.03em;
  margin: 0;
  text-wrap: balance;
}
.wordmark a { text-decoration: none; display: block; }
.wm-text { display: inline-block; }
.wordmark--measure .wm-text, .wordmark--fit .wm-text { white-space: nowrap; }

.standfirst {
  font-family: var(--display);
  font-style: italic;
  font-size: clamp(.95rem, 1.55vw, 1.2rem);
  line-height: 1.3;
  color: var(--ink-2);
  margin: clamp(.3rem, .7vw, .5rem) auto 0;
  max-width: 54ch;
}

/* dateline: the rule that closes the nameplate and anchors the page */
.dateline {
  border-top: 3px solid var(--ink);
  border-bottom: 2px solid var(--ink);
}
.dateline-in {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: .3rem 1.75rem;
  flex-wrap: wrap;
  padding: .5rem 0;
  color: var(--ink-2);
}
.dateline-meta {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 0;
  min-width: 0; margin: 0;
}
.dateline-in .caps { font-weight: 500; letter-spacing: .14em; }
.dateline-in .mid { color: var(--ink); font-weight: 600; }

.nav ul {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-wrap: wrap;
  gap: .15rem clamp(.9rem, 2.4vw, 1.9rem);
}
.nav a {
  display: inline-block;
  text-decoration: none;
  font-family: var(--sans);
  font-weight: 600;
  font-size: .6875rem;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ink-2);
  border-bottom: 1px solid transparent;
  padding-bottom: 1px;
}
.nav a:hover { color: var(--accent-ink); border-bottom-color: var(--accent-ink); }
.nav a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--accent-ink); }

/* on a phone the all-caps sans is furniture, not reading matter */
@media (max-width: 560px) {
  .caps { font-size: .625rem; letter-spacing: .08em; }
  .nav a { font-size: .625rem; letter-spacing: .09em; }
  .dateline-in { gap: .25rem 1rem; }
  .nav ul { gap: .15rem 1.1rem; }
}

/* compact masthead on the article page */
.masthead--slim {
  text-align: left;
  padding: clamp(.75rem, 1.8vw, 1.25rem) 0 clamp(.6rem, 1.2vw, .9rem);
}
.masthead--slim .slim-row {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: .2rem 1.5rem; flex-wrap: wrap;
}
.masthead--slim .wordmark { font-size: clamp(2rem, 4.6vw, 3.35rem); }
.masthead--slim .wm-text { white-space: normal; }
.masthead--slim .slim-tag {
  font-family: var(--display); font-style: italic;
  font-size: clamp(.95rem, 1.5vw, 1.15rem); color: var(--ink-3);
}

/* ------------------------------------------------------------ front page - */

.front {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gut);
  padding-top: clamp(1.1rem, 2.4vw, 1.9rem);
}
@media (min-width: 1000px) {
  .front {
    grid-template-columns: minmax(0, 1fr) 1px minmax(17rem, 20rem);
    gap: 0 var(--gut);
  }
  .front-divider { background: var(--rule); }
}

.lead { min-width: 0; }
.lead-rule { border-top: 2px solid var(--accent-ink); padding-top: .6rem; }
/* Every story in the issue carries its item number — the lead is 01, the
   archive runs 02 onward — because that is what the subject index points at. */
.item-no {
  color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
  margin-right: .65rem;
  padding-right: .65rem;
  border-right: 1px solid var(--rule);
}

.lead-head {
  display: block;
  text-decoration: none;
  margin: .35rem 0 0;
}
.lead-title {
  font-family: var(--display);
  font-weight: 400;
  font-size: clamp(2.6rem, 7.4vw, 5.75rem);
  line-height: .93;
  letter-spacing: -0.024em;
  margin: 0;
  text-wrap: balance;
}
.lead-head:hover .lead-title { color: var(--accent-ink); }

.lead-dek {
  font-family: var(--display);
  font-style: italic;
  font-size: clamp(1.2rem, 2.5vw, 1.85rem);
  line-height: 1.3;
  color: var(--ink-2);
  margin: clamp(.8rem, 1.8vw, 1.15rem) 0 0;
  max-width: 44ch;
}

.byline {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: .1rem;
  margin: clamp(1rem, 2vw, 1.4rem) 0 0;
  padding: .55rem 0;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--rule-soft);
}

/* The lede runs on a strict line grid — line-height in rem, no space between
   paragraphs, an indent instead — so a column height that is a whole number of
   lines always clips on a baseline and every column foot lands level. The cut
   is deliberate: a rule and a continuation cue close it, the way a front page
   breaks a story to an inside page. Short leads are never clipped; the builder
   drops them to fewer columns at their natural depth instead. */
.lead-body {
  --lh: 1.72rem;
  --lede-lines: 13;
  margin-top: 1.35rem;
  font-size: 1.0625rem;
  line-height: var(--lh);
  color: var(--ink);
}
/* a lead short enough to run unruled keeps a readable measure */
.lead-body--c1 { max-width: 62ch; }
.lead-body p { margin: 0; text-indent: 1.35em; }
.lead-body p:first-of-type { text-indent: 0; }
.lead-body--cut {
  height: calc(var(--lede-lines) * var(--lh));
  overflow: hidden;
  column-fill: auto;
}
.lead-body p:first-child::first-letter {
  float: left;
  font-family: var(--display);
  font-size: 3.55em;
  line-height: .78;
  padding: .06em .09em 0 0;
  color: var(--accent-ink);
}
@media (min-width: 720px) {
  .lead-body--c2, .lead-body--c3 {
    columns: 2;
    --lede-lines: 12;
    column-gap: var(--gut);
    column-rule: 1px solid var(--rule-soft);
  }
}
@media (min-width: 1220px) {
  .lead-body--c3 { columns: 3; --lede-lines: 11; }
}

/* the ruled foot of a cut lede: the break line and where the story goes on */
.lede-end {
  display: flex; flex-wrap: wrap; align-items: baseline;
  justify-content: space-between; gap: .4rem 1.5rem;
  margin-top: .95rem;
  padding-top: .55rem;
  border-top: 1px solid var(--ink);
}
.lede-end .caps { color: var(--ink-3); font-weight: 500; }

.readon {
  display: inline-block;
  margin-top: .35rem;
  font-family: var(--sans);
  font-weight: 600;
  font-size: .75rem;
  letter-spacing: .13em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--accent-ink);
  border-bottom: 1px solid var(--accent-ink);
  padding-bottom: .18rem;
}
.readon:hover { color: var(--ink); border-bottom-color: var(--ink); }

/* ------------------------------------------------------------ index rail - */

/* The rail does not restate the archive that follows it. It carries the one
   cut the archive cannot: the back-of-book subject index — every topic in the
   issue, alphabetical, against the item numbers it appears in. The numbers
   resolve against the item number printed on the lead and on every archive
   row, so the index needs no sentence explaining itself. */
.rail { min-width: 0; }
@media (max-width: 999px) {
  .front-divider { display: none; }
  .rail { border-top: 2px solid var(--ink); padding-top: .9rem; }
}

.rail-head {
  font-family: var(--sans);
  font-weight: 600; font-size: .6875rem; letter-spacing: .18em;
  text-transform: uppercase; color: var(--ink-2);
  margin: 0 0 .7rem;
  padding-bottom: .5rem;
  border-bottom: 1px solid var(--ink);
}

.index { list-style: none; margin: 0; padding: 0; }
@media (max-width: 999px) {
  .index { columns: 2; column-gap: var(--gut); }
}
@media (max-width: 560px) {
  .index { columns: 1; }
}
.index li { border-bottom: 1px solid var(--rule-soft); break-inside: avoid; }
.index a {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: .75rem;
  padding: .4rem 0;
  text-decoration: none;
}
.index a:hover .ix-t { color: var(--accent-ink); }
.index a:hover .ix-n { color: var(--ink); }
.ix-t {
  font-size: .9375rem; line-height: 1.3;
  font-variant: small-caps; letter-spacing: .02em;
}
.ix-n {
  font-family: var(--sans); font-size: .6875rem; font-weight: 600;
  letter-spacing: .06em; color: var(--accent-ink);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* ------------------------------------------------------------- plates ---- */

/* Square AI art, printed as a two-tone press cut in the text ink so uneven
   source images read as a deliberate house style rather than stock photography.
   The plate is deliberately independent of --accent: the accent is a hex we do
   not control, and a full-bleed duotone is where an arbitrary hex fails worst. */
.plate {
  margin: 0;
  min-width: 0;
}
.plate-box {
  position: relative;
  isolation: isolate;
  background: var(--plate);
  border: 1px solid var(--ink);
  overflow: hidden;
}
.plate-box img {
  width: 100%;
  height: auto;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  filter: grayscale(1) contrast(1.2) brightness(.94);
  mix-blend-mode: screen;
  opacity: .96;
}

/* No cut for this story. Rather than leave a hole — or let the text column
   swell and make the archive's two columns ragged — the slot is set with a
   date stamp, so every row keeps identical measure whether art exists or not. */
.plate--date .plate-box {
  background: var(--paper-2);
  aspect-ratio: 1 / 1;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: .1rem;
  padding: .3rem;
  text-align: center;
}
.pd-m, .pd-y {
  font-family: var(--sans); font-weight: 600;
  font-size: .5625rem; letter-spacing: .16em; text-transform: uppercase;
  /* set on the plate's own paper, one step darker than the page's metadata:
     --ink-3 clears 4.5:1 on --paper but not on the slightly grey --paper-2 */
  color: var(--ink-2);
}
.pd-d {
  font-family: var(--display); font-weight: 400;
  font-size: clamp(1.5rem, 3.2vw, 2.2rem);
  line-height: .92; letter-spacing: -0.02em;
  color: var(--ink);
  font-variant-numeric: lining-nums;
}
/* ------------------------------------------------------------ archive ---- */

.section-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 1rem; flex-wrap: wrap;
  margin: clamp(2.2rem, 5vw, 3.6rem) 0 0;
  padding-bottom: .5rem;
  border-bottom: 3px solid var(--ink);
}
.section-head h2 {
  font-family: var(--display); font-weight: 400;
  font-size: clamp(1.6rem, 3.2vw, 2.35rem);
  line-height: 1; letter-spacing: -0.01em; margin: 0;
}
.section-head .caps { color: var(--ink-3); font-weight: 500; }

.archive-grid {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 900px) {
  .archive-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--gut);
  }
  .archive-grid::before {
    content: "";
    position: absolute;
    top: 0; bottom: 0; left: 50%;
    width: 1px; background: var(--rule);
  }
}

.brief {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(56px, 14vw, 84px);
  column-gap: 1.1rem;
  align-content: start;
  padding: 1.15rem 0;
  border-bottom: 1px solid var(--rule-soft);
}
/* Narrow screens give the cut only the headline's rows: the summary and the
   date then run the full measure beneath it, instead of setting a thin
   L-shaped column of text beside a square of white. */
.brief > .plate { grid-column: 2; grid-row: 1; }
.brief-dek, .brief-meta { grid-column: 1 / -1; }
@media (min-width: 620px) {
  .brief { grid-template-columns: minmax(0, 1fr) clamp(74px, 9vw, 104px); }
  .brief > .plate { grid-row: 1 / span 3; align-self: start; }
  .brief-dek, .brief-meta { grid-column: 1; }
}
.brief-link { grid-column: 1; text-decoration: none; display: block; min-width: 0; }

.brief-title {
  font-family: var(--display); font-weight: 400;
  font-size: clamp(1.3rem, 2.2vw, 1.65rem);
  line-height: 1.08; letter-spacing: -0.012em;
  margin: .3rem 0 0;
  text-wrap: pretty;
}
.brief-link:hover .brief-title { color: var(--accent-ink); }
.brief-dek {
  margin: .5rem 0 .6rem;
  font-size: .9375rem;
  line-height: 1.52;
  color: var(--ink-2);
  max-width: 48ch;
}

/* ---------------------------------------------------------- subscribe ---- */

.subscribe {
  margin-top: clamp(2.4rem, 5vw, 3.8rem);
  border-top: 3px solid var(--ink);
  border-bottom: 3px solid var(--ink);
  padding: clamp(1.4rem, 3.2vw, 2.4rem) 0;
}
.subscribe-in {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(1.2rem, 3vw, 2.5rem);
}
@media (min-width: 860px) {
  .subscribe-in { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
}
.subscribe h2 {
  font-family: var(--display); font-weight: 400;
  font-size: clamp(1.9rem, 4vw, 3rem);
  line-height: .98; letter-spacing: -0.02em;
  margin: .35rem 0 0;
  text-wrap: balance;
}
.subscribe p.blurb {
  margin: .8rem 0 0; max-width: 56ch;
  font-size: 1rem; line-height: 1.58; color: var(--ink-2);
}

.field label {
  display: block;
  font-family: var(--sans); font-weight: 600; font-size: .6875rem;
  letter-spacing: .13em; text-transform: uppercase; color: var(--ink-2);
  margin-bottom: .3rem;
}
.field input, .field textarea {
  width: 100%;
  font-family: var(--serif);
  font-size: 1rem;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--ink);
  padding: .5rem 0;
  border-radius: 0;
}
.field textarea { resize: vertical; min-height: 6.5rem; line-height: 1.55; }
.field input::placeholder, .field textarea::placeholder { color: var(--ink-3); opacity: 1; }
.field input[aria-invalid="true"], .field textarea[aria-invalid="true"] {
  border-bottom-color: var(--accent-ink);
  border-bottom-width: 2px;
}
.err {
  display: none;
  margin: .35rem 0 0;
  font-family: var(--sans); font-size: .75rem; letter-spacing: .02em;
  color: var(--accent-ink);
}
.err.on { display: block; }

.btn {
  display: inline-block;
  font-family: var(--sans); font-weight: 600; font-size: .75rem;
  letter-spacing: .15em; text-transform: uppercase;
  color: var(--paper); background: var(--ink);
  border: 1px solid var(--ink);
  padding: .8rem 1.6rem;
  border-radius: 0;
  cursor: pointer;
}
.btn:hover { background: var(--accent-ink); border-color: var(--accent-ink); }

.note {
  margin: .7rem 0 0;
  font-family: var(--sans); font-size: .75rem; letter-spacing: .03em;
  color: var(--ink-3);
}
.status {
  margin: .9rem 0 0;
  padding: .65rem .85rem;
  border-left: 3px solid var(--accent-ink);
  background: var(--paper-2);
  font-family: var(--sans); font-size: .8125rem; line-height: 1.45;
  color: var(--ink-2);
}
.status:empty { display: none; }

/* -------------------------------------------------------------- footer --- */

.foot {
  margin-top: clamp(2.4rem, 5vw, 3.6rem);
  border-top: 2px solid var(--ink);
  padding: 1.2rem 0 2.6rem;
}
.foot-in {
  display: flex; flex-wrap: wrap; gap: 1rem 2rem;
  align-items: baseline; justify-content: space-between;
}
.foot-links { display: flex; flex-wrap: wrap; gap: 1.25rem; }
.foot a { text-decoration: none; }
.foot a:hover { color: var(--accent-ink); }
.foot .caps { color: var(--ink-3); font-weight: 500; }
.foot-bottom {
  display: flex; flex-wrap: wrap; gap: .6rem 1.5rem;
  justify-content: space-between; align-items: baseline;
  margin-top: 1.1rem; padding-top: .8rem;
  border-top: 1px solid var(--rule-soft);
}
.backlink {
  font-family: var(--sans); font-size: .6875rem; letter-spacing: .1em;
  color: var(--ink-3); text-decoration: none;
}
.backlink:hover { color: var(--ink); text-decoration: underline; }

/* ------------------------------------------------------------- article --- */

/* One grid holds the whole article page. The reading column sits dead centre
   between two equal margins; the contents rail lives in the left margin as
   marginalia, and the right margin is its deliberate mirror. The apparatus
   below — sources, correspondence, more from the publication — is set to the
   full width of that same grid, so the page never changes its own margins
   mid-scroll: it steps from the centre track to the whole measure, once. */
.article-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  column-gap: var(--gut);
  padding-top: clamp(1.5rem, 3.4vw, 2.5rem);
}
@media (min-width: 1100px) {
  .article-wrap {
    grid-template-columns:
      [field-start] 12.5rem [text-start] minmax(0, 44rem) [text-end] 12.5rem [field-end];
    justify-content: center;
  }
  .folio { grid-column: field-start / text-start; }
  .article { grid-column: text-start / text-end; }
  .after { grid-column: field-start / field-end; }
}

.folio { display: none; }
@media (min-width: 1100px) {
  .folio { display: block; }
  .folio-in { position: sticky; top: 1.75rem; }
}

/* The same contents, carried to the phone as a running head: collapsed by
   default, sticky to the top of the read, and open to the same four sections.
   A long piece on a small screen is exactly where it is needed most. */
.toc-m {
  position: sticky; top: 0; z-index: 4;
  margin: 1.5rem 0 0;
  background: var(--paper);
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
}
@media (min-width: 1100px) { .toc-m { display: none; } }
.toc-m > summary {
  list-style: none;
  cursor: pointer;
  display: flex; align-items: baseline; justify-content: space-between; gap: 1rem;
  padding: .55rem 0;
  font-family: var(--sans); font-weight: 600; font-size: .6875rem;
  letter-spacing: .14em; text-transform: uppercase; color: var(--ink-2);
}
.toc-m > summary::-webkit-details-marker { display: none; }
.toc-m > summary::after {
  content: "Contents +";
  color: var(--ink-3); letter-spacing: .1em; white-space: nowrap;
}
.toc-m[open] > summary::after { content: "Contents −"; color: var(--accent-ink); }
.toc-m ol { list-style: none; margin: 0; padding: 0 0 .5rem; counter-reset: f; }
.toc-m li { counter-increment: f; border-top: 1px solid var(--rule-soft); }
/* a label, not a heading: the rail sits above the article's <h1> in source
   order, so a real <h2> here would open the document outline in the margin */
.folio-h {
  font-family: var(--sans); font-weight: 600; font-size: .6875rem;
  letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3);
  margin: 0 0 .6rem; padding-bottom: .5rem;
  border-bottom: 1px solid var(--ink);
}
.folio ol { list-style: none; margin: 0; padding: 0; counter-reset: f; }
.folio li { counter-increment: f; }
.folio-link {
  display: grid; grid-template-columns: 1.5rem 1fr; gap: .4rem;
  padding: .45rem 0;
  font-family: var(--sans); font-size: .8125rem; line-height: 1.35;
  color: var(--ink-3); text-decoration: none;
  border-left: 2px solid transparent; padding-left: .55rem; margin-left: -.55rem;
}
.folio-link::before {
  content: counter(f, decimal-leading-zero);
  font-variant-numeric: tabular-nums; font-size: .6875rem;
  color: var(--rule); font-weight: 600;
}
.folio-link:hover { color: var(--ink); }
.folio-link[aria-current="true"] {
  color: var(--ink); border-left-color: var(--accent-ink);
}
.folio-link[aria-current="true"]::before { color: var(--accent-ink); }
.toc-m .folio-link { font-size: .875rem; padding: .5rem 0 .5rem .55rem; margin-left: 0; }

.article { min-width: 0; max-width: 44rem; margin: 0 auto; counter-reset: sec; }
.article-head { border-top: 2px solid var(--accent-ink); padding-top: .6rem; }
.article-title {
  font-family: var(--display); font-weight: 400;
  font-size: clamp(2.35rem, 5.6vw, 4.4rem);
  line-height: .95; letter-spacing: -0.022em;
  margin: .35rem 0 0; max-width: 20ch;
  text-wrap: balance;
}
.article-sub {
  font-family: var(--display); font-style: italic;
  font-size: clamp(1.1rem, 2.2vw, 1.6rem);
  line-height: 1.32; color: var(--ink-2);
  margin: .85rem 0 0; max-width: 46ch;
}

.prose {
  max-width: 66ch;
  margin-top: 1.9rem;
  font-size: 1.1875rem;
  line-height: 1.66;
}
.prose p { margin: 0 0 1.35rem; }
/* The rank step between body and section head is carried by size and by the
   section's own number — the same number the contents rail uses — so the head
   is legible as a head without the hairline rule doing the work alone. */
.prose h2 {
  font-family: var(--display); font-weight: 400;
  font-size: clamp(2.15rem, 4vw, 3.05rem);
  line-height: 1.02; letter-spacing: -0.02em;
  margin: 3.1rem 0 1.1rem;
  padding-top: .75rem;
  border-top: 1px solid var(--rule);
  scroll-margin-top: 4.5rem;
  counter-increment: sec;
  text-wrap: balance;
}
.prose h2::before {
  content: counter(sec, decimal-leading-zero);
  display: block;
  margin-bottom: .5rem;
  font-family: var(--sans); font-weight: 600; font-size: .6875rem;
  letter-spacing: .16em; color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
}
@media (min-width: 1100px) { .prose h2 { scroll-margin-top: 1.5rem; } }
.prose a {
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--accent-ink);
  text-underline-offset: .18em;
  text-decoration-thickness: 1px;
}
.prose a:hover { color: var(--accent-ink); text-decoration-thickness: 2px; }
.prose strong { font-weight: 600; }
.prose em { font-style: italic; }
/* Set in the sans against the serif text, the way a paper sets a technical
   term — no chip, no box, no fill. */
.prose code {
  font-family: var(--sans);
  font-weight: 500;
  font-size: .82em;
  letter-spacing: .015em;
  color: var(--ink-2);
  white-space: nowrap;
}
.prose--open > p:first-child::first-letter {
  float: left;
  font-family: var(--display);
  font-size: 3.35em;
  line-height: .8;
  padding: .05em .09em 0 0;
  color: var(--accent-ink);
}

.pullquote {
  margin: 2.4rem 0;
  padding: 1rem 0;
  border-top: 3px solid var(--accent-ink);
  border-bottom: 1px solid var(--ink);
  max-width: 66ch;
}
.pullquote p {
  font-family: var(--display);
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  line-height: 1.16; letter-spacing: -0.012em;
  margin: 0; text-wrap: pretty;
}
.pullquote cite {
  display: block; margin-top: .7rem;
  font-family: var(--sans); font-style: normal; font-size: .6875rem;
  letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3);
}

/* Filed-under is a ruled line of type, not a row of boxes: one rule above it,
   hairlines between the subjects, the same tracked small caps as every other
   label on the page. */
.tags {
  margin: 2.5rem 0 0; max-width: 66ch;
  border-top: 1px solid var(--ink);
  padding-top: .6rem;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: .3rem 1.1rem;
}
.tags > .caps { color: var(--ink-3); font-weight: 500; }
.tag-list { list-style: none; display: flex; flex-wrap: wrap; margin: 0; padding: 0; }
.tag-list li + li { border-left: 1px solid var(--rule); }
.tag-list a {
  display: block;
  padding: .05rem .75rem;
  font-family: var(--sans); font-size: .6875rem; font-weight: 600;
  letter-spacing: .12em; text-transform: uppercase;
  color: var(--ink-2); text-decoration: none;
}
.tag-list li:first-child a { padding-left: 0; }
.tag-list a:hover { color: var(--accent-ink); }

/* Once the argument ends, the reading column has done its job: the apparatus
   — sources, correspondence, more from the publication — takes the full measure
   instead of running on in a narrow off-centre strip beside an empty rail. */
.after {
  margin-top: clamp(2.2rem, 4.6vw, 3.4rem);
  border-top: 2px solid var(--ink);
  padding-top: clamp(1.3rem, 2.8vw, 2rem);
}
.after > :first-child .section-head { margin-top: 0; }

.sources { margin-top: 2.6rem; }
/* Flowed in balanced columns and read down in order, each reference taking only
   the depth its own title needs. Nothing is padded to square the run: a
   reference list ends where the references end. */
.sources-list {
  list-style: none; margin: .4rem 0 0; padding: 0;
  counter-reset: s;
  column-gap: var(--gut);
}
@media (min-width: 860px) { .sources-list { columns: 2; } }
@media (min-width: 1180px) { .sources-list { columns: 3; } }
.sources-list li {
  counter-increment: s;
  border-bottom: 1px solid var(--rule-soft);
  break-inside: avoid;
}
.sources-list a {
  display: grid;
  grid-template-columns: 1.9rem minmax(0, 1fr);
  gap: .5rem;
  padding: .6rem 0;
  text-decoration: none;
}
.sources-list a::before {
  content: counter(s, decimal-leading-zero);
  font-family: var(--sans); font-size: .6875rem; font-weight: 600;
  letter-spacing: .05em; color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
  padding-top: .22rem;
}
.src-t { font-size: .9375rem; line-height: 1.36; }
.sources-list a:hover .src-t { color: var(--accent-ink); text-decoration: underline; }
.src-d {
  display: block; margin-top: .18rem;
  font-family: var(--sans); font-size: .6875rem; letter-spacing: .06em;
  color: var(--ink-3); word-break: break-word;
}

/* -------------------------------------------------------------- comments - */

.comments { margin-top: 2.8rem; }
.thread { list-style: none; margin: 0; padding: 0; }
.thread li {
  padding: 1.15rem 0;
  border-bottom: 1px solid var(--rule-soft);
}
.thread .who {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: .1rem;
  margin: 0 0 .4rem;
}
.thread .who strong {
  font-family: var(--sans); font-weight: 600; font-size: .75rem;
  letter-spacing: .1em; text-transform: uppercase; color: var(--ink);
}
.thread p.said { margin: 0; max-width: 64ch; font-size: 1rem; line-height: 1.58; color: var(--ink-2); }

.comment-form { margin-top: 1.8rem; max-width: 46rem; }
.comment-form > .kicker { margin-bottom: 1.15rem; }
.comment-form .pair { display: grid; gap: 1.2rem; }
@media (min-width: 620px) { .comment-form .pair { grid-template-columns: 1fr 1fr; } }
.comment-form .field + .field { margin-top: 0; }
.comment-form .stack > * + * { margin-top: 1.2rem; }

/* ---------------------------------------------------------- more / rel ---- */

/* "More from" is the archive's own ruled row, at the archive's own scale: the
   same small square cut, the same date plate where there is no art. The least
   reliable asset on the page never appears at its largest anywhere. */

@media (prefers-reduced-motion: no-preference) {
  .lead-title, .brief-title, .nav a, .btn, .folio-link, .index a {
    transition: color .16s ease, border-color .16s ease, background-color .16s ease;
  }
}

/* Browsers print with background graphics switched off by default, which drops
   the dark ground the duotone is screened against and would leave every press
   cut an empty box on paper. On paper the plates print as plain greyscale. */
@media print {
  .plate-box { background: transparent; }
  .plate-box img {
    mix-blend-mode: normal;
    filter: grayscale(1) contrast(1.05);
    opacity: 1;
  }
  .skip { display: none; }
}
"""

# --------------------------------------------------- measured type metrics --

# The nameplate is sized from the publication's own name. A long title lands at
# a smaller ceiling with no script at all; the fitter below only ever scales it
# back up to the measure it can actually fill.
_NAME_CH = max(len(C.SITE["name"]), 6)
WM_VW = min(13.0, round(178.0 / _NAME_CH, 2))
WM_CAP = min(7.0, round(96.0 / _NAME_CH, 2))

CSS = CSS + ":root { --wm-vw: %svw; --wm-cap: %srem; }\n" % (WM_VW, WM_CAP)


# ------------------------------------------------------------- fragments ----


def head(title, description):
    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "<title>%s</title>\n" % C.esc(title)
        + '<meta name="description" content="%s">\n' % C.esc(description)
        + "<style>\n" + CSS + "\n</style>\n</head>\n"
    )


def nav(page):
    home = "index.html"
    items = (
        [("Front page", home, True)]
        if page == "home"
        else [("← Front page", home, False)]
    ) + [
        ("Archive", home + "#archive", False),
        ("Subscribe", home + "#subscribe", False),
        ("RSS", "#", False),
    ]
    li = "".join(
        '<li><a href="%s"%s>%s</a></li>'
        % (h, ' aria-current="page"' if cur else "", t)
        for t, h, cur in items
    )
    return '<nav class="nav" aria-label="Primary"><ul>%s</ul></nav>' % li


def dateline(page):
    """The one utility band: issue, date — and the only navigation. The writer
    is named in the byline of every story, so the band does not name them too."""
    return (
        '<div class="dateline"><div class="shell"><div class="dateline-in">'
        '<p class="dateline-meta">'
        '<span class="caps num">%s</span>'
        '<span class="sep" aria-hidden="true">·</span>'
        '<span class="caps mid num">%s</span>'
        "</p>%s"
        "</div></div></div>"
        % (C.esc(C.SITE["issue"]), C.esc(C.SITE["today"]), nav(page))
    )


def wordmark(tag, inner_href=None):
    """The nameplate. The fitter stretches .wm-text to the full measure; without
    script it still lands on the large clamp size, so nothing depends on JS."""
    name = C.esc(C.SITE["name"])
    text = '<span class="wm-text">%s</span>' % name
    if inner_href:
        text = '<a href="%s">%s</a>' % (inner_href, text)
    return '<%s class="wordmark">%s</%s>' % (tag, text, tag)


def masthead_home():
    return (
        '<header class="top-rule">'
        '<div class="shell"><div class="masthead">'
        "%s"
        '<p class="standfirst">%s</p>'
        "</div></div>" % (wordmark("h1"), C.esc(C.SITE["tagline"]))
        + dateline("home")
        + "</header>"
    )


def masthead_post():
    return (
        '<header class="top-rule">'
        '<div class="shell"><div class="masthead masthead--slim"><div class="slim-row">'
        "%s"
        '<span class="slim-tag">%s</span>'
        "</div></div></div>"
        % (wordmark("p", "index.html"), C.esc(C.SITE["tagline"]))
        + dateline("post")
        + "</header>"
    )


def plate(post):
    """A press cut where there is art; a dated stamp where there is not, so the
    archive's columns keep one measure either way."""
    if not post["img"]:
        month, day = post["date"].split(" ")[0][:3].upper(), post["short"].split(" ")[1]
        year = post["iso"][:4]
        return (
            '<figure class="plate plate--date" aria-hidden="true">'
            '<div class="plate-box">'
            '<span class="pd-m">%s</span><span class="pd-d num">%s</span>'
            '<span class="pd-y num">%s</span>'
            "</div></figure>" % (month, day, year)
        )
    return (
        '<figure class="plate">'
        '<div class="plate-box"><img src="img/%s" alt="Press cut for “%s”, printed as an ink duotone" loading="lazy" width="1024" height="1024"></div>'
        "</figure>"
        % (post["img"], C.esc(post["title"]))
    )


def brief(post, number=None):
    """One ruled archive row: headline beside the cut, summary and date beneath
    it. The same row serves "More from" on the article page, so the least
    reliable asset on the site is never shown larger anywhere. On the front page
    the row also carries its item number, which is what the subject index in the
    rail points at; elsewhere the number would refer to nothing and is dropped.
    """
    no = (
        '<span class="item-no num">%02d</span>' % number
        if number is not None
        else ""
    )
    return (
        '<article class="brief">'
        '<a class="brief-link" href="post.html">'
        '<p class="kicker">%s%s</p>'
        '<h3 class="brief-title">%s</h3></a>'
        "%s"
        '<p class="brief-dek">%s</p>'
        '<p class="brief-meta meta num"><b>%s</b><span class="sep">·</span>%s read</p>'
        "</article>"
        % (
            no,
            post["kicker"],
            C.esc(post["title"]),
            plate(post),
            C.esc(post["dek"]),
            C.esc(post["date"]),
            C.esc(post["read"]),
        )
    )


def ruled_run(posts, first_number=None):
    """A run of ruled archive rows. The run is exactly as long as the stories it
    has: a front page ends its columns where the copy ends, and does not set a
    filler slot to square the grid."""
    return "".join(
        brief(p, None if first_number is None else first_number + i)
        for i, p in enumerate(posts)
    )


def lede_foot():
    """A lede that has been cut closes on a rule and says where the story goes;
    a short lede that fits is simply handed over."""
    if LEDE_CUT:
        return (
            '<div class="lede-end">'
            '<span class="caps">Continued on the article page</span>'
            '<a class="readon" href="post.html">Read the whole piece →</a>'
            "</div>"
        )
    return '<a class="readon" href="post.html">Continue reading →</a>'


def footer():
    links = "".join(
        '<a class="caps" href="%s">%s</a>' % (h, t) for t, h in C.SITE["social"]
    )
    return (
        '<footer class="foot"><div class="shell">'
        '<div class="foot-in">'
        '<p class="meta" style="max-width:34ch">%s <span class="sep">·</span> %s</p>'
        '<div class="foot-links">%s</div>'
        "</div>"
        '<div class="foot-bottom">'
        '<span class="caps">Powered by Hot&nbsp;Metal</span>'
        '<a class="backlink" href="../index.html">← All concepts</a>'
        "</div></div></footer>"
        % (C.esc(C.SITE["name"]), C.esc(C.SITE["tagline"]), links)
    )


# A nameplate should command the measure, but the name belongs to the
# publication and may be one word or ten. The fitter scales the wordmark up to
# fill the column, caps it so a short name does not become a billboard, and
# falls back to wrapping at the CSS size when the name is genuinely too long.
WORDMARK_JS = """
(function(){
  var wm = document.querySelector('.masthead:not(.masthead--slim) .wordmark');
  if(!wm) return;
  var text = wm.querySelector('.wm-text');
  if(!text || !text.getBoundingClientRect) return;
  var MAX = 176;
  function fit(){
    wm.style.fontSize = '';
    wm.classList.remove('wordmark--fit');
    var avail = wm.clientWidth;
    /* measure the name as one line without committing the page to one */
    wm.classList.add('wordmark--measure');
    var natural = text.getBoundingClientRect().width;
    wm.classList.remove('wordmark--measure');
    if(!avail || !natural) return;
    var base = parseFloat(window.getComputedStyle(wm).fontSize);
    var want = base * (avail / natural) * 0.995;
    /* a name too long to hold the measure on one line keeps its wrap */
    if(want < base) return;
    wm.style.fontSize = Math.min(want, MAX).toFixed(2) + 'px';
    wm.classList.add('wordmark--fit');
  }
  var lastW = 0;
  function refit(){
    var w = wm.clientWidth;
    if(w === lastW) return;   /* height changes are ours; only width matters */
    lastW = w;
    fit();
  }
  fit();
  lastW = wm.clientWidth;
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ fit(); lastW = wm.clientWidth; }).catch(function(){});
  }
  if(window.ResizeObserver){
    new ResizeObserver(refit).observe(wm);
  } else {
    var t;
    window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(fit, 90); });
  }
})();
"""

SUBSCRIBE_JS = """
(function(){
  var f = document.getElementById('subscribe-form');
  if(!f) return;
  var email = document.getElementById('sub-email');
  var err = document.getElementById('sub-email-err');
  var out = document.getElementById('sub-status');
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var v = email.value.trim();
    var ok = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v);
    err.classList.toggle('on', !ok);
    email.setAttribute('aria-invalid', ok ? 'false' : 'true');
    if(!ok){ out.textContent = ''; email.focus(); return; }
    out.textContent = 'Thanks — ' + v + ' would be on the list. Demo only: nothing was sent.';
    f.reset();
    email.setAttribute('aria-invalid','false');
  });
})();
"""

COMMENT_JS = """
(function(){
  var f = document.getElementById('comment-form');
  if(!f) return;
  var out = document.getElementById('comment-status');
  var fields = [
    ['c-name','c-name-err', function(v){ return v.length > 1; }],
    ['c-email','c-email-err', function(v){ return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v); }],
    ['c-body','c-body-err', function(v){ return v.length > 9; }]
  ];
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var first = null;
    fields.forEach(function(t){
      var el = document.getElementById(t[0]);
      var er = document.getElementById(t[1]);
      var ok = t[2](el.value.trim());
      er.classList.toggle('on', !ok);
      el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if(!ok && !first) first = el;
    });
    if(first){ out.textContent = ''; first.focus(); return; }
    out.textContent = 'Your note reads well. Demo only — nothing was sent and no comment was published.';
    f.reset();
    fields.forEach(function(t){ document.getElementById(t[0]).setAttribute('aria-invalid','false'); });
  });
})();
"""

FOLIO_JS = """
(function(){
  var lists = Array.prototype.slice.call(document.querySelectorAll('[data-toc]'));
  if(!lists.length) return;
  /* the margin rail and the phone's running head are marked independently */
  var groups = lists.map(function(list){
    var links = Array.prototype.slice.call(list.querySelectorAll('.folio-link'));
    return {
      links: links,
      heads: links.map(function(l){
        return document.getElementById(l.getAttribute('href').slice(1));
      })
    };
  });
  var sheet = document.querySelector('.toc-m');
  if(sheet){
    sheet.addEventListener('click', function(e){
      if(e.target.closest('.folio-link')) sheet.open = false;
    });
  }
  var ticking = false;
  function mark(){
    ticking = false;
    var line = window.scrollY + window.innerHeight * 0.28;
    groups.forEach(function(g){
      var active = -1;
      for(var i = 0; i < g.heads.length; i++){
        if(g.heads[i] && g.heads[i].getBoundingClientRect().top + window.scrollY <= line) active = i;
      }
      g.links.forEach(function(l, i){
        if(i === active) l.setAttribute('aria-current','true');
        else l.removeAttribute('aria-current');
      });
    });
  }
  function onScroll(){
    if(ticking) return;
    ticking = true;
    window.requestAnimationFrame(mark);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  mark();
})();
"""


# ------------------------------------------------------------------ home ----


def home():
    topic_rows = "".join(
        '<li><a href="#archive"><span class="ix-t">%s</span>'
        '<span class="ix-n num">%s</span></a></li>'
        % (C.esc(tag), " ".join(nums))
        for tag, nums in TOPICS
    )

    html = head(
        "%s — %s" % (C.SITE["name"], C.SITE["tagline"]),
        C.SITE["short_description"],
    )
    html += (
        '<body>\n<a class="skip" href="#lead">Skip to the lead story</a>\n'
        + masthead_home()
        + '<main id="main">\n'
        # ---- front page
        '<div class="shell"><div class="front">'
        '<div class="lead" id="lead">'
        '<div class="lead-rule"><p class="kicker">'
        '<span class="item-no num">01</span>%s</p></div>'
        '<a class="lead-head" href="post.html"><h2 class="lead-title">%s</h2></a>'
        '<p class="lead-dek">%s</p>'
        '<p class="byline meta num">By <b>%s</b><span class="sep">·</span>%s<span class="sep">·</span>%s read</p>'
        '<div class="lead-body %s">%s</div>'
        "%s"
        "</div>"
        '<div class="front-divider" aria-hidden="true"></div>'
        '<aside class="rail" aria-labelledby="subject-index">'
        '<h2 class="rail-head" id="subject-index">Index of subjects</h2>'
        '<ul class="index">%s</ul>'
        "</aside>"
        "</div>"
        % (
            LEAD["kicker"],
            C.esc(LEAD["title"]),
            C.esc(LEAD["dek"]),
            C.esc(C.SITE["author"]),
            C.esc(LEAD["date"]),
            C.esc(LEAD["read"]),
            LEDE_CLASS,
            LEDE,
            lede_foot(),
            topic_rows,
        )
    )

    html += (
        '<section class="archive" id="archive" aria-labelledby="archive-h">'
        '<div class="section-head"><h2 id="archive-h">The archive</h2>'
        '<p class="caps num">%d dispatches <span class="sep">·</span> February – September 2026</p></div>'
        '<div class="archive-grid">%s</div>'
        "</section>"
        % (len(C.POSTS), ruled_run(ARCHIVE, first_number=2))
    )

    html += (
        '<section class="subscribe" id="subscribe" aria-labelledby="sub-h">'
        '<div class="subscribe-in">'
        "<div>"
        '<p class="kicker">Delivered by email</p>'
        '<h2 id="sub-h">Get the next issue.</h2>'
        '<p class="blurb">%s</p>'
        "</div>"
        # method="dialog" outside a <dialog> aborts submission in the browser
        # itself, so with scripting off the form cannot navigate away or put a
        # reader's address into the URL. The submit event still fires, so the
        # local validation below is unaffected.
        '<form id="subscribe-form" method="dialog" novalidate>'
        '<div class="field">'
        '<label for="sub-email">Email address</label>'
        '<input id="sub-email" name="email" type="email" inputmode="email" autocomplete="email" '
        'placeholder="you@example.com" aria-describedby="sub-email-err">'
        '<p class="err" id="sub-email-err">Enter a valid email address, e.g. you@example.com.</p>'
        "</div>"
        '<p style="margin:1.1rem 0 0"><button class="btn" type="submit">Subscribe</button></p>'
        '<p class="note">Prototype — the form validates locally and sends nothing.</p>'
        '<p class="status" id="sub-status" role="status" aria-live="polite"></p>'
        "</form>"
        "</div></section>" % C.esc(C.SITE["description"])
    )

    html += "</div></main>" + footer()
    html += "<script>%s\n%s</script>\n</body>\n</html>\n" % (WORDMARK_JS, SUBSCRIBE_JS)
    return html


# ------------------------------------------------------------------ post ----


def post():
    folio = "".join(
        '<li><a class="folio-link" href="#%s">%s</a></li>' % (sid, C.esc(label))
        for sid, label in C.ARTICLE["sections"]
    )

    sources = "".join(
        '<li><a href="%s" target="_blank" rel="noopener noreferrer">'
        '<span><span class="src-t">%s</span><span class="src-d">%s</span></span></a></li>'
        % (url, C.esc(title), C.esc(domain))
        for title, domain, url in C.CITATIONS
    )

    tags = "".join(
        '<li><a href="index.html#archive">%s</a></li>' % C.esc(t)
        for t in C.ARTICLE["tags"]
    )

    thread = "".join(
        '<li><p class="who"><strong>%s</strong><span class="sep">·</span>'
        '<span class="meta num">%s</span></p><p class="said">%s</p></li>'
        % (C.esc(name), C.esc(date), C.esc(text))
        for name, date, text in C.COMMENTS
    )

    related = ruled_run(RELATED)

    # split the body so the pull quote sits between the second and third section
    marker = '<h2 id="frontend-too">'
    idx = ARTICLE_HTML.find(marker)
    body_a, body_b = ARTICLE_HTML[:idx], ARTICLE_HTML[idx:]

    html = head(
        "%s — %s" % (C.ARTICLE["title"], C.SITE["name"]),
        C.ARTICLE["hook"],
    )
    html += (
        '<body>\n<a class="skip" href="#article">Skip to the article</a>\n'
        + masthead_post()
        + '<main id="main"><div class="shell"><div class="article-wrap">'
        '<aside class="folio" aria-label="Sections in this article"><div class="folio-in">'
        '<p class="folio-h">In this article</p><ol data-toc>%s</ol></div></aside>' % folio
    )

    html += (
        '<article class="article" id="article">'
        '<div class="article-head"><p class="kicker">%s <span class="sep">·</span> Essay</p>'
        '<h1 class="article-title">%s</h1>'
        '<p class="article-sub">%s</p>'
        '<p class="byline meta num">By <b>%s</b><span class="sep">·</span>'
        '<time datetime="%s">%s</time><span class="sep">·</span>%s read'
        "</p></div>"
        '<details class="toc-m"><summary>In this article</summary>'
        '<ol data-toc>%s</ol></details>'
        % (
            C.ARTICLE["kicker"],
            C.esc(C.ARTICLE["title"]),
            C.esc(C.ARTICLE["subtitle"]),
            C.esc(C.SITE["author"]),
            C.ARTICLE["iso"],
            C.esc(C.ARTICLE["date"]),
            C.esc(C.ARTICLE["read"]),
            folio,
        )
    )

    html += '<div class="prose prose--open">%s</div>' % body_a
    html += (
        '<figure class="pullquote"><p>%s</p>'
        "<cite>%s <span class=\"sep\">·</span> %s</cite></figure>"
        % (PULL, C.esc(C.SITE["author"]), C.esc(C.ARTICLE["kicker"]))
    )
    html += '<div class="prose">%s</div>' % body_b

    html += (
        '<section class="tags" aria-labelledby="tags-h">'
        '<p class="caps" id="tags-h">Filed under</p>'
        '<ul class="tag-list">%s</ul></section>' % tags
    )

    # The argument ends here. What follows is apparatus: it stays inside the same
    # grid and takes its full width — from the contents rail's left edge to the
    # right margin's outer edge — so the page steps measure once, on a stated
    # line, instead of quietly changing its own margins mid-scroll.
    html += "</article>"

    html += (
        '<div class="after">'
        '<section class="sources" aria-labelledby="sources-h">'
        '<div class="section-head"><h2 id="sources-h">Sources</h2>'
        '<p class="caps num">%d references</p></div>'
        '<ol class="sources-list">%s</ol></section>' % (len(C.CITATIONS), sources)
    )

    html += (
        '<section class="comments" aria-labelledby="comments-h">'
        '<div class="section-head"><h2 id="comments-h">Correspondence</h2>'
        '<p class="caps num">%d letters</p></div>'
        '<ul class="thread">%s</ul>'
        # see the subscribe form: method="dialog" keeps a scriptless submit local
        '<form class="comment-form" id="comment-form" method="dialog" novalidate aria-labelledby="cf-h">'
        '<p class="kicker" id="cf-h">Write to the editor</p>'
        '<div class="stack">'
        '<div class="pair">'
        '<div class="field"><label for="c-name">Name</label>'
        '<input id="c-name" name="name" type="text" autocomplete="name" placeholder="Your name" aria-describedby="c-name-err">'
        '<p class="err" id="c-name-err">Please tell us who you are.</p></div>'
        '<div class="field"><label for="c-email">Email</label>'
        '<input id="c-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" aria-describedby="c-email-err">'
        '<p class="err" id="c-email-err">Enter a valid email address — it is never published.</p></div>'
        "</div>"
        '<div class="field"><label for="c-body">Your reply</label>'
        '<textarea id="c-body" name="comment" rows="5" placeholder="Add to the argument…" aria-describedby="c-body-err"></textarea>'
        '<p class="err" id="c-body-err">A reply needs at least a sentence.</p></div>'
        "<div><button class=\"btn\" type=\"submit\">Post reply</button>"
        '<p class="note">Prototype — comments validate locally and are never submitted.</p>'
        '<p class="status" id="comment-status" role="status" aria-live="polite"></p></div>'
        "</div></form></section>"
        % (len(C.COMMENTS), thread)
    )

    html += (
        '<section class="more" aria-labelledby="more-h">'
        '<div class="section-head"><h2 id="more-h">More from %s</h2>'
        '<p class="caps"><a href="index.html#archive" style="text-decoration:none">The full archive →</a></p></div>'
        '<div class="archive-grid">%s</div></section>'
        % (C.esc(C.SITE["name"]), related)
    )

    html += "</div></div></div></main>" + footer()
    html += "<script>%s\n%s</script>\n</body>\n</html>\n" % (COMMENT_JS, FOLIO_JS)
    return html


def build():
    common.prepare(OUT, FONTS, IMAGES)
    common.write(OUT, "index.html", home())
    common.write(OUT, "post.html", post())
    print("built:", OUT)


if __name__ == "__main__":
    build()
