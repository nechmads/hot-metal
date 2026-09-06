"""Direction 3 — Atrium.

A gallery catalogue. One idea per screen, enormous air, and the square image
finally treated *as a square*: a plate mounted in a paper mat behind a hairline
frame, with a great deal of surrounding silence. On the article page the plates
are typographic — the standfirst and the pull quote are hung between hairlines
the same way a picture would be, in one treatment rather than two.

The catalogue is a single list system. Every entry is the same object: a folio
number in the rail, one metadata line, a left-aligned headline at full weight,
and a note. Some works also hang a plate beneath their own headline; a picture
never stands in for a title, so eight works read as eight comparable works,
some illustrated.

The page frame is the field itself — folio rail plus reading measure, nothing
else — so the single column sits at optical centre with symmetric paper on
either side, rather than a wide frame with a live left half and a dead right
half. The essay is navigated by a contents list set in the reading voice at its
head; the rail keeps a running numeral that advances with it.

Type: Newsreader for everything that is read; Inter only for tiny uppercase
letterspaced metadata. Warm paper ground, deep ink, accent restricted to
folio numbers, hairline marks and link underlines so an arbitrary
per-publication hex still looks right.
"""

import os

import common
import content as C

E = C.esc
SITE = C.SITE
POSTS = C.POSTS
ART = C.ARTICLE

OUT = os.path.join(common.RUN, "03-atrium")

FONTS = ["newsreader", "inter"]

# Catalogue entries that are carried by a plate instead of a text row.
# POSTS index -> plate numeral. The catalogue number stays index + 1, so the
# sequence still reads 02…08 with plates falling at 02, 04 and 06.
PLATED = {1: "I", 3: "II", 5: "III"}

# Three further catalogue entries listed at the foot of the article.
RELATED = [2, 4, 6]

# Section numerals for the essay's contents list and its running rail marker.
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]

IMAGES = sorted({POSTS[i]["img"] for i in PLATED})


# --------------------------------------------------------------------------- css

