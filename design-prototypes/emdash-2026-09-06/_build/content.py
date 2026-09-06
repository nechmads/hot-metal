# Shared demonstration content for every concept.
# Source: the public "Looking Ahead" publication (looking-ahead.hotmetalapp.com),
# an existing Hot Metal publication owned by the user. Used as approved sample
# content so all five concepts are compared on identical material.

import os, re as _re, html as _html

HERE = os.path.dirname(os.path.abspath(__file__))

SITE = {
    "name": "Looking Ahead",
    "tagline": "AI, and what it means for the rest of us",
    "description": (
        "My name is Shahar Nechmad. I’m a five-time startup founder specializing in AI, "
        "and I’ve built a range of AI-driven products. Here I share what I’m learning "
        "along the way—AI news and breakthroughs, what they might mean for our lives and "
        "the world, plus practical recommendations, new releases, and tools worth trying."
    ),
    "short_description": (
        "Notes from a five-time AI founder on what’s actually being built, what it means, "
        "and what to do about it."
    ),
    "author": "Shahar Nechmad",
    "initials": "SN",
    "today": "Sunday, September 6, 2026",
    "accent": "#b4361f",   # stands in for the per-publication --publication-accent
    "issue": "No. 41",
    "social": [("X", "#"), ("LinkedIn", "#"), ("RSS", "#")],
}

# slug, title, dek, date (display), iso, image (None = no featured image), tags, read
POSTS = [
    {
        "slug": "agent-first-development-is-the-future",
        "title": "Agent First Development is The Future",
        "kicker": "Product strategy",
        "dek": "Cloudflare’s CEO predicted bots would outnumber humans online by 2027. "
               "It happened a year early — and your product probably isn’t ready.",
        "date": "September 2, 2026", "iso": "2026-09-02", "short": "Sep 2",
        "img": None,
        "tags": ["agent-first development", "api design", "product strategy"],
        "read": "9 min",
    },
    {
        "slug": "the-iran-war-is-not-really-about-iran",
        "title": "The Iran War Is Not Really About Iran",
        "kicker": "Geopolitics",
        "dek": "The US strike on Iran is a message aimed at Beijing. China buys 90–95% of "
               "Iran’s oil, and a destabilized regime puts that lifeline at risk.",
        "date": "March 4, 2026", "iso": "2026-03-04", "short": "Mar 4",
        "img": "iran.jpg",
        "tags": ["geopolitics", "china", "energy"],
        "read": "7 min",
    },
    {
        "slug": "openai-pentagon-deal-red-lines",
        "title": "OpenAI’s Pentagon Deal and the Red Lines Problem",
        "kicker": "AI &amp; policy",
        "dek": "OpenAI signed a Pentagon deal while the US military was already running Claude "
               "— the model it had officially blacklisted — on live operations.",
        "date": "March 1, 2026", "iso": "2026-03-01", "short": "Mar 1",
        "img": "pentagon.jpg",
        "tags": ["policy", "defense", "openai"],
        "read": "11 min",
    },
    {
        "slug": "should-ai-agents-be-friends",
        "title": "Should AI Agents be Friends?",
        "kicker": "Research",
        "dek": "Large-scale research shows agents simulate social behavior rather than genuinely "
               "socialize. The real question isn’t whether they can — it’s whether they should.",
        "date": "February 24, 2026", "iso": "2026-02-24", "short": "Feb 24",
        "img": "agents-friends.jpg",
        "tags": ["research", "multi-agent", "society"],
        "read": "8 min",
    },
    {
        "slug": "from-copilot-to-colleague",
        "title": "From Copilot to Colleague: The Five Pillars of an Agentic AI Strategy",
        "kicker": "Strategy",
        "dek": "Most “AI strategies” are a list of tools. Here is the structure that survives "
               "contact with an actual org chart.",
        "date": "February 20, 2026", "iso": "2026-02-20", "short": "Feb 20",
        "img": "copilot.jpg",
        "tags": ["strategy", "enterprise"],
        "read": "12 min",
    },
    {
        "slug": "the-hyper-learner",
        "title": "The Hyper Learner",
        "kicker": "Essay",
        "dek": "The most valuable skill of the next decade isn’t prompting. It’s the ability to "
               "absorb an entire field in a weekend.",
        "date": "February 18, 2026", "iso": "2026-02-18", "short": "Feb 18",
        "img": "hyperlearner.jpg",
        "tags": ["learning", "careers"],
        "read": "6 min",
    },
    {
        "slug": "github-agentic-workflows",
        "title": "GitHub’s Agentic Workflows and the Coming ‘Continuous AI’ Era",
        "kicker": "Tools",
        "dek": "What continuous integration did for tests, continuous AI is about to do for "
               "everything else a solo founder can’t staff.",
        "date": "February 17, 2026", "iso": "2026-02-17", "short": "Feb 17",
        "img": "github.jpg",
        "tags": ["tools", "github", "automation"],
        "read": "9 min",
    },
    {
        "slug": "how-i-10x-d-my-ai-coding-productivity",
        "title": "How I 10x’d My AI Coding Productivity (And You Can Too)",
        "kicker": "Practice",
        "dek": "Nine months of working almost entirely through coding agents, and the handful of "
               "habits that made the difference.",
        "date": "February 16, 2026", "iso": "2026-02-16", "short": "Feb 16",
        "img": "productivity.jpg",
        "tags": ["coding agents", "practice"],
        "read": "10 min",
    },
]

