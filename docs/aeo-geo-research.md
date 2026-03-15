# Evidence‑Backed AEO/GEO Research Report for Scoring and Rewriting Agents

## Executive summary

**1. Executive summary**

AEO (Answer Engine Optimization) and GEO (Generative Engine Optimization) are best understood as “SEO for answer selection,” not “SEO replacement.” The consistently supported pattern across platforms is: **you still need classic SEO eligibility (crawlable, indexable, reputable), but performance increasingly depends on whether your content can be decomposed into trustworthy, self-contained passages that an AI system can confidently reuse, quote, and cite.** citeturn1view0turn16view0turn35view0turn3view1

Google’s official stance is that **there are no “special” optimizations for AI features** beyond doing SEO well and ensuring your content is accessible to Googlebot; AI Overviews/AI Mode can use “query fan-out” (sub-queries) to assemble answers and pick supporting links, so **topic completeness across sub-questions matters more than single-keyword tuning.** citeturn1view0turn20view0turn35view0

For systems that provide explicit citations (notably ChatGPT search and Perplexity), the “eligibility” layer includes **being fetchable by their search crawlers** (e.g., OAI‑SearchBot, PerplexityBot) and not accidentally blocking snippet/summarization permissions. OpenAI and Perplexity both distinguish between “index/search crawlers” and “user-triggered fetchers,” and both note that user-triggered fetches can behave differently from automatic crawling. citeturn36view1turn36view2turn15view3

Microsoft’s guidance for AI answers (Copilot and Bing AI experiences) is unusually explicit about the shift from page ranking to **passage/section selection (“parsing” into smaller pieces)** and recommends concrete structural patterns (clear titles/H1s, question-led headings, Q&A blocks, lists/tables, evidence, freshness). Microsoft also provides instrumentation (AI Performance in Bing Webmaster Tools) that exposes **citations, cited URLs, and “grounding queries”**—a rare “ground truth” signal for validation. citeturn16view0turn14view3

Two research lines reinforce these platform statements:

- Academic work on “GEO” proposes and tests content-level interventions; it reports that adding **citations/quotations/statistics** can materially increase visibility in generative answers, and that “traditional SEO” tactics like keyword stuffing can be ineffective or harmful in their setups. citeturn3view0turn3view2  
- Large-scale industry datasets show that **citation selection can diverge from classic top‑10 rankings**, supporting the idea that answer systems retrieve from broader sets (including fan-out queries and SERP features) and then select passages for reuse. citeturn35view0turn34view0

For engineering two downstream agents, the practical implication is: the scoring model should heavily weight (a) retrieval eligibility and (b) extractable, evidence-backed “answer blocks,” while the rewriting agent should focus on **front-loading clean answers, tightening entity context, and increasing citation-worthiness without sounding robotic.** citeturn16view0turn6view2turn33view0

## Terminology and conceptual model

**2. Terminology and conceptual model**

### Working definitions

**AEO (Answer Engine Optimization)**: practices that increase the likelihood a system returns your content (or a passage from it) as a direct answer, often with or without attribution (e.g., featured snippets, answer boxes, AI summaries). This inherits from “answer-first” search behaviors and featured snippets. citeturn31view0turn1view0

**GEO (Generative Engine Optimization)**: practices that increase the likelihood a generative answer system incorporates your content into its synthesized response (often with inline citations), emphasizing **selection and reuse** of content segments rather than ranking of whole pages. The term is used both in academia and in major platform messaging; Microsoft explicitly frames GEO as optimizing participation in AI-driven experiences. citeturn3view1turn27view3turn14view3

### Overlap with classic SEO

Overlaps (high confidence):  
- Crawlability/indexability and technical accessibility remain foundational. Google states AI features are built into Search and use the same crawling controls, and Microsoft states traditional SEO fundamentals are still essential for discoverability. citeturn1view0turn16view0turn8view0  
- Content quality, originality, and trust signals remain central (people-first content, avoiding scaled low-value automation). citeturn6view0turn7view3  
- Structured data remains useful for machine understanding and eligibility for rich results, but must be accurate and match visible content. citeturn9view0turn11view1  

### Where AEO/GEO meaningfully differ

Differences (supported, but with varying certainty):  
- **Selection unit shifts**: AI answer systems often select **passages/sections** rather than “the page,” and may assemble answers from multiple sources; Microsoft describes “parsing” and ranking of modular pieces, and the GEO paper models generative engines as retrieval + summarization + response generation with inline attributions. citeturn16view0turn3view1turn23view1  
- **Query expansion matters more**: Google documents “query fan-out” for AI Overviews/AI Mode; this implies pages can be cited even if not ranking for the exact head query, because they match sub-queries. citeturn1view0turn20view0turn35view0  
- **Citation-worthiness becomes a first-class goal**: evidence density (stats, primary sources, clear definitions) becomes both a trust signal and a practical “liftable” asset; Microsoft recommends supporting claims with evidence, and academic GEO experiments find citations/quotes/statistics raise visibility. citeturn15view1turn3view0turn3view2  

### What is mostly marketing hype vs what is solid

Solidly supported:
- “Do basic SEO well” remains necessary for visibility and eligibility. citeturn1view0turn16view0turn8view1  
- Passage-level extractability and clean structure improve reuse probability (platform guidance + empirical observations). citeturn16view0turn15view1turn33view0  
- Over-automation / scaled low-value content is risky. citeturn6view0turn7view3  

