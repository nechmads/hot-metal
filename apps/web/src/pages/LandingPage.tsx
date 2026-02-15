import { useAuth } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router";
import {
  PencilLineIcon,
  RocketLaunchIcon,
  NewspaperIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  GlobeIcon,
  LinkedinLogoIcon,
  PaintBrushIcon,
  RssIcon,
  LightningIcon,
} from "@phosphor-icons/react";
import { PublicNavbar } from "@/components/public/PublicNavbar";

/**
 * Public landing page — shows marketing content for visitors.
 * If the user is already signed in, redirects to /writing.
 * During Clerk's loading state, we show the landing content (no blank flash).
 */
export function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();

  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingContent />;
}

function LandingContent() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <PublicNavbar showWaitlistCta={false} />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <h2 className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)] md:text-5xl">
          Build authority—one great post at a time{" "}
          <span className="text-[var(--color-accent)]">
            (or on autopilot if you want)
          </span>
          .
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--color-text-muted)]">
          Build your personal brand by showing up consistently. Write faster,
          keep your voice, and turn topics into publish-ready posts day after
          day.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            to="/waitlist"
            className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Join the Waitlist
          </Link>
          <a
            href="#workflow"
            className="rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
          >
            See the workflow
          </a>
        </div>

        <p className="mx-auto mt-4 max-w-xl text-base text-[var(--color-text-muted)]">
          Early access invites + founder onboarding. No spam. No “post more on
          LinkedIn” guilt trips.
        </p>
      </section>

      {/* How it works */}
      <section
        id="workflow"
        className="mx-auto max-w-4xl px-6 pb-24 scroll-mt-24"
      >
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
            How it works
          </h3>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            Hot Metal is built for consistency. Set your topics and cadence
            once, then run a repeatable loop that keeps quality high without
            eating your whole week.
          </p>

          <ol className="mt-6 space-y-4">
            <WorkflowStep
              step="1"
              title="Pick the topics you want to be known for"
              description="Choose what you write about — and build an authoritative voice over time."
              isLast={false}
            />
            <WorkflowStep
              step="2"
              title="Select a publishing schedule"
              description="Daily, a few times a week, or whatever pace you can sustain."
              isLast={false}
            />
            <WorkflowStep
              step="3"
              title="Scout researches the web for you"
              description="We bring you the best ideas and angles to write on — so you don’t start from scratch."
              isLast={false}
            />
            <WorkflowStep
              step="4"
              title="Write by talking to our pro writer agent"
              description="Brainstorm, outline, draft, and refine through conversation — while keeping your voice."
              isLast={false}
            />
            <WorkflowStep
              step="5"
              title="Turn on auto-mode (optional)"
              description="Run human-in-the-loop until you’re confident — then let the schedule ship for you."
              isLast
            />
          </ol>
        </div>
      </section>

      {/* Beautiful publications included */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-primary)] p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
              <GlobeIcon size={32} weight="duotone" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
              Beautiful publications, automatically included
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
              Every publication you create gets its own stunning frontend —
              complete with customizable templates, lightning-fast RSS & Atom
              feeds, and zero setup required.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <PublicationFeatureCard
              icon={<PaintBrushIcon size={24} />}
              title="Choose your style"
              description="Pick from gorgeous templates to match your vibe — minimal, bold, editorial, or whatever feels right."
            />
            <PublicationFeatureCard
              icon={<LightningIcon size={24} />}
              title="Lightning-fast performance"
              description="Edge-optimized frontends that load instantly and scale effortlessly. Your readers will feel the difference."
            />
            <PublicationFeatureCard
              icon={<RssIcon size={24} />}
              title="RSS & Atom built-in"
              description="Standard feeds generated automatically. Perfect for syndicating to platforms or building your own audience beyond the walled gardens."
            />
          </div>

          <div className="mt-8 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-6 text-center">
            <p className="text-base text-[var(--color-text-primary)]">
              <span className="font-semibold">Write once, publish everywhere:</span>{" "}
              Use your beautiful frontend as the canonical home, share RSS feeds
              to aggregators, or export to Medium, Substack, and beyond — all
              from one source of truth.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="mb-8">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
            Top features
          </h3>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            Everything you need to generate quality content consistently — with
            as much automation (or control) as you want.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<MagnifyingGlassIcon size={28} />}
            title="Research on schedule"
            description="Scout researches real-world news and updates on your cadence and brings you fresh, high-signal ideas to write about."
          />
          <FeatureCard
            icon={<PencilLineIcon size={28} />}
            title="Professional writer agent (your voice)"
            description="Write by conversation with a pro writer agent that follows your tone and style — not a generic AI vibe."
          />
          <FeatureCard
            icon={<CheckCircleIcon size={28} />}
            title="Human-in-the-loop or fully automated"
            description="Review drafts before publishing, or enable auto-mode to run the schedule hands-free when you’re ready."
          />
          <FeatureCard
            icon={<NewspaperIcon size={28} />}
            title="Multiple publications & blogs"
            description="Manage multiple publications with separate topics, schedules, and writing styles — all in one place."
          />
          <FeatureCard
            icon={<LinkedinLogoIcon size={28} />}
            title="Social post variants"
            description="Generate network-ready promo posts for your content using each platform’s best practices (hooks, formatting, CTAs)."
          />
          <FeatureCard
            icon={<GlobeIcon size={28} />}
            title="Full ownership + RSS feeds"
            description="Your content stays yours. Export anytime, and get automatic RSS feeds for your publications."
          />
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
            Who it’s for
          </h3>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            If consistent, high-quality content is part of your growth strategy
            — this is your home base.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <AudienceCard
              icon={<PencilLineIcon size={24} />}
              title="Creators"
              bullets={[
                "Build your personal brand by showing up reliably.",
                "Stay in your voice — not a generic “AI tone.”",
                "Go from idea → post without the blank-page tax.",
              ]}
            />
            <AudienceCard
              icon={<RocketLaunchIcon size={24} />}
              title="Startups"
              bullets={[
                "Start SEO early. Consistency compounds.",
                "Turn product insights into publish-ready posts.",
                "Run human-in-the-loop now, automate later.",
              ]}
            />
            <AudienceCard
              icon={<NewspaperIcon size={24} />}
              title="Teams & brands"
              bullets={[
                "Build authority in your category over time.",
                "Keep quality high with workflow + guardrails.",
                "Create a content engine, not a one-off generator.",
              ]}
            />
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-base text-[var(--color-text-muted)]">
              Want early access? Join the waitlist and we’ll onboard you
              personally.
            </p>
            <Link
              to="/waitlist"
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Join the Waitlist
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
          FAQ
        </h3>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
          The questions you’re already thinking (and yes, we’ve been asked all
          of them).
        </p>

        <div className="mt-6 space-y-3">
          <FaqItem
            question="Is this fully automated?"
            answer="It can be. Most people start with human-in-the-loop: ideas + drafting help, then you review and ship. When your workflow feels dialed in, you can automate parts (or all) of the pipeline."
          />
          <FaqItem
            question="Will it sound like me (or my brand)?"
            answer="That’s the point. Hot Metal supports writing styles and iteration, so you can keep a consistent voice over time — not a different personality every Tuesday."
          />
          <FaqItem
            question="Do I still control what gets published?"
            answer="Always. You can review drafts, compare versions, and use guardrails before anything ships. Automation is opt-in, not a trap door."
          />
          <FaqItem
            question="What kind of content can I create?"
            answer="Long-form blog posts, short-form social variants, and repeatable series. The focus is quality + consistency: a steady cadence that builds authority."
          />
          <FaqItem
            question="When do I get access?"
            answer="We’re onboarding in small batches so we can support people properly. Join the waitlist and you’ll get an invite as soon as your spot opens."
          />
        </div>

        <div className="mt-10 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center">
          <h4 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)] md:text-xl">
            Ready to build authority without burning out?
          </h4>
          <p className="mx-auto mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            Join the waitlist. We’ll get you set up with a workflow you can
            actually stick to.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/waitlist"
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Join the Waitlist
            </Link>
            <a
              href="#workflow"
              className="rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              See the workflow
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border-default)] px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text-primary)]">
          Hot Metal
        </span>
        <span className="mx-2">·</span>
        <Link to="/about" className="hover:underline">
          About
        </Link>
        <span className="mx-2">·</span>
        <Link to="/faq" className="hover:underline">
          FAQ
        </Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:underline">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:underline">
          Terms
        </Link>
        <span className="mx-2">·</span>
        <Link to="/waitlist" className="hover:underline">
          Waitlist
        </Link>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6">
      <div className="mb-3 text-[var(--color-accent)]">{icon}</div>
      <h3 className="mb-2 text-base font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function WorkflowStep({
  step,
  title,
  description,
  className,
  isLast,
}: {
  step: string;
  title: string;
  description: string;
  className?: string;
  isLast?: boolean;
}) {
  return (
    <li
      className={[
        "list-none rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start gap-4">
        <div className="relative">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold text-white">
            {step}
          </div>
          {!isLast ? (
            <div className="absolute left-1/2 top-9 h-[calc(100%+12px)] w-px -translate-x-1/2 bg-[var(--color-border-default)]" />
          ) : null}
        </div>
        <div>
          <div className="text-base font-semibold text-[var(--color-text-primary)]">
            {title}
          </div>
          <div className="mt-1 text-base leading-relaxed text-[var(--color-text-muted)]">
            {description}
          </div>
        </div>
      </div>
    </li>
  );
}

function AudienceCard({
  icon,
  title,
  bullets,
}: {
  icon: React.ReactNode;
  title: string;
  bullets: string[];
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-6">
      <div className="mb-3 text-[var(--color-accent)]">{icon}</div>
      <h4 className="text-lg font-semibold text-[var(--color-text-primary)]">
        {title}
      </h4>
      <ul className="mt-3 space-y-2 text-base leading-relaxed text-[var(--color-text-muted)]">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
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
      <p className="mt-3 text-base leading-relaxed text-[var(--color-text-muted)]">
        {answer}
      </p>
    </details>
  );
}

function PublicationFeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-6">
      <div className="mb-3 text-[var(--color-accent)]">{icon}</div>
      <h4 className="text-base font-semibold text-[var(--color-text-primary)]">
        {title}
      </h4>
      <p className="mt-2 text-base leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </p>
    </div>
  );
}