CSS = r"""
:root{
  --paper:#faf7f2;
  --paper-sunk:#f4f0e8;
  --ink:#1b1714;
  --ink-2:#463f38;
  --ink-3:#6d6459;
  --rule:rgba(27,23,20,.14);
  --rule-firm:rgba(27,23,20,.30);
  --accent:%ACCENT%;
  /* Every mark the accent paints — numerals, hairlines, underlines — is pulled
     46% toward the ink. That is what it takes for the worst realistic accent
     (#ffd400: 1.34:1 raw) to clear 4.5:1 on this paper, and it also means the
     folio numeral and the rule beside it are finally the same red. */
  --accent-ink:color-mix(in srgb,var(--accent) 46%,var(--ink));
  --rail:7.5rem;
  --measure:34rem;
  --gutter:clamp(1.25rem,5vw,4rem);
  /* The page frame IS the field: folio rail + reading measure, nothing else.
     Deriving the sheet from them means the single column always sits at optical
     centre and the paper on either side is symmetric at every width — rather
     than a wide frame with a live left half and a dead right half. */
  --sheet:calc(var(--rail) + var(--measure) + 2 * var(--gutter));
}

*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
/* `clip` rather than `hidden`, and on the root only: `overflow-x:hidden` on the
   body turns it into a scroll container, which silently disables the sticky
   running numeral in the essay's rail. */
html{overflow-x:clip}
html,body{max-width:100%}

body{
  margin:0;
  background:var(--paper);
  color:var(--ink);
  font-family:'Newsreader',Georgia,'Times New Roman',serif;
  font-optical-sizing:auto;
  font-size:1.0625rem;
  line-height:1.64;
  font-synthesis-weight:none;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}

img{max-width:100%;height:auto;display:block}
a{color:inherit}
h1,h2,h3,h4{font-weight:400;margin:0;letter-spacing:-.022em;line-height:1.08}
p{margin:0}
ul,ol{margin:0;padding:0}

:focus-visible{outline:2px solid var(--ink);outline-offset:4px;border-radius:1px}
.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}

.skip{position:absolute;left:-9999px;top:0;background:var(--ink);color:var(--paper);
  padding:.7rem 1.1rem;z-index:60;font-family:'Inter',system-ui,sans-serif;font-size:.75rem;
  letter-spacing:.1em;text-transform:uppercase}
.skip:focus{left:.5rem;top:.5rem}

.sheet{max-width:var(--sheet);margin:0 auto;padding-inline:var(--gutter)}

/* ---- tiny metadata voice: the ONLY place Inter appears ---- */
.meta,.kicker,.row-kicker,.lead-meta,.nav a,.sect-note,.src-domain,.tag,.btn,.field label,.byline,.foot-nav a,.comment-meta,.contents-h,.cform-head{
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  text-transform:uppercase;
  letter-spacing:.155em;
  font-size:.6875rem;
  font-weight:500;
  font-variant-numeric:tabular-nums;
  line-height:1.5;
}
/* The accent carries numerals, short rules and underlines ONLY — never
   letterspaced label text, which stops being legible the moment a publication
   picks a pale hex. Section eyebrows and every other label stay neutral ink. */
.folio{
  font-family:'Inter',system-ui,sans-serif;font-size:.6875rem;font-weight:600;
  letter-spacing:.14em;font-variant-numeric:tabular-nums;
  color:var(--accent-ink);
}

/* ---- masthead ---- */
.mast{padding-top:1.15rem}
.nav-band{
  display:flex;align-items:baseline;justify-content:space-between;gap:1rem 2rem;flex-wrap:wrap;
  padding-bottom:1.05rem;border-bottom:1px solid var(--rule);
}
.nav{display:flex;gap:1.7rem;flex-wrap:wrap;list-style:none}
.nav a{color:var(--ink-2);text-decoration:none;padding-block:.15rem;display:inline-block}
.nav a:hover{color:var(--ink)}
.nav a[aria-current="page"]{color:var(--ink);box-shadow:inset 0 -1px 0 0 var(--accent-ink)}
.stamp{color:var(--ink-3);display:flex;gap:1.1rem;flex-wrap:wrap}
.stamp b{font-weight:600;color:var(--ink-2)}

.identity{padding:clamp(3rem,8vw,6.5rem) 0 clamp(2.5rem,5vw,4rem)}
.mast-name{
  font-size:clamp(2.5rem,7.4vw,5rem);
  font-weight:400;letter-spacing:-.042em;line-height:.92;
  margin-left:-.045em;
}
.mast-name a{text-decoration:none}
.identity-body{margin-left:var(--rail);margin-top:clamp(1.6rem,3vw,2.4rem);max-width:46ch}
.mast-tag{font-size:clamp(1.15rem,2.1vw,1.5rem);font-style:italic;font-weight:300;color:var(--ink-2);line-height:1.35}
.mast-desc{margin-top:1.15rem;color:var(--ink-3);font-size:1rem;line-height:1.66}

/* compact masthead on the article page */
.mast--compact .identity{padding:clamp(1.9rem,4vw,3rem) 0 0}
.mast--compact .mast-name{font-size:clamp(1.5rem,3vw,2rem);letter-spacing:-.03em}
.mast--compact .identity-body{margin-top:.5rem;margin-left:0}
.mast--compact .mast-tag{font-size:1.0625rem}

/* ---- rail layout: a folio rail beside the reading measure ---- */
.railed{display:grid;grid-template-columns:var(--rail) minmax(0,1fr);gap:0 0}
.railed > .rail{padding-top:.55rem}
.railed > .col{max-width:var(--measure)}
.rail-note{display:block;color:var(--ink-3);margin-top:.55rem;
  font-family:'Inter',system-ui,sans-serif;font-size:.625rem;letter-spacing:.14em;text-transform:uppercase}
.rail-rule{display:block;width:1.6rem;height:1px;background:var(--rule-firm);margin-top:.85rem}

/* ---- lead ---- */
.lead{padding-bottom:clamp(3rem,7vw,5.5rem)}
.kicker{color:var(--ink-2)}
.lead-title{
  font-size:clamp(2.4rem,6.2vw,4.6rem);
  font-weight:400;letter-spacing:-.036em;line-height:1.02;
  margin-top:1.1rem;max-width:15ch;
}
.lead-title a{text-decoration:none;background-image:linear-gradient(var(--accent-ink),var(--accent-ink));
  background-size:0 1px;background-repeat:no-repeat;background-position:0 92%;transition:background-size .4s ease}
.lead-title a:hover{background-size:100% 1px}
.lead-dek{margin-top:1.5rem;font-size:clamp(1.15rem,1.9vw,1.4rem);line-height:1.5;color:var(--ink-2);max-width:44ch}
.lead-meta{margin-top:2rem;color:var(--ink-3);display:flex;gap:.85rem;flex-wrap:wrap;align-items:baseline}
.lead-meta .sep{color:var(--rule-firm)}

/* ---- plates: a square hung on the wall, mounted in a paper mat with a
   hairline frame, so uneven AI art reads as a mounted work rather than a
   banner or a card. The plate supports an entry; it never replaces the
   entry's headline. ---- */
.plate{display:block;width:100%;margin:0 auto}
.plate .mat{
  display:block;padding:clamp(.9rem,2vw,1.4rem);background:var(--paper);
  border:1px solid var(--rule-firm);transition:border-color .3s ease;
}
.plate img{width:100%;aspect-ratio:1/1;object-fit:cover}

/* typographic plates on the article page: one treatment for the standfirst and
   the pull quote alike — hung roman type between two hairlines, no quotation
   marks, no caption. Two devices doing the same job is one device too many. */
.plate--type{width:100%}
.plate--type .plate-body{
  border-top:1px solid var(--rule-firm);border-bottom:1px solid var(--rule-firm);
  padding:2.4rem 0 2.5rem;text-align:center;
}
.plate--type p{font-size:clamp(1.3rem,2.4vw,1.7rem);line-height:1.38;font-weight:300;letter-spacing:-.018em;color:var(--ink)}
.plate--type blockquote{margin:0}

/* ---- section heads ---- */
.sect{display:grid;grid-template-columns:var(--rail) minmax(0,1fr);align-items:baseline;
  padding-bottom:1.05rem;border-bottom:1px solid var(--rule-firm);margin-bottom:.5rem}
.sect-mark{width:1.6rem;height:1px;background:var(--accent-ink);align-self:center}
.sect-inner{display:flex;align-items:baseline;justify-content:space-between;gap:1rem 2rem;flex-wrap:wrap}
.sect-title{font-size:clamp(1.15rem,2vw,1.4rem);font-weight:400;letter-spacing:-.01em}
.sect-note{color:var(--ink-3)}

/* ---- catalogue rows ----
   One list system. Every entry is a headline block: folio in the rail, then a
   single metadata line (section, date, reading time) sitting directly with its
   own headline, then the title at full weight and left-aligned, then the note.
   Some works also carry a plate, hung beneath their own headline as a
   supporting square — the picture is never asked to be the title. */
.rows{list-style:none}
.row{border-bottom:1px solid var(--rule)}
.row-link{
  display:grid;grid-template-columns:var(--rail) minmax(0,1fr);gap:0;
  text-decoration:none;padding:clamp(1.7rem,2.5vw,2.2rem) 0;align-items:start;
}
.row-link:hover .folio{color:var(--ink)}
.row-rail{display:block;padding-top:.15rem}
.row-body{display:block}
.row-kicker{display:block;color:var(--ink-3)}
.row-kicker .sep{color:var(--rule-firm);padding:0 .55rem}
.row-title{margin-top:.75rem;font-size:clamp(1.45rem,2.5vw,2.05rem);font-weight:400;letter-spacing:-.028em;
  line-height:1.1}
.row-link:hover .row-title{box-shadow:inset 0 -1px 0 0 var(--accent-ink)}
.row-dek{display:block;margin-top:1.05rem;color:var(--ink-2);line-height:1.58}
/* the plate squares off exactly on the headline's own column — one left edge
   and one right edge down the whole entry, headline and picture alike */
.row-plate{margin:1.9rem 0 .3rem}
.row-link:hover .mat{border-color:var(--ink)}

/* ---- subscribe: the page's closing plate ---- */
.subscribe{text-align:center;padding:clamp(2.5rem,5vw,3.5rem) 0 clamp(2.75rem,5vw,4rem)}
.subscribe .sheet{border-top:1px solid var(--rule-firm);padding-top:clamp(3rem,6vw,4.5rem)}
.subscribe .mark{width:1.6rem;height:1px;background:var(--accent-ink);margin:0 auto 2rem}
.subscribe h2{font-size:clamp(1.9rem,4vw,3rem);font-weight:400;letter-spacing:-.032em;
  max-width:22ch;margin-inline:auto;text-wrap:balance}
.sub-copy{margin:1.35rem auto 0;max-width:44ch;color:var(--ink-2);font-size:1.0625rem}

input,textarea{
  width:100%;font:inherit;font-size:1rem;color:var(--ink);background:transparent;
  border:0;border-bottom:1px solid var(--rule-firm);padding:.6rem 0;border-radius:0;
}
textarea{resize:vertical;min-height:6.5rem;line-height:1.55}
input::placeholder,textarea::placeholder{color:var(--ink-3);opacity:.75}
input:focus,textarea:focus{outline:0;border-bottom-color:var(--ink)}
input:focus-visible,textarea:focus-visible{outline:2px solid var(--ink);outline-offset:4px}
/* One control system: every field and every button is a word standing on a
   hairline. No boxes anywhere — a bordered chip or a filled bar is the one
   thing this page never draws. */
.btn{
  background:transparent;color:var(--ink);cursor:pointer;border:0;
  border-bottom:1px solid var(--rule-firm);padding:.6rem 0;border-radius:0;
  transition:border-color .2s ease,color .2s ease;
}
.btn:hover{border-bottom-color:var(--ink)}
/* the subscribe field and its button share one continuous rule */
.sub-form{margin:2.5rem auto 0;max-width:26rem;display:flex;align-items:flex-end;gap:0}
.sub-form .field{flex:1 1 auto;min-width:0;text-align:left;margin-bottom:0}
/* the button never wraps below the field: one rule, one row, at every width */
.sub-form .btn{flex:0 0 auto;padding-left:1.2rem;white-space:nowrap}
.sub-note{margin-top:1.5rem;color:var(--ink-3);font-size:.9375rem;font-style:italic;font-weight:300}
.status{margin-top:1.25rem;min-height:1.4rem;font-size:.9375rem;color:var(--ink-2)}
.status[data-tone="ok"]{color:var(--ink)}
.status[data-tone="err"]{color:#8a2417}
.err{display:block;margin-top:.45rem;font-size:.8125rem;color:#8a2417;font-style:italic}

/* ---- footer ---- */
.foot{padding:clamp(2rem,4vw,3rem) 0 3rem}
.foot-grid{display:flex;justify-content:space-between;gap:1.5rem 3rem;flex-wrap:wrap;align-items:baseline;
  border-top:1px solid var(--rule);padding-top:2.1rem}
.foot-nav{display:flex;gap:1.6rem;list-style:none;flex-wrap:wrap}
.foot-nav a{color:var(--ink-2);text-decoration:none}
.foot-nav a:hover{color:var(--ink);box-shadow:inset 0 -1px 0 0 var(--accent-ink)}
.colophon{color:var(--ink-3);font-size:.9375rem;font-style:italic;font-weight:300}
.backlink{margin-top:2.5rem;font-size:.8125rem;color:var(--ink-3);font-family:'Inter',system-ui,sans-serif;letter-spacing:.04em}
.backlink a{color:var(--ink-3);text-decoration:underline;text-underline-offset:3px}
.backlink a:hover{color:var(--ink)}

/* ---- article ---- */
.art-head{padding-block:clamp(3.5rem,9vw,7.5rem) 0}
.art-title{
  font-size:clamp(2.6rem,7.4vw,5.4rem);
  font-weight:400;letter-spacing:-.042em;line-height:1.0;max-width:14ch;
}
.art-sub{margin-top:1.6rem;font-size:clamp(1.2rem,2.2vw,1.6rem);font-style:italic;font-weight:300;
  color:var(--ink-2);line-height:1.4;max-width:38ch}
.byline{margin-top:2.4rem;color:var(--ink-3);display:flex;gap:.85rem;flex-wrap:wrap;align-items:baseline;
  padding-top:1.4rem;border-top:1px solid var(--rule)}
.byline .who{color:var(--ink-2);font-weight:600}
.byline .sep{color:var(--rule-firm)}

/* Two fields, the same two the whole site uses: folio rail and reading
   measure. The contents list is set in the reading voice at the head of the
   essay, and the rail keeps a running numeral that follows the reader down —
   a numeral survives any accent hex; letterspaced small caps do not. */
.artgrid{display:grid;grid-template-columns:var(--rail) minmax(0,1fr)}
.artgrid > .rail{padding-top:.55rem}

.contents{margin-top:2.1rem}
.contents-h{color:var(--ink-3);margin-bottom:1rem}
.contents ol{list-style:none}
.contents li + li{margin-top:.55rem}
.contents a{display:flex;gap:.95rem;align-items:baseline;text-decoration:none;
  color:var(--ink-2);line-height:1.4;transition:color .2s ease}
.contents a:hover{color:var(--ink)}
.contents a:hover .c-title{box-shadow:inset 0 -1px 0 0 var(--accent-ink)}
.c-no{
  flex:0 0 1.5rem;font-family:'Inter',system-ui,sans-serif;font-size:.6875rem;
  font-weight:600;letter-spacing:.1em;font-variant-numeric:tabular-nums;
  color:var(--accent-ink);
}

.runner{position:sticky;top:4.5rem;display:block}
.runner-no{
  display:block;font-size:1.5rem;line-height:1;letter-spacing:-.01em;
  color:var(--accent-ink);
}
.runner-rule{display:block;width:1.6rem;height:1px;background:var(--rule-firm);margin-top:.75rem}

.body{margin-top:clamp(2.5rem,5vw,3.75rem)}
.body > *{max-width:var(--measure)}
.body p{margin:0 0 1.4em}
.body .lede{font-size:1.3125rem;line-height:1.55;color:var(--ink);margin-bottom:0}
.body h2{
  font-size:clamp(1.75rem,3.4vw,2.65rem);font-weight:500;letter-spacing:-.03em;line-height:1.1;
  margin:2.5em 0 .85em;padding-top:1.5rem;border-top:1px solid var(--rule);position:relative;
}
.body h2::after{content:"";position:absolute;top:-1px;left:0;width:2.6rem;height:1px;background:var(--accent-ink)}
.body a{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3.5px;
  text-decoration-color:var(--accent-ink)}
.body a:hover{text-decoration-thickness:2px}
.body strong{font-weight:600}
.body em{font-style:italic}
.body code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em;
  background:var(--paper-sunk);padding:.12em .4em;border:1px solid var(--rule)}
/* a hung type plate spans the measure and centres on it */
.body > .plate{width:100%;margin:clamp(2.75rem,6vw,4.25rem) 0}

/* ---- tags / sources / comments ---- */
/* tags as an interpuncted list in the page's own metadata voice — a bordered
   all-caps rectangle is a chip borrowed from somewhere else */
.tags{display:flex;flex-wrap:wrap;row-gap:.45rem;list-style:none;align-items:baseline}
.tags li + li::before{content:"\00b7";color:var(--rule-firm);padding:0 .7rem;
  font-family:'Inter',system-ui,sans-serif;font-size:.6875rem}
.tag{color:var(--ink-2);text-decoration:none;padding-block:.1rem}
.tag:hover{color:var(--ink);box-shadow:inset 0 -1px 0 0 var(--accent-ink)}

.block{padding-top:clamp(3.5rem,7vw,5.5rem)}
.block-body{margin-left:var(--rail);padding-top:2rem;max-width:var(--measure)}

.sources{list-style:none;counter-reset:src}
.sources li{counter-increment:src;padding-left:3.1rem;text-indent:-3.1rem;margin-bottom:1.05rem;line-height:1.5}
.sources li::before{
  content:counter(src,decimal-leading-zero);display:inline-block;width:3.1rem;text-indent:0;
  font-family:'Inter',system-ui,sans-serif;font-size:.6875rem;font-weight:600;letter-spacing:.1em;
  font-variant-numeric:tabular-nums;color:var(--ink-3);vertical-align:.15em;
}
.sources a{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;
  text-decoration-color:var(--rule-firm)}
.sources a:hover{text-decoration-color:var(--accent-ink)}
.src-domain{display:block;margin-left:0;color:var(--ink-3);margin-top:.2rem;text-indent:0}

.comments{list-style:none}
.comments li{padding:1.9rem 0;border-top:1px solid var(--rule)}
.comments li:first-child{border-top:0;padding-top:.6rem}
.comment-meta{color:var(--ink-3);display:flex;gap:.8rem;flex-wrap:wrap;align-items:baseline}
.comment-meta .who{color:var(--ink-2);font-weight:600}
.comment-meta .sep{color:var(--rule-firm)}
.comment-body{margin-top:.85rem;color:var(--ink-2);line-height:1.6}

/* no rule above the first label: a stray hairline at the head of a form reads
   as an empty input. A named heading does the separating instead. */
.cform{margin-top:3.2rem}
.cform-head{color:var(--ink-3);margin-bottom:1.5rem}
.cform .grid{display:grid;grid-template-columns:1fr 1fr;gap:1.6rem}
.field label{display:block;color:var(--ink-3);margin-bottom:.3rem}
.field{margin-bottom:1.6rem}
.cform .actions{display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap}

/* ---- responsive ---- */
@media (max-width:1080px){
  :root{--rail:5rem}
}
@media (max-width:860px){
  :root{--rail:0rem}
  body{font-size:1.0625rem}
  .identity-body{margin-left:0}
  .railed,.artgrid{display:block}
  .railed > .rail,.artgrid > .rail{display:flex;align-items:baseline;gap:1rem;padding-top:0;margin-bottom:1.5rem}
  .rail-rule{display:none}
  .rail-note{margin-top:0}
  /* the running numeral has no margin to live in on a phone; the contents
     list at the head of the essay carries the whole job */
  .artgrid > .rail{display:none}
  .sect{grid-template-columns:1.6rem minmax(0,1fr);gap:0 1rem}
  .row-link{grid-template-columns:minmax(0,1fr);gap:0;padding:1.8rem 0}
  .row-rail{display:flex;align-items:baseline;gap:1rem;margin-bottom:.95rem;padding-top:0}
  .row-plate{margin-top:1.7rem}
  .block-body{margin-left:0}
  .cform .grid{grid-template-columns:1fr;gap:0}
  .art-title,.art-sub,.lead-title{max-width:none}
}
@media (max-width:420px){
  .nav{gap:1.1rem}
  .stamp{gap:.8rem}
}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important}
}

@media print{
  .runner,.skip,.nav-band,.backlink{display:none}
  .row-link{break-inside:avoid}
}
""".replace("%ACCENT%", SITE["accent"])


