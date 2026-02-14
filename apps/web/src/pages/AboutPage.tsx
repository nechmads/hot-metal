import { Link } from "react-router";
import {
  CheckCircleIcon,
  GlobeIcon,
  LinkedinLogoIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  PencilLineIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { PublicNavbar } from "@/components/public/PublicNavbar";

export function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <PublicNavbar />

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-10 md:pt-16">
        <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)]">
          <div className="relative">
            <img
              src="/images/hotmetas-press-machine.jpg"
              alt="A hot metal press machine."
              className="h-48 w-full object-cover md:h-64"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] md:text-4xl">
            About Hot Metal
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            Hot Metal was built out of a personal need: I’m a serial entrepreneur, I work long
            hours, and I never managed to keep a consistent content habit — even though I knew it
            mattered for brand, trust, and momentum.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            So I built the thing I wanted: a content engine that helps you show up consistently
            with high-quality posts — with a human in the loop, or fully automated when you’re
            ready.
          </p>

          <p className="mt-5 text-base font-semibold text-[var(--color-text-primary)]">
            — Shahar Nechmad, Hot Metal Founder
          </p>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8">
            <div className="mb-3 text-[var(--color-accent)]">
              <SparkleIcon size={20} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
              The problem we’re solving
            </h2>
            <p className="mt-2 text-base leading-relaxed text-[var(--color-text-muted)]">
              Writing one great post isn’t the hard part. Writing consistently — while running a
              company, shipping product, and living a life — is the hard part.
            </p>
            <p className="mt-3 text-base leading-relaxed text-[var(--color-text-muted)]">
              Hot Metal is designed around a simple idea: consistency builds authority, and
              authority compounds.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8">
            <div className="mb-3 text-[var(--color-accent)]">
              <CheckCircleIcon size={20} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
              How Hot Metal helps
            </h2>
            <ul className="mt-3 space-y-2 text-base leading-relaxed text-[var(--color-text-muted)]">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
                <span>Pick topics and a schedule you can sustain.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
                <span>
                  Scout researches the web and brings you fresh ideas and angles.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
                <span>
                  Write by talking to a professional writer agent (with your style).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
                <span>
                  Publish manually or enable auto-mode when you’re confident.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
                <span>
                  Run multiple publications, with RSS/Atom feeds for distribution.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8">
          <div className="mb-4 flex items-start gap-3">
            <div className="mt-1 text-[var(--color-accent)]">
              <NewspaperIcon size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
                Built by a builder
              </h2>
              <p className="mt-1 text-base text-[var(--color-text-muted)]">
                A bit of context, since you’re trusting us with your words.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <MiniCard
              icon={<PencilLineIcon size={18} />}
              title="Founder story"
              body="I’ve built and scaled products for years — and content was always the thing I ‘meant to do’ but never stuck to."
            />
            <MiniCard
              icon={<MagnifyingGlassIcon size={18} />}
              title="Obsessed with signal"
              body="If you’re going to write consistently, you need great inputs. Scout exists so you don’t drown in tabs."
            />
            <MiniCard
              icon={<GlobeIcon size={18} />}
              title="Own your output"
              body="Your content should be portable. Feeds and exports matter, because platforms come and go."
            />
          </div>

          <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                Shahar Nechmad
              </div>
              <div className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                Serial entrepreneur · “Hacking in AI” · San Francisco
              </div>
            </div>
            <a
              href="https://linkedin.com/in/nechmad"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              <LinkedinLogoIcon size={16} weight="fill" />
              LinkedIn
            </a>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center">
          <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
            Want to try it?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            Join the waitlist and we’ll onboard you in small batches. If Hot Metal can save you one
            Sunday night of “I should really post more,” it’s already worth it.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/waitlist"
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Join the waitlist
            </Link>
            <Link
              to="/faq"
              className="rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Read the FAQ
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border-default)] px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text-primary)]">Hot Metal</span>
        <span className="mx-2">·</span>
        <Link to="/about" className="hover:underline">
          About
        </Link>
        <span className="mx-2">·</span>
        <Link to="/faq" className="hover:underline">
          FAQ
        </Link>
        <span className="mx-2">·</span>
        <Link to="/waitlist" className="hover:underline">
          Waitlist
        </Link>
      </footer>
    </div>
  );
}

function MiniCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
      <div className="text-[var(--color-accent)]">{icon}</div>
      <div className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">
        {title}
      </div>
      <div className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
        {body}
      </div>
    </div>
  );
}

