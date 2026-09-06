"""Direction 2 — Signal.

An intelligence dispatch log. Near-black warm-neutral field, JetBrains Mono for
every piece of structure and metadata, Inter for reading. The home page is a
numbered index (001…008) on a hairline grid with sticky column headers; each row
opens its own summary in place and pulls an accent rule across itself. Nothing
here is illustrated: the lead states NO IMAGE ON FILE and means it.
"""

import os
import re

import content as C
import common

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "02-signal")
FONTS = ["jetbrains-mono", "inter", "ibm-plex-sans"]
# Only the weights this page actually sets: mono for structure, Inter for
# display and interface, Plex Sans for the read. Any other face is dropped from
# the CSS and never copied into the folder, so nothing unused ships.
WEIGHTS = {
    "JetBrains Mono": {"400", "500", "700"},
    "Inter": {"400", "500", "600"},
    "IBM Plex Sans": {"400", "600"},
}
IMAGES = []


def faces():
    """The @font-face rules this page uses, and the woff2 files they need."""
    rules, files = [], set()
    for block in common.font_css(FONTS).split("@font-face")[1:]:
        family = re.search(r"font-family: '([^']+)'", block).group(1)
        weight = re.search(r"font-weight: (\d+)", block).group(1)
        if weight in WEIGHTS[family]:
            rules.append("@font-face" + block)
            files.update(re.findall(r"fonts/([\w.-]+\.woff2)", block))
    return "".join(rules), files

S = C.SITE
POSTS = C.POSTS
A = C.ARTICLE

PULLQUOTE = "If a human can click it, an agent should be able to call it."

RELATED = [POSTS[2], POSTS[3], POSTS[4]]


# ----------------------------------------------------------------------------- css