Often overstated:
- “One weird trick” guarantees inclusion/citations. Google explicitly says there are no special optimizations or guarantees for AI features and that inclusion is not guaranteed even when following guidelines. citeturn1view0turn8view1  
- Schema alone “forces” citations. Structured data can help understanding and rich results, but it does not guarantee display; and misuse can trigger manual actions or loss of rich-result eligibility. citeturn11view2turn30search14  

### Recommended internal terminology

For product clarity, the most implementation-useful framing is:

- **Eligibility layer**: technical + policy prerequisites for being retrievable and quotable (crawl/index, snippet controls, anti-spam). citeturn8view0turn1view0turn36view1  
- **Extractability layer**: document architecture and passage formatting that enable clean chunking. citeturn16view0turn31view0turn33view0  
- **Trust layer**: evidence, authorship, consistency, and corroboration signals that increase “safe to cite.” citeturn6view2turn15view1turn3view0  

This maps directly to scoring dimensions and rewriting steps.

## How AI answer engines likely use content

**3. How AI answer engines likely use content**

This section distinguishes **official guidance**, **supported observation**, **plausible inference**, and **uncertain/speculative**.

### A general pipeline model

A robust public-evidence model for AI answer engines is:

1) **Query understanding & rewriting**  
- Official: ChatGPT search rewrites user prompts into targeted queries (sometimes multiple), and may use “search partners.” citeturn36view0  
- Official: Google AI Mode groups a question into subtopics and searches for each simultaneously; Google describes “query fan-out” for AI Overviews and AI Mode. citeturn20view0turn1view0  
- Official (Microsoft Copilot Studio): query optimization can add conversation context (e.g., location/time). citeturn23view1  

2) **Retrieval over an index and/or live fetching**  
- Official: Google crawls, indexes, and serves results in stages; indexing is not guaranteed and depends on content and metadata. citeturn8view0turn8view1  
- Official: Microsoft’s generative answers pipeline explicitly separates retrieval (via Bing) from summarization (“retrieval augmented generation”). citeturn23view1turn23view2  

3) **Parsing/chunking of documents and passage evaluation**  
- Official (Microsoft): in AI search, “ranking still happens,” but selection is about which *pieces* earn a place in the final answer; assistants “break content down” (“parsing”) into structured pieces. citeturn16view0  
- Academic: the GEO paper models generative engines as combining a search engine with multiple generative modules; responses are grounded in retrieved sources with inline attributions. citeturn3view1  

4) **Answer synthesis + citation selection**  
- Official: Google AI Overviews show an overview with links to supporting web resources. citeturn20view0turn1view0  
- Official: ChatGPT search responses contain inline citations and a “Sources” list. citeturn36view0  
- Official (Perplexity): every answer includes numbered citations linking to original sources. citeturn18view0turn18view1  

### What the public evidence implies about “what gets used”

**Passage-level “liftability” is the core operational unit (high confidence overall; evidence varies by platform).** Microsoft is explicit about parsing into smaller pieces; Google’s fan-out and AIO/AI Mode measurement implies multiple links can be assigned a single “position,” reinforcing that the overview is a container and sources are supporting components. citeturn16view0turn20view0

**Source selection is not equivalent to ranking (strong observation, not guaranteed).** Large-scale studies show a material portion of AI Overview citations come from outside the top 10 (and sometimes outside top 100), and that the top‑10 overlap can shift over time; these findings align with Google’s documented fan-out behavior. citeturn35view0turn1view0

**Evidence reduces citation risk (high confidence).** Microsoft explicitly recommends evidence-backed claims; the GEO paper finds citations/quotes/statistics can increase visibility, and also notes keyword stuffing underperforms. citeturn15view1turn3view2

**Crawl and snippet controls shape what can be used (high confidence).** Google notes snippet controls govern what can be shown from your pages in AI features; Bing provides controls (e.g., NOARCHIVE/NOCACHE; data‑nosnippet) for AI-generated answers; OpenAI requires OAI‑SearchBot access for summaries/snippets in ChatGPT search. citeturn1view0turn27view1turn27view2turn36view2

### Known unknowns

What remains largely opaque (must be treated as uncertain):  
- The precise weighting of authority vs relevance vs freshness in citation selection for each platform.  
- Whether structured data directly influences inclusion in AI answers versus only improving retrieval/understanding. Google says there are no special requirements for AI features, and structured data impacts rich results eligibility rather than guaranteeing selection. citeturn1view0turn11view2  
- How often “live fetchers” bypass your crawler directives in each ecosystem; both OpenAI and Perplexity describe user-triggered agents that may not behave like standard crawlers, and Cloudflare reports behavior inconsistent with robots.txt norms for Perplexity in certain contexts. citeturn36view1turn15view3turn15view0  

## Best practices and anti-patterns

**4. Best-practice recommendations**

Below are recommendations grouped by theme. For each recommendation, the “Evidence type” field is one of: Official platform guidance, Strong industry consensus, Plausible inference, Weak/uncertain claim.

### Theme: eligibility and technical prerequisites