JS_FORMS = r"""
(function(){
  var RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function err(field, msg){
    var e = field.querySelector('.err');
    if(!e){ e = document.createElement('span'); e.className='err'; field.appendChild(e); }
    e.textContent = msg || '';
    var ctl = field.querySelector('input,textarea');
    if(ctl) ctl.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }
  function wire(form){
    var status = document.getElementById(form.getAttribute('data-status'));
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      var ok = true, first = null;
      var fields = form.querySelectorAll('.field');
      for(var i=0;i<fields.length;i++){
        var f = fields[i], ctl = f.querySelector('input,textarea');
        if(!ctl) continue;
        var v = ctl.value.trim(), msg = '';
        if(!v){ msg = 'This field is required.'; }
        else if(ctl.type === 'email' && !RE.test(v)){ msg = 'That does not look like an email address.'; }
        if(!err(f, msg)){ ok = false; if(!first) first = ctl; }
      }
      if(!ok){
        status.setAttribute('data-tone','err');
        status.textContent = 'Please check the highlighted fields.';
        if(first) first.focus();
        return;
      }
      status.setAttribute('data-tone','ok');
      status.textContent = form.getAttribute('data-done');
      form.reset();
    });
  }
  var forms = document.querySelectorAll('form[data-status]');
  for(var i=0;i<forms.length;i++) wire(forms[i]);
})();
"""