def smart_quotes(html):
    """Curl straight quotes and apostrophes in HTML *text*, never inside tags.

    The article body was scraped from a live page that serves straight marks
    inside its paragraphs while the deck and pull quotes use proper ones, so
    without this the concepts mix both. A global replace would corrupt
    `href="..."` and every other attribute, so the string is split on tags first
    and only the text runs are transformed. Idempotent: already-curled text
    passes through untouched.
    """
    out = []
    for part in _re.split(r"(<[^>]+>)", html):
        if part.startswith("<"):
            out.append(part)
            continue
        part = _re.sub(r"(?<=\w)'(?=\w)", "\u2019", part)          # contractions
        part = _re.sub(r"'(?=\d{2}s\b)", "\u2019", part)            # '90s
        text = part

        def single(m):
            before = text[m.start() - 1] if m.start() else " "
            return "\u2018" if before in " (\u201c[" else "\u2019"

        def double(m):
            before = text[m.start() - 1] if m.start() else " "
            return "\u201c" if before in " ([\u2014-" else "\u201d"

        part = _re.sub(r"'", single, part)
        part = _re.sub(r'"', double, part)
        out.append(part)
    return "".join(out)


ARTICLE_BODY = smart_quotes(
    open(os.path.join(HERE, "article-body.html")).read().strip()
)

ARTICLE = {
    **POSTS[0],
    "subtitle": "Mobile-first was a rethink of where you start. This is the same move, one layer deeper.",
    "hook": "In June 2026, bot and agent traffic passed human traffic on the internet for the "
            "first time. The winning products will be the ones an agent can actually use.",
    "body": ARTICLE_BODY,
    "words": 1740,
    "sections": [
        ("my-thesis", "My thesis"),
        ("start-with-the-api", "Start with the API, not the frontend"),
        ("frontend-too", "Agent First changes the frontend too"),
        ("not-agents-over-humans", "The point isn’t agents over humans"),
    ],
}

CITATIONS = [
    ("Bots have officially overtaken humans on the internet", "techspot.com",
     "https://www.techspot.com/news/112657-bots-have-officially-overtaken-humans-internet-cloudflare.html"),
    ("Bot web traffic has overtaken human web traffic, data shows", "nbcnews.com",
     "https://www.nbcnews.com/tech/tech-news/bot-web-traffic-overtaken-human-web-traffic-data-shows-rcna348522"),
    ("Agentic Commerce: A Guide for Businesses", "stripe.com",
     "https://stripe.com/resources/more/agentic-commerce"),
    ("Developing an open standard for agentic commerce", "stripe.com",
     "https://stripe.com/blog/developing-an-open-standard-for-agentic-commerce"),
    ("Introducing our agentic commerce solutions", "stripe.com",
     "https://stripe.com/blog/introducing-our-agentic-commerce-solutions"),
    ("Introducing the Agentic Commerce Suite", "stripe.com",
     "https://stripe.com/blog/agentic-commerce-suite"),
    ("How to prepare for agentic commerce: A technical field guide", "stripe.com",
     "https://stripe.com/guides/how-to-prepare-for-agentic-commerce-technical-field-guide"),
    ("Agents and AI on Stripe", "docs.stripe.com", "https://docs.stripe.com/agents"),
    ("WebMCP | AI on Chrome", "developer.chrome.com", "https://developer.chrome.com/docs/ai/webmcp"),
    ("WebMCP: Turn Your Website Into a Tool for AI Agents", "codewithseb.com",
     "https://www.codewithseb.com/blog/webmcp-website-ai-agent-tools-guide"),
    ("Building the business model for the agentic Internet", "blog.cloudflare.com",
     "https://blog.cloudflare.com/agentic-internet-bot-report/"),
    ("Model Context Protocol Introduction", "modelcontextprotocol.io",
     "https://modelcontextprotocol.io/introduction"),
    ("The agent-first approach to building products", "dev.to",
     "https://dev.to/adamklein/the-agent-first-approach-to-building-products-51oj"),
]

COMMENTS = [
    ("Dana R.", "September 3, 2026",
     "The point about not forking a separate “agent API” is the one I keep having to argue "
     "internally. Two surfaces means one of them rots."),
    ("Michael Osei", "September 3, 2026",
     "Curious how you’d sequence this for a team with an existing product. Do you retrofit the "
     "API coverage first, or start with llms.txt and discovery?"),
    ("Priya N.", "September 4, 2026",
     "The 89% token reduction number for WebMCP is what convinced me. That’s not a nice-to-have, "
     "that’s a cost line."),
]

def esc(s):
    return _html.escape(s, quote=True)