| Recommendation | Why it matters | Evidence type | Confidence | Platforms helped | Detectable by scorer? | Fixable by writer? |
|---|---|---|---|---|---|---|
| Ensure pages are crawlable/indexable by relevant crawlers (and not blocked accidentally) | If a system can’t crawl/index/fetch, it can’t cite. Google indexing is not guaranteed and depends on access + quality; OpenAI and Perplexity explicitly require allowing their search crawlers for inclusion in search answers. citeturn8view1turn36view2turn15view3 | Official platform guidance | High | Google AI Overviews/AI Mode, ChatGPT search, Perplexity, Bing/Copilot | Partial (needs site context) | No (technical) |
| Use platform-supported snippet controls intentionally (nosnippet, data-nosnippet, max-snippet, noindex; Bing’s AI controls) | Snippet controls govern what content can be shown/used in AI features. Misuse can reduce citation richness or prevent reuse. citeturn1view0turn31view0turn27view2turn27view1 | Official platform guidance | High | All (platform-specific directives) | Yes/Partial | Partial (writer can restructure what to hide/show) |
| Avoid hiding key answers behind UI that crawlers may not render (tabs/expanders) and avoid “PDF-only” critical content | Microsoft explicitly warns that hidden content may be skipped and that PDFs often lack structured signals compared to HTML. citeturn16view0 | Official platform guidance | Medium-High | Bing/Copilot; plausibly others | Yes | Partial |
| Provide accessible, machine-readable text equivalents for critical info (not only images) | Microsoft warns key info only in images reduces reliability; Google and Bing rely on text for snippets and extraction. citeturn16view0turn31view0 | Official platform guidance | Medium-High | All | Yes | Yes |

### Theme: answer blocks and extractability

| Recommendation | Why it matters | Evidence type | Confidence | Platforms helped | Detectable by scorer? | Fixable by writer? |
|---|---|---|---|---|---|---|
| Add a concise “direct answer” near the top (1–3 sentences) that would stand alone out of context | AI citation patterns and platform advice favor “bottom line up front” and snippable sections; Microsoft recommends Q&A formats and concise snippets; featured snippet mechanics reward clear extractable text. citeturn16view0turn31view0turn33view0 | Strong industry consensus | Medium-High | Google, ChatGPT, Perplexity, Bing/Copilot | Yes | Yes |
| Use question-led headings and explicit Q→A blocks for major intents | Microsoft says direct Q&A pairs can be lifted into AI responses; search experiences also use “related questions” patterns. citeturn16view0turn31view0 | Official platform guidance | High | Google, Bing/Copilot; plausibly ChatGPT/Perplexity | Yes | Yes |
| Use lists and tables for comparisons, steps, and specs | Microsoft explicitly recommends lists/tables for reusable segments; these formats are historically strong for featured snippets and help parsing. citeturn16view0turn31view0 | Official platform guidance | High | All | Yes | Yes |
| Make paragraphs self-contained and “quotable” (clear subject, explicit terms, minimal pronoun ambiguity) | AI systems often extract fragments; self-contained phrasing reduces ambiguity and citation risk. Evidence is partly official (semantic clarity guidance) and partly observational (citation analyses). citeturn16view0turn33view0 | Plausible inference | Medium | All | Yes | Yes |
| Align title, H1, and page purpose; keep each section tightly scoped | Microsoft calls title/H1 alignment and clear scope important for AI interpretation; Google emphasizes site/page focus and usability signals. citeturn16view0turn6view1turn8view3 | Official platform guidance | Medium-High | All | Yes | Yes |

### Theme: trust, evidence, and citation-worthiness

| Recommendation | Why it matters | Evidence type | Confidence | Platforms helped | Detectable by scorer? | Fixable by writer? |
|---|---|---|---|---|---|---|
| Support claims with evidence (data, primary sources, citations, methodology) | Microsoft explicitly recommends evidence to build trust for reuse; GEO experiments show citations/quotes/statistics can raise visibility. citeturn15view1turn3view0turn3view2 | Official platform guidance + case study evidence | High | All (especially citation-first systems) | Yes (presence/structure) | Yes |
| Make authorship and “who/how/why” explicit (bylines, about author, process) | Google encourages clear authorship info and “Who/How/Why” framing; this supports trust (E‑E‑A‑T framing) even if not a single ranking factor. citeturn6view2turn6view0 | Official platform guidance | Medium-High | Google; plausibly others | Partial | Partial |
| Maintain accuracy and avoid scaled low-value automation; disclose automation when appropriate | Google warns that scaled, low-value AI generation may violate spam policies; recommends focusing on accuracy/quality in generated content and metadata. citeturn7view3turn6view0 | Official platform guidance | High | All | Partial | Partial |
| Keep content fresh and correct for time-sensitive topics; use change-notification tools where relevant | Bing explicitly ties freshness to inclusion/citation and recommends IndexNow; structured data policies note time-sensitive rich results may not show when outdated. citeturn15view1turn23view3turn11view1 | Official platform guidance | Medium-High | Bing/Copilot; also general | Partial | Partial |

### Theme: entity and semantic clarity

| Recommendation | Why it matters | Evidence type | Confidence | Platforms helped | Detectable by scorer? | Fixable by writer? |
|---|---|---|---|---|---|---|
| Define key entities and terms early; disambiguate versions, regions, and constraints | Fan-out queries and parsing benefit from explicit entity context; Microsoft recommends adding context and semantic clarity (e.g., “42 dB dishwasher designed for open-concept kitchens”). citeturn16view0turn20view0 | Official platform guidance | Medium-High | All | Yes | Yes |
| Use structured data where it truthfully represents visible content; include “sameAs”/identity links when relevant | Google states structured data gives explicit clues and can help understand entities; policies require it match visible content and not mislead. citeturn9view0turn11view1turn11view0 | Official platform guidance | High | Google; some benefit elsewhere | Partial | Partial |