def css():
    return faces()[0] + """
*,*::before,*::after{box-sizing:border-box}
:root{
  /* The publication's own hex is the ONE colour token this template takes.
     --accent-lit is derived from it so the signal stays legible on the dark
     ground whatever hue a publication picks. */
  --accent:%(accent)s;
  --accent-mark:%(accent)s;
  --accent-lit:%(accent)s;
  --ground:#0c0d10;
  --ground-2:#101217;
  --ground-3:#14161c;
  --ink:#e7e5e0;
  --ink-hi:#f9f7f3;
  --ink-2:#a3a5ab;
  --ink-3:#7a7d86;
  --rule:#20222a;
  --rule-2:#2c2f38;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  /* Three voices, three jobs: mono for structure, Inter for display and
     interface, a humanist text face for the 2,000-word read. */
  --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  --read:'IBM Plex Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  --pad:clamp(1.15rem,4vw,3.25rem);
  --maxw:84rem;
  /* The dispatch page's own frame: rail + gutter + measure and nothing else,
     so the article has one left axis and no leftover right third. */
  --rail:12rem;
  --railgap:3rem;
  /* Reading measure, tuned by measurement rather than by eye: on a dark ground
     the comfortable band is ~62-66 characters, not the ~70+ that 58ch gave.
     Held in rem, not ch, so the end-matter blocks (set at 16px) land on exactly
     the same right edge as the 19px article body. */
  --measure:38rem;
}
@supports (color: color-mix(in oklab, red 50%%, blue)) {
  :root{ --accent-lit:color-mix(in oklab, var(--accent) 58%%, #ffe4d8); }
}
/* Both derived values keep the publication's hue and chroma and only put a
   floor under its lightness, so a very dark hex still reads as a mark and as
   text. A hex that is already light enough passes through untouched. */
@supports (color: oklch(from red max(l, .5) c h)) {
  :root{
    --accent-mark:oklch(from var(--accent) max(l, .52) c h);
    --accent-lit:oklch(from color-mix(in oklab, var(--accent) 58%%, #ffe4d8) max(l, .68) c h);
  }
}
html{-webkit-text-size-adjust:100%%}
body{
  margin:0;background:var(--ground);color:var(--ink);
  font-family:var(--sans);font-size:16px;line-height:1.5;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  overflow-x:hidden;
}
img{max-width:100%%;display:block}
a{color:inherit}
::selection{background:var(--accent-lit);color:var(--ground)}

.wrap{max-width:var(--maxw);margin:0 auto;padding-inline:var(--pad)}
.mono{font-family:var(--mono)}
.lbl{
  font-family:var(--mono);font-size:.6875rem;font-weight:500;
  letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);
}
.rule{border:0;border-top:1px solid var(--rule);margin:0}

a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,
summary:focus-visible,[tabindex]:focus-visible{
  outline:2px solid var(--accent-lit);outline-offset:3px;border-radius:1px;
}

/* ---------------------------------------------------------------- masthead */
.top{border-bottom:1px solid var(--rule)}
.mast{
  display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;
  gap:1.25rem 2rem;padding:clamp(1.6rem,3.6vw,2.9rem) 0 clamp(1.1rem,2.4vw,1.6rem);
}
.brand{text-decoration:none;display:block;min-width:0}
.brand .name{
  font-size:clamp(1.6rem,3.5vw,2.35rem);font-weight:600;letter-spacing:-.028em;
  line-height:1.04;color:var(--ink);margin:0;
}
.brand .tag{
  margin:.55rem 0 0;font-family:var(--mono);font-size:.75rem;letter-spacing:.05em;
  color:var(--ink-2);
}
.brand:hover .name{color:#fff}

.nav{display:flex;flex-wrap:wrap;gap:.15rem .35rem;align-items:center}
.nav a{
  font-family:var(--mono);font-size:.6875rem;font-weight:500;letter-spacing:.13em;
  text-transform:uppercase;text-decoration:none;color:var(--ink-3);
  padding:.5rem .7rem;border:1px solid transparent;transition:color .18s,border-color .18s;
}
.nav a:hover{color:var(--ink)}
.nav a[aria-current]{color:var(--ink);border-color:var(--rule-2)}
.nav a[aria-current]::before{
  content:"";display:inline-block;width:.4rem;height:.4rem;background:var(--accent-mark);
  margin-right:.5rem;vertical-align:.05em;
}

/* status strip */
.strip{
  display:flex;flex-wrap:wrap;gap:.4rem 1.6rem;align-items:center;
  padding:.7rem 0;border-top:1px solid var(--rule);
  font-family:var(--mono);font-size:.6875rem;letter-spacing:.11em;
  text-transform:uppercase;color:var(--ink-3);
}
.strip .on{color:var(--ink-2)}
.strip .dot{
  display:inline-block;width:.4rem;height:.4rem;background:var(--accent-mark);
  margin-right:.5rem;vertical-align:.06em;
}

/* ------------------------------------------------------------------- lead */
.lead{padding-block:clamp(2.4rem,6vw,4.5rem) clamp(2rem,4vw,3rem)}
.lead-kick{
  display:flex;flex-wrap:wrap;gap:.35rem 1.1rem;align-items:baseline;
  margin-bottom:clamp(1.1rem,2.6vw,1.9rem);
}
/* The accent marks the dispatch number itself — the same square the index rows
   use — rather than floating as a loose rule fragment under the masthead. */
.lead-kick .n,.crumb .n{
  font-family:var(--mono);font-size:.75rem;font-weight:700;letter-spacing:.12em;
  color:var(--accent-lit);
}
.lead-kick .n::before,.crumb .n::before{
  content:"";display:inline-block;width:.4rem;height:.4rem;background:var(--accent-mark);
  margin-right:.55rem;vertical-align:.08em;
}
.lead h2{margin:0;max-width:18ch;text-wrap:balance}
.lead h2 a{
  text-decoration:none;display:inline-block;
  font-size:clamp(2.05rem,6.1vw,4.05rem);font-weight:600;letter-spacing:-.035em;
  line-height:1.01;color:var(--ink);
  transition:color .18s;
}
.lead h2 a:hover{color:#fff}
/* Deck and hook sit side by side under a headline that spans the field, and the
   readout closes the block as a ruled strip the full width — so the meta table
   is part of the composition rather than parked in the corner. */
.lead-grid{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(0,24rem);
  gap:clamp(1.4rem,3vw,2.8rem) clamp(1.8rem,4vw,3.5rem);align-items:start;
  margin-top:clamp(1.2rem,2.6vw,1.9rem);
}
.lead .sub{
  margin:0;max-width:46ch;
  font-size:clamp(1.05rem,1.7vw,1.3rem);line-height:1.45;color:var(--ink-2);
  font-weight:400;letter-spacing:-.008em;
}
.hook{
  margin:0;padding-left:clamp(1rem,2vw,1.6rem);
  border-left:2px solid var(--accent-mark);
  font-size:1.0625rem;line-height:1.62;color:var(--ink);max-width:44ch;
}
.readout{
  margin-top:clamp(2rem,4.5vw,3.2rem);
  border-top:1px solid var(--rule-2);border-bottom:1px solid var(--rule-2);
}
.readout dl{
  margin:0;display:grid;grid-auto-flow:column;grid-template-rows:auto auto;
  grid-auto-columns:minmax(0,1fr);
  font-family:var(--mono);font-size:.75rem;line-height:1.5;
}
.readout dt{
  padding:.85rem 0 .3rem;color:var(--ink-3);
  letter-spacing:.14em;text-transform:uppercase;font-size:.625rem;
}
.readout dd{margin:0;padding:0 0 .95rem;color:var(--ink-2)}
.readout dl > *:nth-child(n+3){border-left:1px solid var(--rule);padding-left:clamp(1rem,2vw,1.6rem)}
.go{
  display:inline-flex;align-items:center;gap:.6rem;margin-top:1.6rem;
  font-family:var(--mono);font-size:.75rem;font-weight:500;letter-spacing:.12em;
  text-transform:uppercase;text-decoration:none;color:var(--ink);
  border-bottom:1px solid var(--accent-mark);padding-bottom:.35rem;
  transition:color .18s,gap .18s;
}
.go:hover{color:var(--accent-lit);gap:.95rem}
.go .arw{color:var(--accent-lit)}

/* ------------------------------------------------------------------ index */
.idx{padding-bottom:clamp(3rem,7vw,5rem)}
.idx-bar{
  display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:baseline;
  justify-content:space-between;padding-bottom:.85rem;
}
.idx-bar h2{
  margin:0;font-family:var(--mono);font-size:.8125rem;font-weight:700;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink);
}
.toggle{
  font-family:var(--mono);font-size:.6875rem;font-weight:500;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ink-3);background:transparent;
  border:1px solid var(--rule-2);padding:.45rem .8rem;cursor:pointer;
  transition:color .18s,border-color .18s;
}
.toggle:hover{color:var(--ink);border-color:var(--ink-3)}
.toggle[aria-pressed="true"]{color:var(--accent-lit);border-color:var(--accent-mark)}

.cols{--g:3.6rem 8.5rem minmax(0,1fr) 11.5rem 4.5rem}
.idx-head{
  position:sticky;top:0;z-index:6;background:var(--ground);
  display:grid;grid-template-columns:var(--g);column-gap:1.5rem;
  padding:.7rem 0;border-top:1px solid var(--rule-2);border-bottom:1px solid var(--rule-2);
  font-family:var(--mono);font-size:.625rem;font-weight:500;letter-spacing:.16em;
  text-transform:uppercase;color:var(--ink-3);
}
.idx-head .r{text-align:right}

.rows{border-bottom:1px solid var(--rule)}
.row{
  position:relative;display:grid;grid-template-columns:var(--g);
  grid-template-areas:"num date title sec read" "num date dek dek dek";
  column-gap:1.5rem;align-items:baseline;
  padding:.95rem 0;border-bottom:1px solid var(--rule);
  text-decoration:none;color:inherit;
}
.row:last-child{border-bottom:0}
.row::after{
  content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;
  background:var(--accent-mark);transform:scaleX(0);transform-origin:left center;
  transition:transform .45s cubic-bezier(.22,.7,.25,1);
}
/* The index number is the log's signature: it carries the accent and the weight,
   and it is the only bright thing in the row besides the title. */
.c-num{grid-area:num;font-family:var(--mono);font-size:.8125rem;font-weight:700;
  letter-spacing:.04em;color:var(--accent-lit);white-space:nowrap;align-self:start;
  padding-top:.1rem}
.c-meta{display:contents}
.d-short{display:none}
.c-date{grid-area:date;font-family:var(--mono);font-size:.75rem;color:var(--ink-3);
  white-space:nowrap;align-self:start;padding-top:.15rem;transition:color .18s}
.c-title{grid-area:title;font-size:1.0625rem;font-weight:500;letter-spacing:-.014em;
  line-height:1.32;color:var(--ink);transition:color .18s}
.c-sec{grid-area:sec;font-family:var(--mono);font-size:.6875rem;letter-spacing:.09em;
  text-transform:uppercase;color:var(--ink-3);align-self:start;padding-top:.28rem;
  transition:color .18s}
.c-read{grid-area:read;font-family:var(--mono);font-size:.75rem;color:var(--ink-3);
  text-align:right;white-space:nowrap;align-self:start;padding-top:.15rem;
  transition:color .18s}
.c-dek{
  grid-area:dek;max-height:0;overflow:hidden;opacity:0;
  transition:max-height .38s cubic-bezier(.22,.7,.25,1),opacity .26s ease;
}
.c-dek span{display:block;padding:.55rem 0 .15rem;max-width:64ch;
  font-size:.9375rem;line-height:1.58;color:var(--ink-2)}

.row:hover .c-title,.row:focus-visible .c-title{color:#fff}
.row:hover .c-date,.row:focus-visible .c-date,
.row:hover .c-sec,.row:focus-visible .c-sec,
.row:hover .c-read,.row:focus-visible .c-read{color:var(--ink-2)}
.row:hover::after,.row:focus-visible::after{transform:scaleX(1)}
.row:hover .c-dek,.row:focus-visible .c-dek,
.rows.open .c-dek{max-height:11rem;opacity:1}

/* --------------------------------------------------------------- subscribe */
.sub-block{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(0,22rem);
  gap:clamp(1.6rem,4vw,3.5rem);align-items:start;
  padding:clamp(2rem,4.5vw,3.2rem) 0;
  border-top:1px solid var(--rule-2);border-bottom:1px solid var(--rule-2);
  margin-bottom:clamp(3rem,6vw,4.5rem);
}
.sub-block h2{margin:.7rem 0 0;font-size:clamp(1.35rem,2.8vw,1.9rem);font-weight:600;
  letter-spacing:-.026em;line-height:1.12;max-width:18ch}
.sub-block p{margin:.8rem 0 0;color:var(--ink-2);font-size:.9375rem;max-width:48ch;line-height:1.6}
.field{display:block}
.field + .field{margin-top:.9rem}
.field span.lbl{display:block;margin-bottom:.4rem}
input,textarea{
  width:100%%;font-family:var(--mono);font-size:.875rem;color:var(--ink);
  background:var(--ground-2);border:1px solid var(--rule-2);border-radius:0;
  padding:.7rem .8rem;transition:border-color .18s;
}
textarea{font-family:var(--sans);font-size:.9375rem;line-height:1.55;min-height:8rem;resize:vertical}
input::placeholder,textarea::placeholder{color:var(--ink-3)}
input:hover,textarea:hover{border-color:var(--ink-3)}
input:focus,textarea:focus{border-color:var(--accent-lit);outline-offset:1px}
input[aria-invalid="true"],textarea[aria-invalid="true"]{border-color:var(--accent-lit)}
.btn{
  font-family:var(--mono);font-size:.75rem;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ground);background:var(--ink);
  border:1px solid var(--ink);border-radius:0;padding:.75rem 1.3rem;cursor:pointer;
  transition:background .18s,color .18s,border-color .18s;
}
.btn:hover{background:var(--accent-lit);border-color:var(--accent-lit);color:#12060a}
.err{
  display:block;min-height:1.1rem;margin-top:.35rem;font-family:var(--mono);
  font-size:.6875rem;letter-spacing:.06em;color:var(--accent-lit);
}
.said{
  margin-top:1rem;padding:.75rem .9rem;border:1px solid var(--rule-2);
  border-left:2px solid var(--accent-mark);background:var(--ground-2);
  font-family:var(--mono);font-size:.75rem;line-height:1.6;color:var(--ink-2);
}
.said:empty{display:none}
.fine{margin-top:.85rem;font-family:var(--mono);font-size:.6875rem;color:var(--ink-3);line-height:1.6}

/* ------------------------------------------------------------------ footer */
.foot{border-top:1px solid var(--rule);padding:clamp(2.2rem,4.5vw,3.2rem) 0 2.4rem}
.foot-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr);
  gap:2rem clamp(1.6rem,4vw,3.5rem)}
.foot .fname{font-size:1.05rem;font-weight:600;letter-spacing:-.02em;margin:0}
.foot p{margin:.7rem 0 0;color:var(--ink-3);font-size:.875rem;line-height:1.6;max-width:44ch}
.foot ul{list-style:none;margin:.9rem 0 0;padding:0;display:grid;gap:.5rem}
.foot ul a{font-family:var(--mono);font-size:.75rem;letter-spacing:.08em;color:var(--ink-2);
  text-decoration:none;border-bottom:1px solid transparent;transition:color .18s,border-color .18s}
.foot ul a:hover{color:var(--accent-lit);border-color:var(--accent-mark)}
.colophon{
  display:flex;flex-wrap:wrap;gap:.6rem 1.5rem;justify-content:space-between;align-items:baseline;
  margin-top:clamp(2rem,4vw,3rem);padding-top:1rem;border-top:1px solid var(--rule);
  font-family:var(--mono);font-size:.6875rem;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ink-3);
}
.colophon a{color:var(--ink-3);text-decoration:none;border-bottom:1px solid var(--rule-2)}
.colophon a:hover{color:var(--ink)}

/* ================================================================ post page */
.progress-top{
  position:fixed;top:0;left:0;height:2px;width:0;background:var(--accent-lit);
  z-index:40;display:none;
}
/* The dispatch page is a document, not a full-bleed page: its frame is exactly
   rail + gutter + measure, so masthead, rail, title, body and end matter all
   resolve to one composition with no leftover right third. */
body.doc{--maxw:calc(var(--rail) + var(--railgap) + var(--measure) + var(--pad) * 2)}
.post-head{grid-area:head;padding:clamp(2.4rem,5.5vw,4rem) 0 clamp(1.6rem,3vw,2.2rem)}
.crumb{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;align-items:baseline;margin-bottom:1.4rem}
.crumb a{font-family:var(--mono);font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-3);text-decoration:none}
.crumb a:hover{color:var(--accent-lit)}
.post-head h1{
  margin:0;font-size:clamp(2.05rem,5.6vw,3.7rem);font-weight:600;
  letter-spacing:-.035em;line-height:1.02;text-wrap:balance;
}
.post-head .sub{margin:clamp(1rem,2vw,1.4rem) 0 0;max-width:54ch;color:var(--ink-2);
  font-size:clamp(1.05rem,1.6vw,1.25rem);line-height:1.46;letter-spacing:-.008em}
.byline{
  display:flex;flex-wrap:wrap;gap:.45rem 1.4rem;margin-top:clamp(1.5rem,3vw,2.2rem);
  padding-top:.9rem;border-top:1px solid var(--rule);
  font-family:var(--mono);font-size:.75rem;color:var(--ink-3);
}
.byline .who{color:var(--ink)}

/* Title, deck, byline, body and end matter share column 2 — one left axis for
   every word on the page. The rail hangs in the outer column beside them. */
.post-wrap{
  display:grid;grid-template-columns:var(--rail) minmax(0,1fr);
  grid-template-areas:". head" "rail read";
  column-gap:var(--railgap);padding-bottom:clamp(3rem,6vw,4.5rem);
}
.read-col{grid-area:read;min-width:0}
.rail{grid-area:rail;position:sticky;top:2rem;align-self:start}
.rail h2{margin:0 0 .9rem;font-family:var(--mono);font-size:.625rem;font-weight:500;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3)}
.rail ol{list-style:none;margin:0;padding:0;counter-reset:toc}
.rail li{counter-increment:toc}
.rail a{
  display:grid;grid-template-columns:1.9rem minmax(0,1fr);gap:.2rem;
  padding:.5rem 0 .5rem .7rem;border-left:1px solid var(--rule-2);
  font-family:var(--mono);font-size:.6875rem;line-height:1.45;letter-spacing:.02em;
  color:var(--ink-3);text-decoration:none;transition:color .18s,border-color .18s;
}
.rail a::before{content:"0" counter(toc);color:var(--ink-3);transition:color .18s}
.rail a:hover{color:var(--ink)}
.rail a[aria-current="true"]{color:var(--ink);border-left-color:var(--accent-mark)}
.rail a[aria-current="true"]::before{color:var(--accent-lit)}
.rail .meter{margin-top:1.4rem;padding-top:1rem;border-top:1px solid var(--rule)}
.rail .track{height:3.5rem;width:2px;background:var(--rule-2);position:relative}
.rail .fill{position:absolute;top:0;left:0;width:2px;height:0;background:var(--accent-mark)}
.rail .pct{margin-top:.6rem;font-family:var(--mono);font-size:.625rem;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink-3)}

/* The reading voice is a humanist text face, deliberately not the grotesque the
   headlines are set in, and the dispatch opens on a lede a step above the body
   so 2,000 words do not arrive at a single pitch. */
.body{max-width:var(--measure);font-family:var(--read);font-size:1.1875rem;
  line-height:1.72;color:var(--ink);letter-spacing:0;counter-reset:sec}
.body p{margin:0 0 1.45em}
.body > p:first-child{
  font-size:1.375rem;line-height:1.52;letter-spacing:-.01em;color:var(--ink-hi);
  margin-bottom:1.55em;
}
/* Section starts are a different rank from the bolded run-in sentences inside
   paragraphs: a rule across the measure, a numbered mono marker in the accent,
   and a heading well clear of body size. */
.body h2{
  counter-increment:sec;font-family:var(--sans);
  margin:2.9em 0 .85em;padding-top:1.5em;border-top:1px solid var(--rule);
  font-size:clamp(1.55rem,3vw,2rem);font-weight:600;
  letter-spacing:-.03em;line-height:1.14;scroll-margin-top:5rem;color:var(--ink-hi);
}
.body h2::before{
  content:"\\00a7 " counter(sec,decimal-leading-zero);display:block;
  font-family:var(--mono);font-size:.6875rem;font-weight:700;letter-spacing:.18em;
  color:var(--accent-lit);margin-bottom:.75rem;
}
.body > h2:first-child{margin-top:0;padding-top:0;border-top:0}
.body a{color:var(--ink);text-decoration:none;
  background-image:linear-gradient(var(--accent-mark),var(--accent-mark));
  background-repeat:no-repeat;background-size:100%% 1px;background-position:0 100%%;
  padding-bottom:.06em;transition:color .18s,background-size .18s}
.body a:hover{color:var(--accent-lit);background-size:100%% 2px}
/* Run-in leads stay a paragraph-level signal: weight only, no extra brightness,
   so they never compete with a section start. */
.body strong{font-weight:600;color:var(--ink)}
.body em{font-style:italic}
.body code{
  font-family:var(--mono);font-size:.86em;background:var(--ground-3);
  border:1px solid var(--rule);padding:.08em .38em;color:var(--ink);
}
.pull{
  margin:2.8em 0;padding:0 0 0 clamp(1rem,2vw,1.6rem);border-left:2px solid var(--accent-mark);
}
.pull p{margin:0;font-family:var(--sans);font-size:clamp(1.3rem,2.6vw,1.7rem);
  font-weight:500;line-height:1.24;letter-spacing:-.028em;color:var(--ink-hi)}
.pull .lbl{display:block;margin-top:.9rem}

/* Every end-matter block shares the article's right edge — tags, sources,
   responses and related all stop on the same line. */
.after{max-width:var(--measure);margin-top:clamp(3rem,6vw,4.5rem)}
.sec-head{
  display:flex;flex-wrap:wrap;gap:.4rem 1rem;align-items:baseline;justify-content:space-between;
  padding-bottom:.65rem;border-bottom:1px solid var(--rule-2);margin-bottom:1.4rem;
}
.sec-head h2{margin:0;font-family:var(--mono);font-size:.75rem;font-weight:700;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ink)}
.sec-head .count{font-family:var(--mono);font-size:.6875rem;letter-spacing:.1em;color:var(--ink-3)}
/* Ruled lists hang straight off the section rule, exactly like the index. */
.sec-head.tight{margin-bottom:0}

/* Tags are mono words on the section hairline, not pills — this design has no
   other rounded or boxed container. */
.tags{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.45rem 1.6rem}
.tags a{
  display:inline-block;font-family:var(--mono);font-size:.75rem;letter-spacing:.06em;
  color:var(--ink-2);text-decoration:none;padding-bottom:.15rem;
  border-bottom:1px solid transparent;transition:color .18s,border-color .18s;
}
.tags a:hover{color:var(--accent-lit);border-bottom-color:var(--accent-mark)}

.cites{list-style:none;margin:0;padding:0}
.cites li{padding:.6rem 0;border-bottom:1px solid var(--rule);
  display:grid;grid-template-columns:2.1rem minmax(0,1fr) auto;column-gap:1rem;align-items:baseline}
.cites .n{font-family:var(--mono);font-size:.6875rem;color:var(--ink-3)}
.cites a{font-size:.9375rem;line-height:1.5;color:var(--ink-2);text-decoration:none;
  border-bottom:1px solid transparent;transition:color .18s,border-color .18s}
.cites a:hover{color:var(--accent-lit);border-bottom-color:var(--accent-mark)}
.cites .dom{font-family:var(--mono);font-size:.625rem;letter-spacing:.07em;
  color:var(--ink-3);text-align:right;overflow-wrap:anywhere}

.thread{list-style:none;margin:0;padding:0}
.thread li{padding:1.2rem 0;border-bottom:1px solid var(--rule)}
.thread .hd{display:flex;flex-wrap:wrap;gap:.2rem .9rem;align-items:baseline}
.thread .nm{font-size:.9375rem;font-weight:600;letter-spacing:-.01em}
.thread .dt{font-family:var(--mono);font-size:.6875rem;color:var(--ink-3)}
.thread p{margin:.45rem 0 0;font-family:var(--read);font-size:.9375rem;line-height:1.62;
  color:var(--ink-2);max-width:60ch}

form.reply{margin-top:1.8rem}
.two{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.reply .actions{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin-top:1rem}

/* Related dispatches are index rows, carrying their real index numbers — no
   thumbnails, so the log reads the same wherever it appears. */
.rel a{
  position:relative;display:grid;grid-template-columns:3.4rem minmax(0,1fr) auto;
  column-gap:1.2rem;align-items:baseline;padding:.9rem 0;
  border-bottom:1px solid var(--rule);text-decoration:none;color:inherit;
}
.rel a::after{
  content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;
  background:var(--accent-mark);transform:scaleX(0);transform-origin:left center;
  transition:transform .45s cubic-bezier(.22,.7,.25,1);
}
.rel a:hover::after,.rel a:focus-visible::after{transform:scaleX(1)}
.rel .n{font-family:var(--mono);font-size:.8125rem;font-weight:700;letter-spacing:.04em;
  color:var(--accent-lit);white-space:nowrap}
.rel .t{font-size:1rem;font-weight:500;line-height:1.35;letter-spacing:-.014em;transition:color .18s}
.rel a:hover .t,.rel a:focus-visible .t{color:#fff}
.rel .m{font-family:var(--mono);font-size:.6875rem;letter-spacing:.08em;
  color:var(--ink-3);white-space:nowrap;text-align:right;transition:color .18s}
.rel a:hover .m,.rel a:focus-visible .m{color:var(--ink-2)}

/* ------------------------------------------------------------ responsive */
@media (max-width:1080px){
  /* Below the two-column frame the document narrows to the measure itself and
     the rail folds into a band above the text — still one left axis. */
  body.doc{--maxw:calc(var(--measure) + var(--pad) * 2)}
  .post-wrap{grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "rail" "read";
    row-gap:2rem}
  .post-head{padding-bottom:0}
  .rail{position:static;border:1px solid var(--rule-2);padding:1rem 1.1rem}
  .rail ol{display:flex;flex-wrap:wrap;gap:.15rem 1.5rem}
  .rail a{border-left:0;border-bottom:1px solid transparent;padding:.35rem 0;
    grid-template-columns:1.7rem minmax(0,1fr)}
  .rail a[aria-current="true"]{border-left:0;border-bottom-color:var(--accent-mark)}
  .rail .meter{display:none}
  .progress-top{display:block}
}
@media (max-width:900px){
  .lead-grid{grid-template-columns:minmax(0,1fr)}
  /* Narrow: the strip becomes the stacked readout it always was underneath. */
  .readout{border-bottom:0}
  .readout dl{grid-auto-flow:row;grid-template-rows:none;
    grid-template-columns:5.5rem minmax(0,1fr)}
  .readout dt{padding:.6rem 0;border-bottom:1px solid var(--rule)}
  .readout dd{padding:.6rem 0;border-bottom:1px solid var(--rule)}
  .readout dl > *:nth-child(n+3){border-left:0;padding-left:0}
  .sub-block{grid-template-columns:minmax(0,1fr)}
  .foot-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .foot .about{grid-column:1 / -1}
}
@media (max-width:760px){
  .idx-head{display:none}
  /* Two lines per entry: number and title, then one metadata line. The number
     keeps only the width it needs so the title gets the rest. */
  .cols{--g:2.15rem minmax(0,1fr)}
  .row{
    grid-template-columns:var(--g);
    grid-template-areas:"num title" "meta meta" "dek dek";
    column-gap:.75rem;row-gap:.12rem;padding:.85rem 0;
  }
  .c-num{padding-top:.12rem;font-size:.75rem}
  .c-title{font-size:1rem;padding-top:0}
  .c-meta{
    grid-area:meta;display:flex;flex-wrap:wrap;align-items:baseline;
    gap:0 .55rem;margin-top:.35rem;padding-left:calc(2.15rem + .75rem);
  }
  .c-date,.c-read,.c-sec{padding-top:0;margin-top:0;text-align:left}
  .c-meta > span + span::before{content:"·";margin-right:.55rem;color:var(--rule-2)}
  .c-date,.c-read{font-size:.6875rem}
  .d-long{display:none}
  .d-short{display:inline}
  .c-dek span{padding-left:calc(2.15rem + .75rem)}
  .rel a{
    grid-template-columns:2.4rem minmax(0,1fr);
    grid-template-areas:"n t" ". m";column-gap:.75rem;row-gap:.3rem;
  }
  .rel .n{grid-area:n}
  .rel .t{grid-area:t}
  .rel .m{grid-area:m;text-align:left;white-space:normal}
  .cites li{grid-template-columns:2.1rem minmax(0,1fr);row-gap:.28rem}
  .cites .dom{grid-column:2;text-align:left}
  .two{grid-template-columns:minmax(0,1fr)}
  .mast{align-items:flex-start;flex-direction:column;gap:1rem}
  .nav{margin-left:-.7rem}
  .nav a[aria-current]{border-color:transparent}
}
@media (max-width:560px){
  .body{font-size:1.0625rem;line-height:1.68}
  .body > p:first-child{font-size:1.1875rem;line-height:1.54}
  .body h2{margin-top:2.2em}
}
@media (max-width:520px){
  .foot-grid{grid-template-columns:minmax(0,1fr)}
}

/* Touch / no-hover: rows cannot expand on hover, so the summaries control does
   the work — and the log stays two lines an entry until the reader asks. */
@media (hover:none){
  .row::after{transform:scaleX(1);background:var(--rule-2)}
}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.001ms!important;animation-iteration-count:1!important;
    transition-duration:.001ms!important;scroll-behavior:auto!important;
  }
}

/* On paper the field inverts to ink on white — the tokens do the whole job —
   the index opens every summary, and the live furniture (nav, forms, progress)
   drops out rather than printing as dead ornament. */
@media print{
  :root{
    --ground:#fff;--ground-2:#fff;--ground-3:#fff;
    --ink:#16181c;--ink-hi:#000;--ink-2:#3b3e45;--ink-3:#55585f;
    --rule:#c9ccd2;--rule-2:#9aa0a8;--accent-mark:#6c7078;--accent-lit:#3b3e45;
  }
  body,body.doc{background:#fff;color:#16181c;--maxw:100%%;--measure:100%%}
  .progress-top,.nav,.toggle,.rail .meter,form,.colophon a{display:none}
  .post-wrap{display:block}
  .rail{position:static;border:0;padding:0;margin-bottom:1.5rem}
  .idx-head{position:static}
  .c-dek{max-height:none;opacity:1;overflow:visible}
  .body a{background-image:none;text-decoration:underline}
  .row,.rel a,.cites li,.thread li,.readout{break-inside:avoid}
  .body h2,.sec-head{break-after:avoid}
}
""" % {"accent": S["accent"]}


