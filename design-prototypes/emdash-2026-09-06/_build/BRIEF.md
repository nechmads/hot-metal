# Run brief — EmDash blog templates, exploration + prototypes

Run: `design-prototypes/emdash-2026-09-06/`  ·  Started 2026-09-06
Branch: `claude/emdash-blog-templates-d67c29` (worktree)

## Product brief (shared by all concepts)

**Product.** Hot Metal publication templates, rendered by `apps/emdash-blog`
(Astro 6 + Tailwind, EmDash CMS). A template is chosen per publication
(`publications.template_id`) and must look right for *any* publication that
picks it — not just one site.

**Audience.** Readers of an independent expert's publication: arriving from
X/LinkedIn/search, skimming the home page, then reading one long argument.

**Primary job.**
- *Home:* make one article irresistible, make the archive scannable and
  credible at a glance.
- *Post:* sustained 1,500–2,500 word reading with in-text links, a real
  citations block, and comments.

**Data actually available** (`PublicationBranding` + `Post`):
name, tagline, description, logoUrl, headerImageUrl, **accentColor (arbitrary
per-publication hex, injected as `--publication-accent`)**, socialLinks;
per post: title, subtitle, hook, excerpt, **featuredImage (often absent)**,
tags, topics, author, publishedAt, `citations[]`, body HTML.

**Hard constraints that shape the design.**
1. **Featured images are unreliable.** They are AI-generated, always square
   (1024×1024), variable quality, and frequently missing entirely — the newest
   post in the sample has none. A template that leans on photography fails.
2. **The accent color is not ours.** Any design must stay handsome when the
   accent is swapped to an arbitrary hex.
3. Citations, comments, RSS and tags are required surfaces, not decoration.
4. Astro + Tailwind, server-rendered on Cloudflare; view transitions enabled.

**Tone.** Authoritative, forward-looking, human. Not corporate-AI.

**Exclusions.** Interchangeable rounded-card grids; purple/blue gradients;
glassmorphism; decorative blobs, glows and particle fields; the current
centered-Playfair blog default.