### Theme: schema and metadata (do this, but don’t over-believe it)

| Recommendation | Why it matters | Evidence type | Confidence | Platforms helped | Detectable by scorer? | Fixable by writer? |
|---|---|---|---|---|---|---|
| Implement relevant schema types correctly; don’t rely on FAQ rich results unless you qualify | Google reduced FAQ rich result visibility (mostly government/health); structured data still can help understanding but doesn’t guarantee display. citeturn31view1turn30search14turn11view2 | Official platform guidance | High | Google primarily | Partial | Partial |
| Don’t add structured data for non-visible info; ensure completeness and avoid deceptive markup | Misleading markup can cause manual actions or ineligibility; Google explicitly warns against deceptive/irrelevant structured data. citeturn11view2turn11view1 | Official platform guidance | High | Google; general principle | Yes | Partial |

**5. Anti-patterns and failure modes**

The anti-patterns below are framed for both detection (scorer) and repair (writer/fixer).

| Anti-pattern | Why harmful | Evidence type | Confidence | Platforms harmed | Detectable by scorer? | Fixable by writer? | Symptoms & detection hints | Repairs |
|---|---|---|---|---|---|---|---|---|
| Blocking crawlers used for search/citations (or accidental noindex/canonical mistakes) | Prevents discovery, indexing, and snippet inclusion; some systems may only show a link/title if snippet fetching is blocked. citeturn36view2turn8view1turn1view0 | Official platform guidance | High | All | Partial (needs site context) | No/Partial | robots.txt disallows; meta noindex; inconsistent canonicals | Unblock relevant crawlers; fix indexability and canonicalization; confirm in tools |
| No direct answer until deep in the page (“slow reveal”) | Citation patterns and platform guidance favor early clarity; late answers reduce extractability and reuse probability. citeturn33view0turn16view0 | Strong industry consensus | Medium | All | Yes | Yes | Long intro; first “answer-like” sentence appears late | Add top answer block; move definitions up; rewrite intro as context not filler |
| Walls of text, weak headings, vague section titles | Makes parsing/chunking difficult; Microsoft explicitly recommends clear headings and structured formats. citeturn15view1turn16view0 | Official platform guidance | High | All | Yes | Yes | High paragraph length; low heading density; headings like “Learn more” | Add descriptive H2/H3-style headings; split into sections; add lists/tables |
| Overly vague, fluffy language (“innovative,” “best-in-class”) without specifics | Reduces semantic clarity and increases citation risk; Microsoft advises anchoring claims in measurable facts. citeturn16view0 | Official platform guidance | Medium-High | All | Yes | Yes | High adjective ratio; low numbers/units; claims without evidence | Replace with measurable specifics (units, ranges, constraints) and sources |
| Contradictory statements or inconsistent key facts across sections | AI systems perform grounding/provenance checks in some designs; contradictions reduce trust and may suppress reuse. citeturn23view1turn15view1 | Plausible inference (supported by RAG designs) | Medium | All | Partial | Yes | Conflicting numbers/definitions; multiple “current price” values, etc. | Normalize facts; add a single “source of truth” block; add update date |
| Misleading schema or markup not matching visible content | Risks manual actions/ineligibility; violates structured data policies. citeturn11view2turn11view1 | Official platform guidance | High | Google; reputationally all | Yes | Partial | Structured data contains entities not in visible body; fake reviews | Remove/repair markup; ensure full alignment and completeness |
| Heavy reliance on content hidden in tabs/expanders or only in images | Crawlers may skip or misinterpret; Microsoft explicitly warns. citeturn16view0 | Official platform guidance | Medium | All | Yes | Yes | Key answers only appear after JS interaction; specs only in images | Move critical facts into visible HTML; add alt text; add transcripts |
| Scaled AI-generated content with little originality/value | Google warns scaled low-value automation can violate spam policies; “summarizing others without value” is a warning sign. citeturn6view0turn7view3 | Official platform guidance | High | Google and broadly | Partial | Partial | High similarity across pages; generic phrasing; no original data | Add original insights, examples, first-hand experience; consolidate thin pages |

## Platform-specific notes

**6. Platform-specific notes**

This section focuses on what is (a) officially known, (b) widely observed, (c) plausibly inferred, and (d) uncertain.

### Google AI Overviews and AI Mode

Officially known:
- Google states **no special optimizations** are required for AI features; focus on SEO fundamentals and ensure access for Googlebot. citeturn1view0  
- AI Overviews/AI Mode may use **query fan-out** (multiple sub-queries) to develop responses and find supporting links. citeturn1view0turn20view0  
- AI Overviews occupy a single position in Search Console reporting and have defined impression/click behaviors; AI Mode groups questions into subtopics and treats follow-ups as new queries. citeturn20view0  
- Snippet controls (nosnippet, data-nosnippet, max-snippet, noindex) apply to AI features; Google-Extended controls training/grounding in certain Gemini/Vertex contexts but **does not affect Search inclusion/ranking.** citeturn1view0turn21view0  