# ------------------------------------------------------------------- fragments

def head(title, desc, body_class=""):
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<meta name="color-scheme" content="dark">
<style>
%s
</style>
<noscript><style>
/* Without scripting the summaries control cannot do anything, so it goes
   rather than sitting there dead; hover and keyboard focus still open a row. */
.toggle{display:none}
</style></noscript>
</head>
<body%s>""" % (C.esc(title), C.esc(desc), css(),
                (' class="%s"' % body_class) if body_class else "")


def masthead(current, brand="p"):
    def item(label, href):
        cur = ' aria-current="page"' if label == current else ""
        return '<a href="%s"%s>%s</a>' % (href, cur, label)

    return """
<header class="top">
  <div class="wrap">
    <div class="mast">
      <a class="brand" href="index.html">
        <%(h)s class="name">%(name)s</%(h)s>
        <p class="tag">%(tag)s</p>
      </a>
      <nav class="nav" aria-label="Primary">
        %(nav)s
      </nav>
    </div>
    <div class="strip">
      <span><span class="dot" aria-hidden="true"></span>Issue %(issue)s</span>
      <span class="on">%(today)s</span>
      <span>8 dispatches on file</span>
    </div>
  </div>
</header>""" % {
        "h": brand,
        "name": S["name"],
        "tag": S["tagline"],
        "issue": S["issue"].replace("No. ", ""),
        "today": S["today"],
        "nav": "\n        ".join([
            item("Home", "index.html"),
            item("Archive", "index.html#index"),
            item("Subscribe", "index.html#subscribe"),
        ]),
    }


def footer():
    social = "\n      ".join(
        '<li><a href="%s">%s</a></li>' % (u, n) for n, u in S["social"]
    )
    return """
