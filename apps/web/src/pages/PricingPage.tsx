import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useUser } from "@clerk/react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { PublicFooter } from "@/components/public/PublicFooter";
import { usePaddle } from "@/hooks/usePaddle";
import { PADDLE_PRICE_IDS } from "@/lib/paddle-config";

/* ------------------------------------------------------------------ */
/*  Feature lists                                                      */
/* ------------------------------------------------------------------ */

const CREATOR_FEATURES = [
  "2 publications",
  "3 topics per publication",
  "3 auto-published posts/week",
  "Built-in writing styles",
  "Unlimited AI writing sessions",
  "Unlimited social publishing",
  "AI image generation",
  "All templates",
  "RSS/Atom feeds",
  "Reader comments",
];

const GROWTH_FEATURES = [
  "5 publications",
  "Unlimited topics",
  "10 auto-published posts/week",
  "All scout schedules (including multiple times/day)",
  "Up to 5 custom writing styles",
  "Priority support",
];

interface EnterpriseFeature {
  label: string;
  planned?: boolean;
}

const ENTERPRISE_FEATURES: EnterpriseFeature[] = [
  { label: "Unlimited publications" },
  { label: "Unlimited posts/week" },
  { label: "Unlimited writing styles" },
  { label: "Custom domain", planned: true },
  { label: "Team collaboration", planned: true },
  { label: "Custom templates", planned: true },
  { label: "API access", planned: true },
  { label: "SSO", planned: true },
  { label: "Dedicated support & SLA" },
];

/* ------------------------------------------------------------------ */
/*  Price preview hook                                                 */
/* ------------------------------------------------------------------ */

interface LocalizedPrice {
  monthly: string | null;
  yearly: string | null;
  yearlyPerMonth: string | null;
  savingsPercent: number;
}

function usePricePreview() {
  const [prices, setPrices] = useState<LocalizedPrice>({
    monthly: null,
    yearly: null,
    yearlyPerMonth: null,
    savingsPercent: 0,
  });

  useEffect(() => {
    async function fetchPrices() {
      try {
        // Dynamic import to access Paddle's price preview without the full SDK init
        const { initializePaddle } = await import("@paddle/paddle-js");
        const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
        if (!token) return;

        const environment =
          import.meta.env.VITE_PADDLE_ENVIRONMENT === "production"
            ? "production"
            : "sandbox";

        const paddle = await initializePaddle({ token, environment });
        if (!paddle) return;

        const preview = await paddle.PricePreview({
          items: [
            { priceId: PADDLE_PRICE_IDS.growthMonthly, quantity: 1 },
            { priceId: PADDLE_PRICE_IDS.growthYearly, quantity: 1 },
          ],
        });

        const monthlyLine = preview.data.details.lineItems.find(
          (item) => item.price.id === PADDLE_PRICE_IDS.growthMonthly,
        );
        const yearlyLine = preview.data.details.lineItems.find(
          (item) => item.price.id === PADDLE_PRICE_IDS.growthYearly,
        );

        if (monthlyLine && yearlyLine) {
          const monthlyAmount = Number(
            monthlyLine.formattedTotals.subtotal.replace(/[^\d.]/g, ""),
          );
          const yearlyAmount = Number(
            yearlyLine.formattedTotals.subtotal.replace(/[^\d.]/g, ""),
          );
          const yearlyPerMonth = yearlyAmount / 12;

          // Extract currency symbol from formatted price
          const currencyMatch =
            monthlyLine.formattedTotals.subtotal.match(/^[^\d]+/);
          const currencySymbol = currencyMatch ? currencyMatch[0] : "$";

          const savings = Math.round(
            (1 - yearlyPerMonth / monthlyAmount) * 100,
          );

          setPrices({
            monthly: monthlyLine.formattedTotals.subtotal,
            yearly: yearlyLine.formattedTotals.subtotal,
            yearlyPerMonth: `${currencySymbol}${yearlyPerMonth.toFixed(2)}`,
            savingsPercent: savings,
          });
        }
      } catch {
        // Silently fail — fallback prices will be shown
      }
    }

    fetchPrices();
  }, []);

  return prices;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Static content for pre-rendering (no Clerk/Paddle hooks).
 * The real PricingPage below hydrates on the client with full interactivity.
 */
export function PricingContent() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <PublicNavbar />
      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <h2 className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)] md:text-5xl">
          Simple, transparent pricing
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--color-text-muted)]">
          Start free and upgrade when you&apos;re ready. No surprise fees, no
          credit card required to get started.
        </p>
      </section>
      <PublicFooter />
    </div>
  );
}