Practitioner observation (credible, not guaranteed):
- Citation/selection can diverge from top‑10 rankings, consistent with fan-out behavior and broader retrieval. citeturn35view0turn34view0  

What appears unique:
- “Fan-out” is unusually explicit and implies **topic coverage breadth** and **sub-question completeness** are key. citeturn1view0turn20view0  

Universal takeaways:
- Make content extractable, evidence-backed, and clearly scoped; then let ranking systems do their work. citeturn6view0turn16view0  

### ChatGPT search

Officially known:
- ChatGPT search may use **third-party search providers** and rewrites prompts into targeted queries; it includes inline citations. citeturn36view0  
- For your content to be included in summaries/snippets, you must not block **OAI‑SearchBot**; OpenAI provides the user-agent and published IP ranges. citeturn36view1turn12view0turn36view2  
- If OpenAI learns a disallowed URL via third-party providers, it may surface only link/title; to prevent even that, OpenAI recommends using **noindex**, noting crawlers must be able to read meta tags. citeturn36view2turn31view2  
- OpenAI distinguishes OAI‑SearchBot (search inclusion) from GPTBot (training) and ChatGPT‑User (user-triggered actions). citeturn36view1  

What appears unique:
- Explicit dependence on “search partners” implies your **visibility may partly depend on how you perform in underlying search indexes** used by those partners (inference). citeturn36view0  

Measurement uniqueness:
- OpenAI states referral URLs include **utm_source=chatgpt.com** for tracking. citeturn36view2  

### Perplexity

Officially known:
- Perplexity positions itself as delivering direct answers with **numbered citations** and real-time web sourcing. citeturn18view0turn18view1  
- Perplexity distinguishes **PerplexityBot** (for surfacing/linking websites in search results) from **Perplexity‑User** (user-triggered); Perplexity‑User “generally ignores robots.txt rules.” citeturn15view3  

What appears unique:
- The explicit “numbered citations” UX creates a strong incentive for **highly quotable, evidence-dense passage design** (inference). citeturn18view0turn3view0  

Important uncertainty / controversy:
- entity["company","Cloudflare","internet security company"] reported tests suggesting Perplexity used undeclared crawling behavior inconsistent with robots.txt norms, and Cloudflare de-listed it as a verified bot. This is not a platform self-description, but is a high-credibility third-party observation and should be treated as a risk factor when designing “crawler control” assumptions. citeturn15view0turn15view3  

### Bing and Copilot

Officially known:
- Microsoft frames “grounding” as connecting AI to current, authoritative information, and describes GEO as becoming important as agents do more browsing and retrieval. citeturn27view3  
- Microsoft provides **AI Performance** in Bing Webmaster Tools, exposing citations, cited pages, and “grounding queries,” and recommends improvements like structure (headings/tables/FAQs), evidence, and freshness. citeturn14view3turn15view1  
- Microsoft’s AI search guidance emphasizes passage-level selection via parsing, and recommends Q&A formatting, descriptive headings, and semantic clarity. citeturn16view0  
- Bing provides content controls relevant to AI answers:  
  - NOARCHIVE: content not included in Bing Chat answers (per Bing’s 2023 announcement). citeturn27view1  
  - NOCACHE: allows only URL/title/snippet use in answers; content still appears in search results. citeturn27view1  
  - data‑nosnippet: excludes marked sections from snippets and AI answers while remaining indexed and rankable. citeturn27view2  
- Bing explicitly ties freshness to AI inclusion and recommends IndexNow to speed discovery of updates. citeturn15view1turn22search3turn23view3  

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Google AI Overview screenshot","ChatGPT search answer citations screenshot","Perplexity AI answer citations screenshot","Bing Copilot AI answer citations screenshot"],"num_per_query":1}

## Scoring and rewriting frameworks

**7. Proposed scoring framework**

The table below is designed to be implementable for an automated scoring agent. Weights are suggested defaults (sum = 100) and should be calibrated using real citation/referral outcomes (see Measurement Plan).