<footer class="foot">
  <div class="wrap">
    <div class="foot-grid">
      <div class="about">
        <p class="fname">%(name)s</p>
        <p>%(desc)s</p>
      </div>
      <div>
        <p class="lbl">Follow</p>
        <ul>
      %(social)s
        </ul>
      </div>
      <div>
        <p class="lbl">Sections</p>
        <ul>
          <li><a href="index.html#index">Full index</a></li>
          <li><a href="index.html#subscribe">Subscribe</a></li>
          <li><a href="post.html">Latest dispatch</a></li>
        </ul>
      </div>
    </div>
    <div class="colophon">
      <span>Powered by Hot Metal</span>
      <span>&copy; 2026 %(author)s</span>
      <a href="../index.html">&larr; All concepts</a>
    </div>
  </div>
</footer>
</body>
</html>"""  % {
        "name": S["name"],
        "desc": S["short_description"],
        "author": S["author"],
        "social": social,
    }


FORM_JS = """
<script>
(function () {
  'use strict';
  function isMail(v) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v); }

  function wire(form, rules, message) {
    if (!form) return;
    var out = form.querySelector('[data-said]');
    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = null;
      for (var i = 0; i < rules.length; i++) {
        var f = form.querySelector('[name="' + rules[i].name + '"]');
        var slot = form.querySelector('[data-err="' + rules[i].name + '"]');
        var ok = rules[i].test(f.value.trim());
        f.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (slot) slot.textContent = ok ? '' : rules[i].msg;
        if (!ok && !bad) bad = f;
      }
      if (bad) { if (out) out.textContent = ''; bad.focus(); return; }
      form.reset();
      for (var j = 0; j < rules.length; j++) {
        var g = form.querySelector('[name="' + rules[j].name + '"]');
        g.setAttribute('aria-invalid', 'false');
      }
      if (out) out.textContent = message;
    });
    form.addEventListener('input', function (e) {
      var slot = form.querySelector('[data-err="' + e.target.name + '"]');
      if (slot && slot.textContent) { slot.textContent = ''; e.target.setAttribute('aria-invalid', 'false'); }
    });
  }

  wire(document.getElementById('subscribe-form'), [
    { name: 'email', test: isMail, msg: 'Enter a valid email address.' }
  ], 'Demo only \\u2014 nothing was sent. This prototype has no network connection.');

  wire(document.getElementById('comment-form'), [
    { name: 'name', test: function (v) { return v.length >= 2; }, msg: 'Tell us who you are.' },
    { name: 'email', test: isMail, msg: 'Enter a valid email address.' },
    { name: 'comment', test: function (v) { return v.length >= 4; }, msg: 'Your comment is empty.' }
  ], 'Demo only \\u2014 nothing was sent. Your comment stayed in this browser.');
})();
</script>
"""


# ------------------------------------------------------------------------ home

def home():
    lead = POSTS[0]
    rows = []
    for i, p in enumerate(POSTS):
        rows.append("""      <a class="row" href="post.html">
        <span class="c-num">%(n)03d</span>
        <span class="c-title">%(title)s</span>
        <span class="c-meta">
          <span class="c-date"><time datetime="%(iso)s"><span class="d-long">%(date)s</span><span class="d-short">%(short)s</span></time></span>
          <span class="c-sec">%(kick)s</span>
          <span class="c-read">%(read)s</span>
        </span>
        <span class="c-dek"><span>%(dek)s</span></span>
      </a>""" % {
            "n": i + 1, "iso": p["iso"], "date": p["date"], "short": p["short"],
            "title": p["title"],
            "kick": p["kicker"], "read": p["read"], "dek": p["dek"],
        })

    html = head(
        "%s — %s" % (S["name"], S["tagline"]),
        S["short_description"],
    )
    html += masthead("Home", brand="h1")
    html += """