# The essay's navigation is the contents list at its head — plain anchors set in
# the reading voice, complete and usable with no JS, in print and in an
# unscrolled screenshot. The script only advances the numeral in the rail, which
# tells the reader which of those numbered sections they are standing in.
JS_MARGIN = r"""
(function(){
  var links = document.querySelectorAll('.contents a[data-sec]');
  var runner = document.querySelector('[data-runner]');
  if(!links.length || !runner) return;
  var heads = [];
  for(var i=0;i<links.length;i++){
    var h = document.getElementById(links[i].getAttribute('data-sec'));
    if(h) heads.push([h, links[i]]);
  }
  if(!heads.length) return;
  function mark(){
    var line = window.pageYOffset + window.innerHeight * 0.34;
    var cur = heads[0][1];
    for(var i=0;i<heads.length;i++){
      if(heads[i][0].getBoundingClientRect().top + window.pageYOffset <= line) cur = heads[i][1];
    }
    var no = cur.getAttribute('data-no');
    if(runner.textContent !== no) runner.textContent = no;
  }
  var queued = false;
  function onScroll(){
    if(queued) return;
    queued = true;
    window.requestAnimationFrame(function(){ queued = false; mark(); });
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', onScroll);
  mark();
})();
"""

# --------------------------------------------------------------------------- fragments