| Dimension | Definition | Weight | Signals | Detection difficulty | Notes |
|---|---:|---:|---|---|---|
| Retrieval eligibility | Content can be crawled/indexed/fetched by target engines | 10 | No accidental noindex; not blocking relevant search crawlers; canonical consistency | Medium | Requires site context/logs for full confidence. citeturn8view1turn36view2turn15view3 |
| Snippet & reuse permissions | Page-level controls don’t suppress reuse unintentionally | 6 | No blanket nosnippet where citations desired; careful data-nosnippet use; avoid Bing NOCACHE/NOARCHIVE if wanting inclusion | Medium | Platform-specific: Google snippet controls; Bing controls; OpenAI requires crawl for meta tags. citeturn1view0turn27view2turn36view2 |
| Top-of-page answer presence | Direct answer early and easily extractable | 8 | 1–3 sentence answer; definition block; summary bullets | Easy | Supported by platform guidance and citation-position studies. citeturn16view0turn33view0 |
| Heading structure & chunk boundaries | Sections are clearly delimited for parsing | 7 | Descriptive headings; consistent hierarchy; no vague section titles | Easy | Microsoft explicitly emphasizes headings as slice markers. citeturn16view0turn15view1 |
| Q&A / intent coverage | Major user questions are explicitly answered | 6 | Question-led sections; FAQ-style subheaders; follow-up questions addressed | Medium | FAQ schema is not required; Q&A formatting is valuable even without rich results. citeturn16view0turn31view1 |
| Extractable formatting | Use of lists, tables, steps, comparisons | 6 | Tables for comparisons; numbered steps for how-to; bulleted key facts | Easy | Directly recommended by Microsoft and aligns with snippet paradigms. citeturn16view0turn31view0 |
| Entity clarity & disambiguation | Entities are explicit and unambiguous | 6 | Names, versions, regions; definitions; minimized pronoun ambiguity | Medium | Also helps fan-out sub-queries. citeturn16view0turn20view0 |
| Evidence density & external support | Claims are supported by credible sources/data | 10 | Cited studies; primary-source links; method notes; verifiable numbers | Medium | Strongly emphasized by Microsoft; supported by GEO experiments. citeturn15view1turn3view0 |
| Originality / unique value | Adds information beyond generic summaries | 7 | First-party data; experiments; unique examples; expert insights | Hard | Important because generic content is less cite-worthy and may be filtered by quality systems. citeturn6view0turn7view3 |
| Factual consistency & precision | No contradictions; specific, verifiable statements | 7 | Consistent definitions; consistent numbers; clear scope/constraints | Medium | RAG systems may cross-check; contradictions reduce trust. citeturn23view1turn6view2 |
| Authorship & expertise signals | “Who/How/Why” clarity; credible authorship | 5 | Byline; author bio; credentials; editorial policy | Medium | Google provides explicit guidance; scoring can detect presence, not truth. citeturn6view2turn6view0 |
| Freshness & update discipline | Currency for time-sensitive topics | 5 | “Last updated”; changelog; date accuracy; update cadence | Medium | Bing explicitly stresses freshness; schema policies require up-to-date info for time-sensitive rich results. citeturn15view1turn11view1turn23view3 |
| Structured data correctness | Schema exists and matches visible content | 5 | Valid schema; no misleading markup; completeness; sameAs where relevant | Medium | Misuse can cause penalties/eligibility loss. citeturn11view2turn11view1turn9view0 |
| Readability & “business-grade clarity” | Simple syntax and clean punctuation for parsing | 4 | Short sentences; low fluff; consistent units | Easy | Supported by Microsoft guidance and citation linguistic studies. citeturn16view0turn33view0 |
| Multimodal accessibility | Key info available in text; media has alt/transcripts | 3 | Alt text; captions; transcripts; no “image-only” facts | Easy | Microsoft explicitly warns about image-only key info. citeturn16view0 |
| Internal linking & topical cluster support | Page lives in a coherent topical ecosystem | 3 | Links to supporting pages; glossary; related guides | Medium | Helps discoverability and fan-out coverage; partly inferential. citeturn8view0turn35view0 |
| Spam & policy risk | Signals of scaled abuse/deception | 2 | Keyword stuffing; deceptive schema; thin pages | Medium | Google’s guidance and structured-data policy enforcement. citeturn7view3turn11view2turn3view2 |

### Weighting logic

Weights prioritize what the platforms most directly connect to inclusion/citation outcomes:

- **Eligibility + permissions (16 points)** because you cannot be cited if you cannot be fetched or if you suppress reuse via directives. citeturn36view2turn1view0turn27view2  
- **Answer/extractability (27 points)** because Microsoft explicitly describes parsing and reuse of modular pieces, and both Google’s fan-out model and cross-platform citation studies favor liftable content. citeturn16view0turn20view0turn33view0  
- **Trust/evidence (29 points)** because citations are ultimately a trust transaction; Microsoft recommends evidence, and GEO experiments show evidence-like additions can increase visibility. citeturn15view1turn3view0turn6view2  
- The remaining dimensions (readability, media accessibility, internal linking) are meaningful but secondary and often work indirectly.

**8. Proposed rewriting/fixing framework**

This is a stepwise playbook for a future writer/fixer agent that must improve AEO/GEO performance without flattening brand voice.

### Stepwise playbook

1) **Lock the target questions and intents**  
Map 3–8 primary questions the page must answer (including likely fan-out subquestions). The output should be a compact “intent map” used for structure decisions. This aligns with Google fan-out dynamics and Microsoft’s emphasis on query intent alignment. citeturn20view0turn16view0

2) **Create an “Answer Block” at the top**  
Add: definition + direct answer + key constraints (who/when/region/version) + 1–3 key facts. This is the single most reliable fix for extractability. citeturn16view0turn33view0turn31view0

3) **Rebuild the outline for parsing**  
Rewrite headings to be descriptive and question-led (not “Overview,” not “Learn more”). Each heading should define a chunk that can stand alone. citeturn16view0turn15view1

4) **Convert dense paragraphs into reusable units**  
- Replace long prose with lists/tables where it simplifies extraction.  
- Ensure each paragraph has an explicit subject (avoid “this/it/they” without antecedents).  
- Keep key facts in text (not only images or hidden widgets). citeturn16view0turn31view0

5) **Add “citation hooks” without sounding robotic**  
For factual claims, add a short attribution line or an outbound link to a primary or high-trust source; for your own claims, add methodology or measurement context. This aligns with Microsoft’s evidence guidance and GEO findings that citations/stats can increase visibility. citeturn15view1turn3view0turn3view2

