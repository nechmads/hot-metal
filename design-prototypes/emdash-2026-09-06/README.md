# EmDash blog templates — five design concepts

Open **`index.html`** in any browser. It links to all five concepts.

Each concept has two pages:

| | Concept | Home | Article |
|---|---|---|---|
| 01 | Broadsheet | `01-broadsheet/index.html` | `01-broadsheet/post.html` |
| 02 | Signal | `02-signal/index.html` | `02-signal/post.html` |
| 03 | Atrium | `03-atrium/index.html` | `03-atrium/post.html` |
| 04 | Split | `04-split/index.html` | `04-split/post.html` |
| 05 | Marginalia | `05-marginalia/index.html` | `05-marginalia/post.html` |

Two of these five were built as real templates and renamed: **Broadsheet
shipped as `press-machine`** and **Signal as `one-signal`**, in
`apps/emdash-blog/src/templates/`. The prototypes keep their original names
because the review record refers to them that way.

Screenshots from the design review are in `review/`. The full screenshot sets
and the packaged zip were removed before commit — they were regenerable and
large; see `_build/NOTES.md`.

## What these are

Static design prototypes for the publication templates rendered by
`apps/emdash-blog`. They are for choosing a direction — no application code has
been changed, and nothing here is wired to the CMS.

Everything is self-contained: fonts and images are bundled inside each concept
folder, so the pages work offline, straight from a file, with no server, no
build step and no network. You can zip the whole folder and send it on.

## What is real and what is demo

- **The content is real.** Copy, archive, the full 1,740-word article, its 13
  citations and the featured images all come from the live *Looking Ahead*
  publication, so the concepts are compared on the material they will carry.
- **The comments are illustrative.** The three comment threads are written for
  the prototype; they are not real reader comments.
- **The forms do nothing.** Comment and subscribe forms validate locally and
  then say "demo only — nothing was sent". Nothing leaves the page.
- **Links stay inside the concept.** Every archive row opens that concept's own
  article page — the prototypes only have two pages each. Links in the article
  text and the sources list are genuine outbound links to the cited sources.

## Two things to look at while comparing

1. **The lead story has no featured image.** That is true of the real newest
   post, and missing images are common. Each concept answers it differently —
   this is the clearest difference between them.
2. **The accent colour is per-publication.** It is set to Looking Ahead's red
   here, but a real template has to survive any hex. Each concept confines the
   accent to places where an arbitrary colour still works.