def head(title, description, extra_css=""):
    return (
        "<!doctype html>\n"
        '<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="color-scheme" content="light">\n'
        "<title>" + E(title) + "</title>\n"
        '<meta name="description" content="' + E(description) + '">\n'
        "<style>\n" + common.font_css(FONTS) + "\n" + CSS + extra_css + "\n</style>\n"
        "</head>\n"
    )


def nav_band(current):
    items = [("Home", "index.html"), ("Archive", "index.html#catalogue"),
             ("Subscribe", "index.html#subscribe")]
    if current == "home":
        items = [("Home", "#top"), ("Archive", "#catalogue"),
                 ("Subscribe", "#subscribe")]
    li = []
    for label, href in items:
        cur = ' aria-current="page"' if (current == "home" and label == "Home") else ""
        li.append('<li><a href="%s"%s>%s</a></li>' % (href, cur, label))
    return (
        '<div class="nav-band">\n'
        '  <nav aria-label="Primary"><ul class="nav">' + "".join(li) + "</ul></nav>\n"
        '  <p class="stamp"><span><b>' + E(SITE["issue"]) + "</b></span>"
        "<span>" + E(SITE["today"]) + "</span></p>\n"
        "</div>\n"
    )


def masthead(current, compact=False):
    cls = "mast mast--compact" if compact else "mast"
    name = E(SITE["name"])
    inner = '<a href="index.html">' + name + "</a>" if compact else name
    tag = "<h1 class=\"mast-name\">" if not compact else '<p class="mast-name">'
    tag_end = "</h1>" if not compact else "</p>"
    desc = ""
    if not compact:
        desc = '<p class="mast-desc">' + E(SITE["description"]) + "</p>"
    return (
        '<header class="' + cls + '" id="top">\n'
        '<div class="sheet">\n' + nav_band(current) +
        '<div class="identity">\n' + tag + inner + tag_end +
        '<div class="identity-body"><p class="mast-tag">' + E(SITE["tagline"]) + "</p>" + desc + "</div>\n"
        "</div>\n</div>\n</header>\n"
    )