<main id="main">
  <section class="lead wrap" aria-labelledby="lead-title">
    <div class="lead-kick">
      <span class="n">001 / Lead dispatch</span>
      <span class="lbl">%(kick)s</span>
      <span class="lbl">Filed %(date)s</span>
      <span class="lbl">No image on file</span>
    </div>
    <h2 id="lead-title"><a href="post.html">%(title)s</a></h2>
    <div class="lead-grid">
      <div>
        <p class="sub">%(sub)s</p>
        <a class="go" href="post.html">Read dispatch 001 <span class="arw" aria-hidden="true">&rarr;</span></a>
      </div>
      <p class="hook">%(hook)s</p>
    </div>
    <div class="readout">
      <dl>
        <dt>Length</dt><dd>%(words)s words &middot; %(read)s</dd>
        <dt>Sources</dt><dd>%(cites)d cited</dd>
        <dt>Tags</dt><dd>%(tags)s</dd>
        <dt>Author</dt><dd>%(author)s</dd>
      </dl>
    </div>
  </section>

  <section class="idx wrap" id="index" aria-labelledby="index-title">
    <div class="idx-bar">
      <h2 id="index-title">The index</h2>
      <button class="toggle" type="button" id="expand" aria-pressed="false" aria-controls="rows">Show summaries</button>
    </div>
    <div class="cols">
      <div class="idx-head" aria-hidden="true">
        <span>&#8470;</span><span>Date</span><span>Dispatch</span><span>Section</span><span class="r">Read</span>
      </div>
      <div class="rows" id="rows">
