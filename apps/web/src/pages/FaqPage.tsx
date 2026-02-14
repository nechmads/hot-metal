import { Link } from "react-router";
import {
  CheckCircleIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  PencilLineIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { PublicNavbar } from "@/components/public/PublicNavbar";

type Faq = {
  question: string;
  answer: React.ReactNode;
};

type FaqSection = {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  faqs: Faq[];
};

export function FaqPage() {
  const sections: FaqSection[] = [
    {
      id: "product",
      title: "Product & workflow",
      description: "What Hot Metal is, and how people actually use it.",
      icon: <SparkleIcon size={18} />,
      faqs: [
        {
          question: "What is Hot Metal?",
          answer: (
            <>
              Hot Metal helps you generate quality content consistently: you set
              topics and a cadence, Scout brings fresh ideas, and you write
              posts by talking to a writer agent in a focused workspace.
            </>
          ),
        },
        {
          question: "What’s the typical workflow?",
          answer: (
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Create a publication (or several).</li>
              <li>Add the topics you want to be known for.</li>
              <li>Set a Scout schedule and (optional) auto-mode.</li>
              <li>
                Review ideas → promote one → write in a session → publish.
              </li>
            </ol>
          ),
        },
        {
          question: "Do I need a publication to use it?",
          answer: (
            <>
              Yes — the workflow is publication-first (topics, schedules, and
              feeds live under a publication).
            </>
          ),
        },
      ],
    },
    {
      id: "scout",
      title: "Scout & ideas",
      description: "Where the ideas come from, and how to control them.",
      icon: <MagnifyingGlassIcon size={18} />,
      faqs: [
        {
          question: "What does Scout do?",
          answer: (
            <>
              Scout researches the web for your topics on a schedule (or on
              demand) and generates a list of fresh ideas with angles,
              summaries, and source links.
            </>
          ),
        },
        {
          question: "Can I choose when Scout runs?",
          answer: (
            <>
              Yep. You can run Scout manually, or set a schedule per publication
              (daily, multiple times per day, or every N days) with timezone
              support.
            </>
          ),
        },
        {
          question: "How do topics affect Scout?",
          answer: (
            <>
              Topics are your “authority targets.” Each topic can be
              active/inactive and has a priority. Scout uses your active topics
              to find relevant news and generate ideas.
            </>
          ),
        },
        {
          question:
            "What are idea statuses (New / Reviewed / Promoted / Dismissed)?",
          answer: (
            <>
              They help you triage. Promoting an idea creates a writing session
              seeded with that idea’s context so the writer agent can start
              drafting immediately.
            </>
          ),
        },
      ],
    },
    {
      id: "writing",
      title: "Writing, voice, and styles",
      description: "How the writer agent works — and how you keep your voice.",
      icon: <PencilLineIcon size={18} />,
      faqs: [
        {
          question: "How do I write a post?",
          answer: (
            <>
              You write in a session. The workspace is split into chat + draft,
              so you can brainstorm and revise via conversation while the draft
              updates in real time.
            </>
          ),
        },
        {
          question: "Can the writer match my tone and voice?",
          answer: (
            <>
              Yes. You can pick a Writing Style for a publication or session.
              Styles can be written manually as a prompt, or learned from a URL
              to approximate an existing writing voice.
            </>
          ),
        },
        {
          question: "Do you have version history?",
          answer: (
            <>
              Drafts are versioned inside a session. You can switch versions and
              copy the current draft from the draft panel.
            </>
          ),
        },
      ],
    },
    {
      id: "publishing",
      title: "Publishing & automation",
      description:
        "Human-in-the-loop vs. auto-mode, plus what publishing looks like today.",
      icon: <CheckCircleIcon size={18} />,
      faqs: [
        {
          question: "Is Hot Metal fully automated?",
          answer: (
            <>
              It can be. Most people start human-in-the-loop (ideas + drafting
              help, then review and publish). When you’re ready, auto-mode can
              run parts of the pipeline on your schedule.
            </>
          ),
        },
        {
          question: "Do I control what gets published?",
          answer: (
            <>
              Always. In manual mode, nothing publishes without you clicking
              Publish. Auto-mode is opt-in per publication.
            </>
          ),
        },
        {
          question: "What fields can I set at publish time?",
          answer: (
            <>
              Slug, author, tags, excerpt, and hook. The app can also generate
              hook/excerpt/tags for you when you open the publish modal.
            </>
          ),
        },
        {
          question: "Can I publish to LinkedIn?",
          answer: (
            <>
              Yes, if you connect LinkedIn in Settings. Then you can choose to
              also publish to LinkedIn when publishing a post.
            </>
          ),
        },
      ],
    },
    {
      id: "publications",
      title: "Publications & blogs",
      description: "Multi-publication support and how it’s organized.",
      icon: <NewspaperIcon size={18} />,
      faqs: [
        {
          question: "Can I manage multiple publications and blogs?",
          answer: (
            <>
              Yes. Publications have their own topics, schedules, and writing
              styles — and you can publish a draft to one or multiple
              publications.
            </>
          ),
        },
        {
          question: "Can I publish the same post to multiple publications?",
          answer: (
            <>
              Yes. In the publish modal you can select multiple publications and
              publish the draft to all of them.
            </>
          ),
        },
      ],
    },
    {
      id: "feeds",
      title: "Ownership, feeds, and export",
      description: "Your content, your distribution.",
      icon: <GlobeIcon size={18} />,
      faqs: [
        {
          question: "Do I get RSS/Atom feeds?",
          answer: (
            <>
              Yes. Each publication can expose RSS and Atom feeds. You’ll find
              the feed links on the publication home page (and you can enable
              partial vs full-content feeds in settings).
            </>
          ),
        },
        {
          question: "Do I own my content?",
          answer: (
            <>
              Yes — you own what you write. We store your drafts and published
              posts so the product can work, and you can always copy your drafts
              out of the app.
            </>
          ),
        },
        {
          question: "Can I export all my content?",
          answer: (
            <>
              Today: you can copy drafts from the editor and use RSS/Atom feeds
              for published posts. Bulk export is planned.
            </>
          ),
        },
      ],
    },
    {
      id: "privacy",
      title: "Privacy & security",
      description: "The serious stuff (kept short and human-readable).",
      icon: <ShieldCheckIcon size={18} />,
      faqs: [
        {
          question: "How is authentication handled?",
          answer: (
            <>
              We use Clerk for authentication. Protected pages require sign-in,
              and your publications and sessions are scoped to your account.
            </>
          ),
        },
        {
          question: "Is my writing sent to third-party services?",
          answer: (
            <>
              Yes — the writer agent and Scout rely on external AI/research
              services to generate drafts and ideas. If you’re writing something
              that shouldn’t leave your laptop, don’t paste it into an AI tool
              (including ours).
            </>
          ),
        },
        {
          question: "What happens when I connect LinkedIn?",
          answer: (
            <>
              You explicitly authorize LinkedIn via OAuth. You can disconnect at
              any time in Settings, which removes the saved connection for your
              account.
            </>
          ),
        },
      ],
    },
    {
      id: "access",
      title: "Access, pricing, and rollout",
      description: "How to get in (and what to expect).",
      icon: <RocketLaunchIcon size={18} />,
      faqs: [
        {
          question: "How do I get access?",
          answer: (
            <>
              Join the waitlist. We onboard in small batches so we can support
              people properly.
            </>
          ),
        },
        {
          question: "Is there pricing information?",
          answer: (
            <>
              Not yet in-app. We’ll share pricing during early access as we
              learn what different user types actually need.
            </>
          ),
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <PublicNavbar />

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-10 md:pt-16">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] md:text-4xl">
            FAQ
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            The most common questions about consistency, Scout, the writer
            agent, publishing, feeds, and privacy. If you’re wondering it,
            someone else already asked it — loudly.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
              >
                {section.title}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <div className="mb-4 flex items-start gap-3">
                <div className="mt-1 text-[var(--color-accent)]">
                  {section.icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
                    {section.title}
                  </h2>
                  {section.description ? (
                    <p className="mt-1 text-base text-[var(--color-text-muted)]">
                      {section.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                {section.faqs.map((faq) => (
                  <FaqItem
                    key={faq.question}
                    question={faq.question}
                    answer={faq.answer}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
            Want early access?
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            Join the waitlist and we’ll onboard you in small batches.
            Consistency loves company.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/waitlist"
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Join the waitlist
            </Link>
            <Link
              to="/"
              className="rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Back to landing
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-[var(--color-border-default)] px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text-primary)]">
          Hot Metal
        </span>
        <span className="mx-2">·</span>
        <Link to="/about" className="hover:underline">
          About
        </Link>
        <span className="mx-2">·</span>
        <Link to="/" className="hover:underline">
          Home
        </Link>
        <span className="mx-2">·</span>
        <Link to="/waitlist" className="hover:underline">
          Waitlist
        </Link>
      </footer>
    </div>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
      <summary className="cursor-pointer list-none text-base font-semibold text-[var(--color-text-primary)]">
        <span className="flex items-start justify-between gap-4">
          <span>{question}</span>
          <span className="select-none text-[var(--color-text-muted)] transition-transform group-open:rotate-45">
            +
          </span>
        </span>
      </summary>
      <div className="mt-3 text-base leading-relaxed text-[var(--color-text-muted)]">
        {answer}
      </div>
    </details>
  );
}