def sect(title, note="", anchor=None, title_id=None):
    a = ' id="%s"' % anchor if anchor else ""
    t = ' id="%s"' % title_id if title_id else ""
    n = '<span class="sect-note">%s</span>' % E(note) if note else ""
    return (
        '<div class="sect"%s>\n'
        '  <span class="sect-mark" aria-hidden="true"></span>\n'
        '  <div class="sect-inner"><h2 class="sect-title"%s>%s</h2>%s</div>\n'
        "</div>\n" % (a, t, E(title), n)
    )


def cat_entry(i, p):
    """One catalogue entry, numbered i+1. Every entry is the same object: a
    folio in the rail and a left-aligned headline block carrying its own
    section, date and reading time. A work that has art hangs its plate beneath
    its own headline as a supporting square — the picture never stands in for
    the title, so eight works read as eight comparable works, some illustrated."""
    n = i + 1
    plate_note, plate = "", ""
    if i in PLATED:
        plate_note = '<span class="rail-note">Plate %s</span>' % PLATED[i]
        plate = (
            '      <span class="plate row-plate"><span class="mat">'
            '<img src="img/%s" width="900" height="900" loading="lazy" '
            'decoding="async" alt=""></span></span>\n' % p["img"]
        )
    return (
        '<li class="row">\n'
        '  <a class="row-link" href="post.html">\n'
        '    <span class="row-rail"><span class="folio">%02d</span>%s</span>\n'
        '    <span class="row-body">\n'
        '      <span class="row-kicker">%s<span class="sep">&middot;</span>'
        '<time datetime="%s">%s</time><span class="sep">&middot;</span>%s</span>\n'
        '      <h3 class="row-title">%s</h3>\n'
        '      <span class="row-dek">%s</span>\n'
        "%s"
        "    </span>\n"
        "  </a>\n</li>\n"
        % (n, plate_note, p["kicker"], p["iso"], E(p["date"]), E(p["read"]),
           E(p["title"]), E(p["dek"]), plate)
    )


def footer():
    social = "".join(
        '<li><a href="%s">%s</a></li>' % (href, E(label)) for label, href in SITE["social"]
    )
    return (
        '<footer class="foot">\n<div class="sheet">\n'
        '  <div class="foot-grid">\n'
        '    <ul class="foot-nav">' + social + "</ul>\n"
        '    <p class="colophon">' + E(SITE["name"]) + " · Edited and written by "
        + E(SITE["author"]) + " · Powered by Hot Metal</p>\n"
        "  </div>\n"
        '  <p class="backlink"><a href="../index.html">&larr; All concepts</a></p>\n'
        "</div>\n</footer>\n"
    )