%(rows)s
      </div>
    </div>
  </section>

  <section class="wrap" id="subscribe" aria-labelledby="sub-title">
    <div class="sub-block">
      <div>
        <p class="lbl">Signal / subscribe</p>
        <h2 id="sub-title">Every dispatch, the morning it is filed.</h2>
        <p class="fine">Also available over <a href="#" style="color:var(--ink-2)">RSS</a> and on <a href="#" style="color:var(--ink-2)">X</a>.</p>
      </div>
      <form method="dialog" id="subscribe-form">
        <label class="field">
          <span class="lbl">Email address</span>
          <input type="email" name="email" placeholder="you@domain.com" autocomplete="email"
                 aria-describedby="sub-err">
        </label>
        <span class="err" data-err="email" id="sub-err" role="alert"></span>
        <button class="btn" type="submit">Subscribe</button>
        <p class="said" data-said role="status"></p>
      </form>
    </div>
  </section>
</main>""" % {
        "kick": lead["kicker"], "date": lead["date"], "title": lead["title"],
        "sub": A["subtitle"], "hook": A["hook"], "read": lead["read"],
        "words": "{:,}".format(A["words"]), "cites": len(C.CITATIONS),
        "tags": ", ".join(lead["tags"]), "author": S["author"],
        "rows": "\n".join(rows),
    }
    html += footer().replace("</body>", INDEX_JS + FORM_JS + "</body>")
    return html


INDEX_JS = """
<script>
(function () {
  'use strict';
  var btn = document.getElementById('expand');
  var rows = document.getElementById('rows');
  if (!btn || !rows) return;
  btn.addEventListener('click', function () {
    var on = rows.classList.toggle('open');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Hide summaries' : 'Show summaries';
  });
})();
</script>
"""


# ------------------------------------------------------------------------ post

def post():
    body = common.body_with_ids(A["body"], A["sections"])
    pull = """