6) **Elevate trust signals (“Who/How/Why”)**  
Add or strengthen: byline, author bio, editorial policy, and where appropriate, disclosure of AI assistance and human review. Google explicitly encourages clear authorship and notes automation disclosures can help when users would reasonably ask “how was this created?” citeturn6view2turn6view0turn7view1

7) **Freshness pass**  
If the topic is time-sensitive, add an “updated” date and a brief change note; ensure factual updates match the date (avoid “date painting,” which Google flags as a warning sign). Where applicable, integrate faster update discovery mechanisms (technical layer). citeturn6view0turn15view1turn23view3

8) **Schema pass (only when truthful and useful)**  
Add or fix structured data that reflects visible content; include identity signals where relevant. Never add markup for content not shown on-page. citeturn11view1turn9view0turn11view2

9) **Permission pass (prevent accidental self-sabotage)**  
Confirm snippet/AI controls do not block what you want to be cited. For Bing/Copilot, avoid NOCACHE/NOARCHIVE if inclusion is desired; for Bing, use data‑nosnippet surgically rather than blanket suppression. citeturn27view1turn27view2turn1view0

### What should never be changed

- Don’t introduce new factual claims without sources; AI reuse amplifies errors. citeturn15view1turn23view1  
- Don’t “stuff” keywords or entities; GEO research shows some classic spammy tactics can underperform and platform spam policies penalize manipulation. citeturn3view2turn6view0turn7view3  
- Don’t add misleading structured data or hide contradictory disclaimers. citeturn11view2turn11view1  

### Preserving voice while improving extractability

The writing agent should treat extractability as a **layout and sentence-clarity constraint**, not a tone constraint: keep the brand voice in examples, metaphors, and transitions, but keep the answer-bearing sentences plain, explicit, and verifiable. Microsoft explicitly advises avoiding vague language and anchoring claims in measurable facts; this can be done in any tone. citeturn16view0

## Example patterns and measurement plan

**9. Example patterns**

These examples illustrate patterns that scoring and rewriting rules can detect and optimize.

### Pattern: “Wikipedia‑style lead” for answer engines

Why it works:
- Industry studies show Wikipedia is among the most-cited domains in AI responses, indicating that predictable summary-first structure is highly reusable. citeturn32view0turn32view1  

What to emulate (without copying Wikipedia):
- 2–3 sentence definition + context at top (“X is…”)  
- Clear scope constraints (region, version, date)  
- Terminology normalization (synonyms and related terms)  
- References for key claims

Scoring dimensions:
- Top-of-page answer presence, entity clarity, extractable formatting, evidence density.

### Pattern: “Microsoft’s AI-parseable product comparison” (lists + Q&A)

Microsoft’s guidance explicitly recommends descriptive headings, Q&A, and lists/tables and provides a concrete example layout. citeturn16view0  

What to emulate:
- Title/H1 alignment  
- A “Top picks” table with measurable attributes  
- Q&A blocks for common constraints (“How loud is it?” → “42 dB…”)  
- Avoiding vague adjectives without units

Scoring dimensions:
- Heading structure, Q&A coverage, extractable formatting, readability/clarity.

### Pattern: “Evidence-forward citation block” (GEO research-aligned)

The GEO paper finds adding citations/quotes/stats can materially improve generative visibility. citeturn3view2turn3view0  

What to emulate:
- One key stat or benchmark per major claim  
- Short inline citations to primary sources  
- Quotable definitions (subject–verb–object)

Scoring dimensions:
- Evidence density, precision, originality (if first-party), trust signals.

### Hypothetical before/after transformation (abbreviated)

Before (weak for AEO/GEO):  
“Modern teams need innovative solutions to manage workflows and boost productivity.”

After (stronger):  
“Workflow automation software helps teams standardize repeated processes (like approvals and handoffs) so work moves faster with fewer manual steps. In practice, the best tools reduce cycle time by making task ownership, status, and dependencies explicit.”

Why the after is better:
- Defines the thing (“X helps…”)  
- Explains mechanism (“so…”)  
- Avoids empty adjectives  
- Produces a passage that can be cited standalone (subject is explicit)

**10. Measurement plan**

### Metrics a scoring agent can predict (on-page signals)

- Presence/quality of top answer block and Q&A formatting. citeturn16view0turn33view0  
- Evidence density (citations, stats, methodology). citeturn15view1turn3view0  
- Extractability (lists/tables, heading specificity). citeturn16view0  
- Permission risk flags (nosnippet/noindex patterns; Bing AI controls). citeturn31view0turn27view2turn27view1  

### Metrics requiring external monitoring (ground truth)

- **Google Search Console**: AI Overviews and AI Mode clicks/impressions/position are included in Search Console measurement rules; follow-up questions in AI Mode count as new queries. citeturn20view0turn1view0  
- **Bing Webmaster Tools AI Performance**: citations, cited pages, grounding queries, and trends over time. citeturn14view3turn15view1  
- **ChatGPT referrals**: track **utm_source=chatgpt.com** in analytics. citeturn36view2  
- Referral traffic and conversion quality from AI platforms (industry benchmarks show growth and meaningful referral volumes, though still smaller than traditional search). citeturn32view2  

### Practical validation design