export function PricingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isSignedIn } = useUser();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const prices = usePricePreview();
  const autoCheckoutDone = useRef(false);

  const { ready: paddleReady, openCheckout } = usePaddle({
    onCheckoutCompleted: () => {
      toast.success("Welcome to Growth! Your account is being upgraded.");
      navigate("/dashboard");
    },
  });

  // Auto-open checkout after sign-up redirect (e.g. /pricing?checkout=monthly)
  useEffect(() => {
    if (autoCheckoutDone.current) return;
    if (!isSignedIn || !user?.id || !paddleReady) return;

    const checkoutBilling = searchParams.get("checkout");
    if (!checkoutBilling) return;

    autoCheckoutDone.current = true;
    setSearchParams({}, { replace: true });

    const priceId =
      checkoutBilling === "yearly"
        ? PADDLE_PRICE_IDS.growthYearly
        : PADDLE_PRICE_IDS.growthMonthly;

    openCheckout(priceId, user.primaryEmailAddress?.emailAddress, user.id);
  }, [
    isSignedIn,
    user,
    paddleReady,
    searchParams,
    setSearchParams,
    openCheckout,
  ]);

  const handleStartGrowth = useCallback(() => {
    if (!isSignedIn) {
      // Redirect to sign-up, then back here with checkout param
      navigate(
        `/sign-up?redirect_url=${encodeURIComponent(`/pricing?checkout=${billingPeriod}`)}`,
      );
      return;
    }

    const priceId =
      billingPeriod === "monthly"
        ? PADDLE_PRICE_IDS.growthMonthly
        : PADDLE_PRICE_IDS.growthYearly;

    openCheckout(priceId, user?.primaryEmailAddress?.emailAddress, user?.id);
  }, [billingPeriod, isSignedIn, user, openCheckout, navigate]);

  const displayPrice =
    billingPeriod === "monthly" ? prices.monthly : prices.yearlyPerMonth;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <PublicNavbar />

      {/* Header */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <h2 className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)] md:text-5xl">
          Simple, transparent pricing
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--color-text-muted)]">
          Start free and upgrade when you're ready. No surprise fees, no credit
          card required to get started.
        </p>

        {/* Billing toggle */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <span
            className={`text-sm font-medium ${billingPeriod === "monthly" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}
          >
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingPeriod === "yearly"}
            aria-label="Toggle annual billing"
            onClick={() =>
              setBillingPeriod((prev) =>
                prev === "monthly" ? "yearly" : "monthly",
              )
            }
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              billingPeriod === "yearly"
                ? "bg-[var(--color-accent)]"
                : "bg-[var(--color-border-default)]"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                billingPeriod === "yearly" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${billingPeriod === "yearly" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}
          >
            Yearly
          </span>
          {prices.savingsPercent > 0 && (
            <span className="ml-1 rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-xs font-semibold text-white">
              Save {prices.savingsPercent}%
            </span>
          )}
        </div>
      </section>

      {/* Pricing cards */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Creator — Free */}
          <PricingCard
            name="Creator"
            badge="Free forever"
            price="$0"
            priceSuffix="/ month"
            description="Everything you need to start building your content engine."
            features={CREATOR_FEATURES.map((f) => ({ label: f }))}
            cta={
              <Link
                to="/sign-up"
                className="block w-full rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-center text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
              >
                Get Started For Free
              </Link>
            }
          />

          {/* Growth — Paid, highlighted */}
          <PricingCard
            name="Growth"
            badge="Most Popular"
            price={displayPrice}
            priceSuffix={
              billingPeriod === "monthly" ? "/ month" : "/ month, billed yearly"
            }
            priceLoading={!displayPrice}
            description="For creators serious about growing their audience consistently."
            highlighted
            includedFrom="Everything in Creator, plus:"
            features={GROWTH_FEATURES.map((f) => ({ label: f }))}
            cta={
              <button
                type="button"
                onClick={handleStartGrowth}
                className="block w-full rounded-lg bg-[var(--color-accent)] px-6 py-3 text-center text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
              >
                Start Growth Plan
              </button>
            }
          />

          {/* Enterprise — Custom */}
          <PricingCard
            name="Enterprise"
            badge="For teams"
            price="Custom"
            description="Tailored for teams and organizations with advanced needs."
            includedFrom="Everything in Growth, plus:"
            features={ENTERPRISE_FEATURES}
            cta={
              <a
                href="mailto:hello@hotmetalapp.com?subject=Enterprise%20Plan%20Inquiry"
                className="block w-full rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-center text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
              >
                Contact Us
              </a>
            }
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
          Billing FAQ
        </h3>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
          Answers to the most common billing and plan questions.
        </p>

        <div className="mt-6 space-y-3">
          <FaqItem
            question="Can I try before I pay?"
            answer="Yes! The Creator tier is completely free forever. You get full access to the core writing workflow, AI sessions, social publishing, and more. No credit card required to sign up."
          />
          <FaqItem
            question="How does billing work?"
            answer="Paddle handles all billing, invoicing, and tax compliance. When you upgrade to Growth, you'll be charged monthly or yearly depending on your selection. Paddle supports credit cards, PayPal, and other local payment methods depending on your region."
          />
          <FaqItem
            question="Can I upgrade or downgrade?"
            answer="Yes. You can upgrade from Creator to Growth at any time, and changes take effect immediately. If you downgrade, you'll keep your current plan features until the end of your billing period."
          />
          <FaqItem
            question="What happens when I cancel?"
            answer="If you cancel your Growth subscription, your access continues until the end of the current billing period. After that, your account reverts to the Creator tier. Your content is never deleted."
          />
          <FaqItem
            question="What payment methods do you accept?"
            answer="Through Paddle, we accept all major credit and debit cards (Visa, Mastercard, American Express), PayPal, Apple Pay, Google Pay, and various local payment methods depending on your country."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center">
          <h4 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)] md:text-xl">
            Ready to grow your audience?
          </h4>
          <p className="mx-auto mt-2 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
            Start free, publish consistently, and upgrade when you need more
            power.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/sign-up"
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Get Started For Free
            </Link>
            <Link
              to="/"
              className="rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Learn more
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing card component                                             */
/* ------------------------------------------------------------------ */

interface PricingFeature {
  label: string;
  planned?: boolean;
}

interface PricingCardProps {
  name: string;
  badge: string;
  price: string | null;
  priceSuffix?: string;
  priceLoading?: boolean;
  description: string;
  highlighted?: boolean;
  includedFrom?: string;
  features: PricingFeature[];
  cta: React.ReactNode;
}

function PricingCard({
  name,
  badge,
  price,
  priceSuffix,
  priceLoading,
  description,
  highlighted,
  includedFrom,
  features,
  cta,
}: PricingCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        highlighted
          ? "border-[var(--color-accent)] bg-[var(--color-bg-card)] shadow-lg shadow-[var(--color-accent)]/10"
          : "border-[var(--color-border-default)] bg-[var(--color-bg-card)]"
      }`}
    >
      {/* Badge */}
      <span
        className={`mb-4 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
          highlighted
            ? "bg-[var(--color-accent)] text-white"
            : "bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]"
        }`}
      >
        {badge}
      </span>

      {/* Plan name */}
      <h3 className="text-xl font-bold text-[var(--color-text-primary)]">
        {name}
      </h3>

      {/* Price */}
      <div className="mt-3">
        {priceLoading ? (
          <div className="flex items-baseline gap-1">
            <div className="h-10 w-24 animate-pulse rounded-lg bg-[var(--color-border-default)]" />
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              {price}
            </span>
            {priceSuffix && (
              <span className="text-sm text-[var(--color-text-muted)]">
                {priceSuffix}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </p>

      {/* CTA */}
      <div className="mt-6">{cta}</div>

      {/* Features */}
      <div className="mt-6 flex-1">
        {includedFrom && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {includedFrom}
          </p>
        )}
        <ul className="space-y-2.5">
          {features.map((feature) => (
            <li key={feature.label} className="flex items-start gap-2.5">
              <CheckCircleIcon
                size={18}
                weight="fill"
                className="mt-0.5 shrink-0 text-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-text-primary)]">
                {feature.label}
                {feature.planned && (
                  <span className="ml-1 text-[var(--color-text-muted)]">
                    (planned)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ item                                                           */
/* ------------------------------------------------------------------ */

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