<aside class="pull">
  <p>&ldquo;%s&rdquo;</p>
  <span class="lbl">From &sect;02 &mdash; Start with the API</span>
</aside>
""" % PULLQUOTE
    marker = '<h2 id="frontend-too">'
    body = body.replace(marker, pull + marker, 1)

    toc = "\n".join(
        '        <li><a href="#%s" data-toc="%s">%s</a></li>' % (sid, sid, label)
        for sid, label in A["sections"]
    )

    cites = "\n".join(
        '      <li><span class="n">%02d</span>'
        '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>'
        '<span class="dom">%s</span></li>' % (i + 1, url, title, dom)
        for i, (title, dom, url) in enumerate(C.CITATIONS)
    )

    tags = "\n".join('      <li><a href="index.html#index">%s</a></li>' % t for t in A["tags"])

    thread = "\n".join("""    <li>
      <div class="hd"><span class="nm">%s</span><span class="dt">%s</span></div>
      <p>%s</p>
    </li>""" % (n, d, t) for n, d, t in C.COMMENTS)

    rel = "\n".join("""    <a href="post.html">
      <span class="n">%(num)03d</span>
      <span class="t">%(title)s</span>
      <span class="m">%(date)s &middot; %(read)s</span>
    </a>""" % dict(p, num=POSTS.index(p) + 1) for p in RELATED)

    html = head("%s — %s" % (A["title"], S["name"]), A["subtitle"], body_class="doc")
    html += '\n<div class="progress-top" id="ptop" aria-hidden="true"></div>'
    html += masthead(None)
    html += """