**Sample content.** The public "Looking Ahead" publication (the user's own).
Identical content across all five concepts.

## Coverage per concept

`index.html` (home) and `post.html` (article), each at desktop and mobile,
with: masthead/nav, publication identity, a lead story, an archive list, a
no-image post, a long article with h2s + in-text links, a citations block,
a comments thread with a form, tags, and a footer.

## Entropy

External seeds (`node crypto.randomBytes`), one per direction:
1 `5703c8f2c656a6a7de67462cb263e46d` · 2 `66758d7438b518efcb0014537843ff89`
3 `1f4f4fd5972e6a513c511f71d08679ec` · 4 `39f1d41197d1b1872029dd66bdde1b99`
5 `1d22a850208ac982d676df4d3351f6d7`

## The five directions

### 1 — Broadsheet  (`01-broadsheet/`)
**Core idea.** A newspaper front page, not a blog. The first screen is *words*:
masthead, dateline rule, a lead story in large display type with a two-column
deck, and a briefs rail. Earns authority the way a paper of record does.
**Visual system.** Dense asymmetric multi-column grid held by hairline rules;
high-contrast serif display (Instrument Serif) + IBM Plex Sans for kickers and
metadata + Source Serif 4 body; newsprint white / ink black / one accent used
only in rules and kickers; images boxed small and **duotoned** so uneven AI art
reads as deliberate press illustration.
**Signature moment.** The masthead + dateline rule + lead headline stack, with
the archive running as ruled columns beneath it.
**Aesthetic risk.** No hero image above the fold at all. Density can crowd.
**What to avoid.** Faux-vintage newsprint textures and sepia. It is a *modern*
broadsheet, not a pastiche.
**Best fit.** Analysts and essayists who want "publication of record" posture.

### 2 — Signal  (`02-signal/`)
**Core idea.** An intelligence dispatch log. The home page is a numbered, dated
**index** — no cards, no thumbnails — where each row opens its own excerpt in
place. Material metaphor: the terminal readout / situation brief.
**Visual system.** Near-black field, JetBrains Mono for structure and metadata,
Inter for reading; hairline grid; entries numbered `001…008`; images appear
only as wide 16:5 strips so square art becomes texture; accent used as a single
phosphor signal color.
**Signature moment.** Hovering/keying a row in the index expands its dek inline
and slides a rule across — the archive behaves like a live log.
**Aesthetic risk.** Cold. Mitigated by generous reading measure on the post
page and warm neutral text, not pure #fff on #000.
**What to avoid.** Hacker-cosplay: no matrix rain, no scanlines, no neon green.
**Best fit.** Technical and geopolitical analysis; readers who skim by date.

### 3 — Atrium  (`03-atrium/`)
**Core idea.** A gallery catalogue. One idea per screen, enormous air, and the
square image finally treated *as a square* — a centered plate with a caption
and a great deal of surrounding silence. Turns the format constraint into the
whole aesthetic.
**Visual system.** Warm off-white paper, deep ink, accent only in tiny marks;
Newsreader at display sizes with tight tracking, small-caps metadata in Inter;
alternating rhythm of full-measure text and centered plates; very low density.
**Signature moment.** The article opens on type alone — title over three lines
at ~5rem, no image — and the plate arrives only after the first paragraph.
**Aesthetic risk.** Low density; the archive must feel curated rather than
empty. Scroll length is long by design.
**What to avoid.** Whitespace as an excuse for a thin page; the archive still
has to carry eight posts legibly.
**Best fit.** Essayists; publications with few, long, considered pieces.

### 4 — Split  (`04-split/`)
**Core idea.** A fixed identity panel in the accent color beside a scrolling
column of content. The accent is used as a **large solid plane**, not a dot —
so a publication's color choice becomes the design.
**Visual system.** Sticky left panel (masthead, tagline, nav, a live "now
showing" state) against a light reading column; Archivo — grotesque, heavy 900
display — with Archivo body; images bleed to the panel edge, cropped tall;
panel content cross-fades as sections scroll past.
**Signature moment.** The colored plane holding the masthead while the reading
column moves, and the panel's caption changing with the section in view.
**Aesthetic risk.** No conventional top nav on desktop; sticky panels punish
mobile, so it collapses to a bold stacked header under 900px.
**What to avoid.** Turning the panel into a dashboard sidebar with icons.
**Best fit.** Publications with a strong brand color and a confident voice.

### 5 — Marginalia  (`05-marginalia/`)
**Core idea.** An annotated researcher's notebook. The defining device is a
real outer **margin**: dates, tags, reading time and *numbered citation notes*
live there, and on the post page each source appears in the margin beside the
sentence that cites it — which is exactly what Hot Metal's `citations[]` field
is for.
**Visual system.** Aged-paper ground, ink text, a red-pencil accent; Crimson
Pro for reading, IBM Plex Mono for every margin note; asymmetric two-column
measure (wide text + narrow margin); images sit small in the margin and open
to a plate on click, so weak images stay small.
**Signature moment.** Hovering an in-text citation lights its numbered note in
the margin, and vice versa.
**Aesthetic risk.** Margins are hard below 1100px — they fold under the
paragraph they annotate rather than disappearing.
**What to avoid.** Skeuomorphic paper textures, coffee stains, torn edges.
**Best fit.** Heavily sourced, research-led writing — the platform's default
output.

## Divergence check

| | composition | type | imagery | color | interaction |
|---|---|---|---|---|---|
|1|dense ruled columns|Didone-ish serif display|duotone boxes|paper/ink|none (print)|
|2|numbered index rail|mono-led|16:5 strips|near-black + signal|row expand|
|3|full-air plates|humanist serif display|centered squares|warm paper|scroll rhythm|
|4|fixed panel + column|heavy grotesque|tall bleeds|accent plane|panel cross-fade|
|5|text + annotation margin|reading serif + mono|small margin thumbs|aged paper + red|linked notes|

At least three dimensions change between any neighbouring pair.

## Budget (stated up front)

Per concept: initial build + fresh independent critic assessment, up to **2**
critique-driven revision rounds targeting 8.5/10, then one `ap-design-polish`
subtraction pass and `ap-frontend-review` verification, with the reserved
final assessment if polish changed the appearance. Max 4 valid assessments per
concept. Every critic gets a new conversation with no inherited history.