def demo_note():
    return "Demo only — nothing was sent."


# --------------------------------------------------------------------------- home

def build_home():
    lead = POSTS[0]

    catalogue = ('<ul class="rows">\n'
                 + "".join(cat_entry(i, p) for i, p in enumerate(POSTS) if i > 0)
                 + "</ul>\n")

    lead_html = (
        '<section class="lead sheet" aria-labelledby="lead-title">\n'
        '  <div class="railed">\n'
        '    <div class="rail">\n'
        '      <span class="folio">01</span>\n'
        '      <span class="rail-rule" aria-hidden="true"></span>\n'
        '      <span class="rail-note">Now showing</span>\n'
        "    </div>\n"
        '    <div class="col">\n'
        '      <p class="kicker">%s</p>\n'
        '      <h2 class="lead-title" id="lead-title"><a href="post.html">%s</a></h2>\n'
        '      <p class="lead-dek">%s</p>\n'
        '      <p class="lead-meta"><span>%s</span><span class="sep">/</span>'
        '<time datetime="%s">%s</time><span class="sep">/</span><span>%s</span>'
        '</p>\n'
        "    </div>\n  </div>\n</section>\n"
        % (lead["kicker"], E(lead["title"]), E(lead["dek"]),
           E(SITE["author"]), lead["iso"], E(lead["date"]), E(lead["read"]))
    )

    subscribe = (
        '<section class="subscribe" id="subscribe" aria-labelledby="sub-title">\n'
        '  <div class="sheet">\n'
        '    <div class="mark" aria-hidden="true"></div>\n'
        '    <h2 id="sub-title">Get the next essay by&nbsp;email</h2>\n'
        '    <p class="sub-copy">One long piece at a time, sent the morning it is published. '
        "You can also follow along by RSS or on X.</p>\n"
        '    <form class="sub-form" method="dialog" data-status="sub-status" '
        'data-done="%s" novalidate>\n'
        '      <div class="field">\n'
        '        <label class="vh" for="sub-email">Email address</label>\n'
        '        <input id="sub-email" name="email" type="email" autocomplete="email" '
        'placeholder="you@example.com" required>\n'
        "      </div>\n"
        '      <button class="btn" type="submit">Subscribe</button>\n'
        "    </form>\n"
        '    <p class="status" id="sub-status" role="status" aria-live="polite"></p>\n'
        '    <p class="sub-note">This prototype never sends anything anywhere.</p>\n'
        "  </div>\n</section>\n"
        % E(demo_note())
    )

    html = (
        head(SITE["name"] + " — " + SITE["tagline"], SITE["short_description"])
        + "<body>\n"
        + '<a class="skip" href="#lead-title">Skip to content</a>\n'
        + masthead("home")
        + "<main>\n"
        + lead_html
        + '<section class="sheet" aria-labelledby="catalogue-h">\n'
        + sect("The catalogue", anchor="catalogue", title_id="catalogue-h")
        + catalogue
        + "</section>\n"
        + subscribe
        + "</main>\n"
        + footer()
        + "<script>" + JS_FORMS + "</script>\n"
        + "</body>\n</html>\n"
    )
    return common.write(OUT, "index.html", html)


# --------------------------------------------------------------------------- post

PULL_QUOTE = ("The moment you fork them, they drift, and eventually your agent experience "
              "quietly rots while nobody notices.")