- Run **before/after tests** on a controlled page set, mirroring Google’s recommended structured data evaluation approach: pick stable pages, apply changes, measure over a meaningful window, and compare deltas. citeturn9view0turn31view1  
- Use **Bing grounding queries** to align content with what AI retrieval systems actually searched for (this is one of the few direct “retrieval phrase” signals available). citeturn14view3turn15view1  
- Expect noise: AI answers are probabilistic and can vary with model updates and prompt rewrites (e.g., fan-out variability). citeturn35view0turn1view0  

## Open questions and distilled deliverables

**11. Open questions / uncertainty**

- **Selection weighting and corroboration rules**: Microsoft describes grounding/provenance checks in its generative answers architecture, but the exact thresholds and how they vary by surface are not public. citeturn23view1turn27view3  
- **Schema impact on AI answers**: structured data clearly helps understanding and rich results, but no platform guarantees it influences AI answer inclusion. citeturn9view0turn11view2turn1view0  
- **Crawler control consistency**: OpenAI and Perplexity describe user-triggered fetchers that may not follow robots.txt, and Cloudflare reports undeclared crawling behavior for Perplexity; teams should treat “robots control” as necessary but not always sufficient. citeturn36view1turn15view3turn15view0  
- **How much classic authority (links/domain) matters vs passage quality**: studies show citation sources can diverge from top-10 rankings and include pages with limited traditional visibility, suggesting alternative retrieval paths. citeturn35view0turn32view1  

**12. Final distilled deliverables**

### A. Scoring checklist

- Eligibility  
  - Page is indexable (no accidental noindex; canonical consistent). citeturn8view1turn31view2  
  - Not blocking relevant search crawlers (Googlebot; OAI‑SearchBot; PerplexityBot; Bing where applicable). citeturn21view0turn36view1turn15view3  
  - Snippet/AI controls align with goals (no blanket suppression). citeturn1view0turn27view2turn31view0  

- Extractability  
  - Direct answer appears near top; definitions are explicit. citeturn16view0turn33view0  
  - Headings are specific and question-led; sections are chunkable. citeturn16view0turn15view1  
  - Lists/tables used where they improve clarity and reuse. citeturn16view0turn31view0  

- Trust & evidence  
  - Key claims supported with sources, data, or methodology notes. citeturn15view1turn3view0  
  - Authorship and “Who/How/Why” are clear; trust signals are visible. citeturn6view2turn6view0  
  - No contradictions; scope/constraints are explicit. citeturn23view1turn16view0  

- Markup hygiene  
  - Structured data matches visible content; no deceptive markup. citeturn11view1turn11view2  
  - Time-sensitive content is updated; avoids “fake freshness.” citeturn6view0turn11view1  

### B. Writer/fixer checklist

- Add a top “Answer Block”: definition + direct answer + constraints + key facts. citeturn16view0turn33view0  
- Rewrite headings into question-led, descriptive chunk titles. citeturn16view0  
- Convert long paragraphs into lists/tables; make sentences standalone. citeturn16view0turn31view0  
- Replace vague claims with measurable specifics; add evidence links. citeturn16view0turn15view1turn3view2  
- Add/strengthen byline, author bio, editorial policy, and method notes. citeturn6view2turn6view0  
- Add “last updated” and ensure changes match the date for time-sensitive topics. citeturn6view0turn15view1  
- Ensure critical information is visible in HTML (not hidden, not image-only). citeturn16view0  

### C. Structured JSON schema proposal

```json
{
  "overall_score": 0,
  "scoring_version": "1.0",
  "confidence": {
    "overall": "medium",
    "notes": [
      "Limited site-level context (robots/crawl logs not available).",
      "Platform behaviors are probabilistic and may vary over time."
    ]
  },
  "dimensions": [
    {
      "key": "retrieval_eligibility",
      "label": "Retrieval eligibility",
      "weight": 10,
      "score": 0,
      "severity_if_low": "critical",
      "scope": "site_and_page",
      "objectivity": "semi_objective",
      "signals": {
        "positive": [],
        "negative": []
      },
      "evidence": {
        "observations": [],
        "examples": []
      },
      "recommendations": {
        "quick_wins": [],
        "requires_technical_work": [],
        "requires_editorial_work": []
      }
    }
  ],
  "strengths": [
    {
      "summary": "",
      "dimensions": [],
      "evidence_snippets": []
    }
  ],
  "weaknesses": [
    {
      "summary": "",
      "dimensions": [],
      "evidence_snippets": [],
      "risk": "medium"
    }
  ],
  "critical_issues": [
    {
      "issue": "",
      "why_it_matters": "",
      "affected_platforms": [],
      "fix_type": "technical|editorial|both",
      "suggested_fix": ""
    }
  ],
  "quick_wins": [
    {
      "action": "",
      "expected_impact": "high|medium|low",
      "fix_type": "technical|editorial|both"
    }
  ],
  "rewrite_priorities": [
    {
      "priority": 1,
      "goal": "",
      "steps": [],
      "do_not_change": []
    }
  ],
  "platform_notes": {
    "google_ai_overviews": {
      "fit": "medium",
      "notes": []
    },
    "chatgpt_search": {
      "fit": "medium",
      "notes": []
    },
    "perplexity": {
      "fit": "medium",
      "notes": []
    },
    "bing_copilot": {
      "fit": "medium",
      "notes": []
    }
  },
  "notes": [
    "Scores reflect on-page signals; off-page authority and real crawl/index status may change outcomes."
  ]
}
```