<main id="main">
  <div class="wrap post-wrap">
    <header class="post-head">
      <div class="crumb">
        <span class="n">Dispatch 001</span>
        <a href="index.html">&larr; Back to the index</a>
        <span class="lbl">%(kick)s</span>
      </div>
      <h1>%(title)s</h1>
      <p class="sub">%(sub)s</p>
      <div class="byline">
        <span class="who">%(author)s</span>
        <span><time datetime="%(iso)s">%(date)s</time></span>
        <span>%(read)s read</span>
        <span>%(words)s words</span>
        <span>%(ncite)d sources</span>
      </div>
    </header>

    <nav class="rail" id="rail" aria-label="Sections of this dispatch">
        <h2>In this dispatch</h2>
        <ol>
%(toc)s
        </ol>
        <div class="meter">
          <div class="track" aria-hidden="true"><div class="fill" id="fill"></div></div>
          <p class="pct" id="pct">Read <span>&mdash;</span></p>
        </div>
      </nav>

      <div class="read-col">
        <article class="body">
%(body)s
        </article>

        <section class="after" aria-labelledby="tags-title">
          <div class="sec-head"><h2 id="tags-title">Tags</h2><span class="count">%(ntag)d</span></div>
          <ul class="tags">
%(tags)s
          </ul>
        </section>

        <section class="after" aria-labelledby="src-title">
          <div class="sec-head tight"><h2 id="src-title">Sources</h2><span class="count">%(ncite)d cited</span></div>
          <ol class="cites">
%(cites)s
          </ol>
        </section>

        <section class="after" aria-labelledby="cmt-title">
          <div class="sec-head tight"><h2 id="cmt-title">Responses</h2><span class="count">%(ncmt)d</span></div>
          <ul class="thread">
%(thread)s
          </ul>

          <form method="dialog" class="reply" id="comment-form">
            <p class="lbl" style="margin:0 0 .9rem">Add a response</p>
            <div class="two">
              <div>
                <label class="field">
                  <span class="lbl">Name</span>
                  <input type="text" name="name" autocomplete="name" placeholder="Your name" aria-describedby="e-name">
                </label>
                <span class="err" data-err="name" id="e-name" role="alert"></span>
              </div>
              <div>
                <label class="field">
                  <span class="lbl">Email <span style="text-transform:none;letter-spacing:0">(not published)</span></span>
                  <input type="email" name="email" autocomplete="email" placeholder="you@domain.com" aria-describedby="e-email">
                </label>
                <span class="err" data-err="email" id="e-email" role="alert"></span>
              </div>
            </div>
            <label class="field">
              <span class="lbl">Response</span>
              <textarea name="comment" placeholder="Keep it useful." aria-describedby="e-comment"></textarea>
            </label>
            <span class="err" data-err="comment" id="e-comment" role="alert"></span>
            <div class="actions">
              <button class="btn" type="submit">Post response</button>
              <span class="fine" style="margin:0">Prototype &mdash; submissions are handled locally.</span>
            </div>
            <p class="said" data-said role="status"></p>
          </form>
        </section>

        <section class="after" aria-labelledby="rel-title">
          <div class="sec-head tight"><h2 id="rel-title">Related dispatches</h2><span class="count">03</span></div>
          <div class="rel">
%(rel)s
          </div>
        </section>
      </div>
  </div>
</main>""" % {
        "kick": A["kicker"], "title": A["title"], "sub": A["subtitle"],
        "author": S["author"], "iso": A["iso"], "date": A["date"], "read": A["read"],
        "words": "{:,}".format(A["words"]), "ncite": len(C.CITATIONS),
        "toc": toc, "body": body, "tags": tags, "ntag": len(A["tags"]),
        "cites": cites, "thread": thread, "ncmt": len(C.COMMENTS), "rel": rel,
    }
    html += footer().replace("</body>", POST_JS + FORM_JS + "</body>")
    return html


POST_JS = """
<script>
(function () {
  'use strict';
  var article = document.querySelector('.body');
  var links = Array.prototype.slice.call(document.querySelectorAll('[data-toc]'));
  var heads = links.map(function (a) { return document.getElementById(a.getAttribute('data-toc')); });
  if (!article || !links.length) return;

  function setActive(id) {
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('aria-current', links[i].getAttribute('data-toc') === id ? 'true' : 'false');
    }
  }
  setActive(links[0].getAttribute('data-toc'));

  // The deepest heading that has crossed the reading line is the active one.
  function pick() {
    var line = window.innerHeight * 0.32;
    var idx = 0;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i] && heads[i].getBoundingClientRect().top <= line) idx = i;
    }
    setActive(links[idx].getAttribute('data-toc'));
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(pick, { rootMargin: '-72px 0px -55% 0px', threshold: [0, 1] });
    for (var k = 0; k < heads.length; k++) { if (heads[k]) io.observe(heads[k]); }
  }

  var fill = document.getElementById('fill');
  var pct = document.getElementById('pct');
  var top = document.getElementById('ptop');
  var ticking = false;
  function measure() {
    ticking = false;
    var box = article.getBoundingClientRect();
    var travelled = -box.top + window.innerHeight * 0.42;
    var p = Math.max(0, Math.min(1, travelled / Math.max(1, box.height)));
    var n = Math.round(p * 100);
    if (fill) fill.style.height = n + '%';
    if (pct) pct.innerHTML = 'Read <span>' + n + '%</span>';
    if (top) top.style.width = n + '%';
    pick();
  }
  function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(measure); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  measure();
})();
</script>
"""


def build():
    common.prepare(OUT, FONTS, IMAGES)
    # This concept ships no imagery at all: the lead states NO IMAGE ON FILE and
    # the log carries no thumbnails, so an empty img/ directory would be a lie.
    img_dir = os.path.join(OUT, "img")
    if os.path.isdir(img_dir) and not os.listdir(img_dir):
        os.rmdir(img_dir)
    # prepare() copies every face of every family; keep only the ones emitted.
    keep = faces()[1]
    fonts_dir = os.path.join(OUT, "fonts")
    for name in os.listdir(fonts_dir):
        if name not in keep:
            os.remove(os.path.join(fonts_dir, name))
    common.write(OUT, "index.html", home())
    common.write(OUT, "post.html", post())
    return OUT


if __name__ == "__main__":
    print(build())
