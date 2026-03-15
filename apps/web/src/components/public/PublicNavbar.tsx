import { useState } from "react";
import { Link } from "react-router";
import { useClerk } from "@clerk/clerk-react";
import { ListIcon, XIcon } from "@phosphor-icons/react";

/** Safe auth check that works outside ClerkProvider (e.g. during pre-render) */
function useIsSignedIn(): boolean {
  try {
    const clerk = useClerk();
    return !!clerk?.user;
  } catch {
    return false;
  }
}

type PublicNavbarProps = {
  /**
   * Show the "Get Started" primary CTA.
   * Per product requirement: show on all public pages except the home page.
   */
  showSignUpCta?: boolean;
};

export function PublicNavbar({ showSignUpCta = true }: PublicNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isSignedIn = useIsSignedIn();

  return (
    <header className="relative px-6 py-4 md:px-12">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight">
          <span className="text-[var(--color-accent)]">Hot Metal</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-4 sm:flex">
          <Link
            to="/ai-agents"
            className="text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:underline"
          >
            AI Agents
          </Link>
          <Link
            to="/about"
            className="text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:underline"
          >
            About
          </Link>
          <Link
            to="/faq"
            className="text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:underline"
          >
            FAQ
          </Link>
          <Link
            to="/blog"
            className="text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:underline"
          >
            Blog
          </Link>
          <Link
            to="/pricing"
            className="text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:underline"
          >
            Pricing
          </Link>
          <a
            href="https://docs.hotmetalapp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:underline"
          >
            Docs
          </a>

          {isSignedIn ? (
            <Link
              to="/dashboard"
              className="ml-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              {showSignUpCta ? (
                <Link
                  to="/sign-up"
                  className="ml-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
                >
                  Get Started For Free
                </Link>
              ) : null}
              <Link
                to="/sign-in"
                className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
              >
                Sign in
              </Link>
            </>
          )}
        </nav>

        {/* Mobile hamburger button */}
        <button
          type="button"
          className="flex items-center justify-center rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] sm:hidden"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
        >
          {mobileMenuOpen ? <XIcon size={22} /> : <ListIcon size={22} />}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen ? (
        <nav className="absolute left-0 right-0 top-full z-50 border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-6 pb-4 pt-2 shadow-md sm:hidden">
          <div className="flex flex-col gap-1">
            <Link
              to="/ai-agents"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              AI Agents
            </Link>
            <Link
              to="/about"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </Link>
            <Link
              to="/faq"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </Link>
            <Link
              to="/blog"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              Blog
            </Link>
            <Link
              to="/pricing"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <a
              href="https://docs.hotmetalapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </a>

            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border-default)] pt-2">
              {isSignedIn ? (
                <Link
                  to="/dashboard"
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  {showSignUpCta ? (
                    <Link
                      to="/sign-up"
                      className="rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Get Started For Free
                    </Link>
                  ) : null}
                  <Link
                    to="/sign-in"
                    className="rounded-lg border border-[var(--color-border-default)] px-4 py-2.5 text-center text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