def build_post():
    body = common.body_with_ids(ART["body"], ART["sections"])

    # first paragraph becomes the lede; the first plate is hung directly after it
    first, rest = body.split("</p>", 1)
    first = first + "</p>"
    first = first.replace("<p>", '<p class="lede">', 1)

    # One hung-type treatment, used for both the standfirst and the pull quote:
    # roman between two hairlines, no captions, no quotation marks. Plate
    # numbers stay on actual pictures.
    standfirst_plate = (
        '<div class="plate plate--type">\n'
        '  <div class="plate-body"><p>%s</p></div>\n'
        "</div>\n" % E(ART["hook"])
    )

    quote_plate = (
        '<figure class="plate plate--type">\n'
        '  <blockquote class="plate-body"><p>%s</p></blockquote>\n'
        "</figure>\n" % E(PULL_QUOTE)
    )

    marker = '<h2 id="frontend-too">'
    assert marker in rest, "pull-quote anchor missing"
    rest = rest.replace(marker, quote_plate + marker, 1)

    tags = "".join('<li><a class="tag" href="index.html#catalogue">%s</a></li>' % E(t)
                   for t in ART["tags"])

    sources = "".join(
        '<li><a href="%s" target="_blank" rel="noopener noreferrer">%s</a>'
        '<span class="src-domain">%s</span></li>\n' % (url, E(title), E(domain))
        for title, domain, url in C.CITATIONS
    )

    comments = "".join(
        '<li>\n  <p class="comment-meta"><span class="who">%s</span>'
        '<span class="sep">/</span><span>%s</span></p>\n'
        '  <p class="comment-body">%s</p>\n</li>\n' % (E(who), E(when), E(text))
        for who, when, text in C.COMMENTS
    )

    cform = (
        '<form class="cform" method="dialog" data-status="c-status" data-done="%s" novalidate>\n'
        '  <p class="cform-head">Leave a comment</p>\n'
        '  <div class="grid">\n'
        '    <div class="field"><label for="c-name">Name</label>'
        '<input id="c-name" name="name" type="text" autocomplete="name" required></div>\n'
        '    <div class="field"><label for="c-email">Email</label>'
        '<input id="c-email" name="email" type="email" autocomplete="email" required></div>\n'
        "  </div>\n"
        '  <div class="field"><label for="c-body">Your comment</label>'
        '<textarea id="c-body" name="comment" rows="5" required></textarea></div>\n'
        '  <div class="actions">\n'
        '    <button class="btn" type="submit">Post comment</button>\n'
        '    <p class="status" id="c-status" role="status" aria-live="polite"></p>\n'
        "  </div>\n"
        '  <noscript><p class="sub-note">Demo only — this prototype never sends '
        "anything anywhere.</p></noscript>\n"
        "</form>\n" % E(demo_note())
    )

    # Three more works, listed exactly as the catalogue lists them — the same
    # numbering, the same row, the same click target. No separate card grid.
    related_rows = ('<ul class="rows">\n'
                    + "".join(cat_entry(i, POSTS[i]) for i in RELATED)
                    + "</ul>\n")
    related_note = "Nos. " + ", ".join("%02d" % (i + 1) for i in RELATED)

    contents = (
        '      <nav class="contents" aria-label="Contents">\n'
        '        <p class="contents-h">Contents</p>\n'
        "        <ol>\n"
        + "".join('          <li><a href="#%s" data-sec="%s" data-no="%s">'
                  '<span class="c-no">%s</span>'
                  '<span class="c-title">%s</span></a></li>\n'
                  % (sid, sid, ROMAN[n], ROMAN[n], E(label))
                  for n, (sid, label) in enumerate(ART["sections"]))
        + "        </ol>\n      </nav>\n"
    )

    # The rail keeps a running numeral that advances with the contents list as
    # the reader descends. It is decoration for the eye only — the contents
    # above are the navigable copy — so it is hidden from assistive tech.
    runner = (
        '    <div class="rail" aria-hidden="true">\n'
        '      <span class="runner">\n'
        '        <span class="runner-no" data-runner>%s</span>\n'
        '        <span class="runner-rule"></span>\n'
        "      </span>\n    </div>\n" % ROMAN[0]
    )

    art = (
        '<article id="article">\n'
        '<header class="art-head sheet">\n'
        '  <div class="railed">\n'
        '    <div class="rail">\n'
        '      <span class="folio">01</span>\n'
        '      <span class="rail-rule" aria-hidden="true"></span>\n'
        '      <span class="rail-note">%s</span>\n'
        "    </div>\n"
        '    <div class="col">\n'
        '      <h1 class="art-title">%s</h1>\n'
        '      <p class="art-sub">%s</p>\n'
        '      <p class="byline"><span class="who">%s</span><span class="sep">/</span>'
        '<time datetime="%s">%s</time><span class="sep">/</span><span>%s read</span></p>\n'
        "%s"
        "    </div>\n  </div>\n</header>\n"
        '<div class="sheet">\n  <div class="artgrid">\n'
        "%s"
        '    <div class="col body">\n%s\n%s\n%s\n</div>\n'
        "  </div>\n</div>\n"
        "</article>\n"
        % (ART["kicker"], E(ART["title"]), E(ART["subtitle"]), E(SITE["author"]),
           ART["iso"], E(ART["date"]), E(ART["read"]),
           contents, runner, first, standfirst_plate, rest)
    )

    blocks = (
        '<section class="block sheet" aria-labelledby="tags-h">\n'
        + sect("Filed under", title_id="tags-h")
        + '<div class="block-body"><ul class="tags">' + tags + "</ul></div>\n</section>\n"
        + '<section class="block sheet">\n'
        + sect("Sources", "%d references" % len(C.CITATIONS))
        + '<div class="block-body"><ol class="sources">\n' + sources + "</ol></div>\n</section>\n"
        + '<section class="block sheet">\n'
        + sect("Comments", "%d responses" % len(C.COMMENTS))
        + '<div class="block-body"><ul class="comments">\n' + comments + "</ul>\n"
        + cform + "</div>\n</section>\n"
        + '<section class="block sheet">\n'
        + sect("Also hanging", related_note)
        + related_rows + "</section>\n"
    )

    html = (
        head(ART["title"] + " — " + SITE["name"], ART["dek"])
        + "<body>\n"
        + '<a class="skip" href="#article">Skip to the essay</a>\n'
        + masthead("post", compact=True)
        + "<main>\n" + art + blocks + "</main>\n"
        + footer()
        + "<script>" + JS_MARGIN + JS_FORMS + "</script>\n"
        + "</body>\n</html>\n"
    )
    return common.write(OUT, "post.html", html)


def build():
    common.prepare(OUT, FONTS, IMAGES)
    a = build_home()
    b = build_post()
    print("wrote", a)
    print("wrote", b)
    print("images:", ", ".join(IMAGES))
    return a, b


if __name__ == "__main__":
    build()
