import { Link } from "react-router";

type PublicNavbarProps = {
  /**
   * Show the "Join the waitlist" primary CTA.
   * Per product requirement: show on all public pages except the home page.
   */
  showWaitlistCta?: boolean;
};

export function PublicNavbar({ showWaitlistCta = true }: PublicNavbarProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 md:px-12">
      <Link to="/" className="text-xl font-bold tracking-tight">
        <span className="text-[var(--color-accent)]">Hot Metal</span>
      </Link>

      <nav className="flex items-center gap-4">
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

        {showWaitlistCta ? (
          <Link
            to="/waitlist"
            className="ml-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Join the waitlist
          </Link>
        ) : null}

        <Link
          to="/sign-in"
          className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
        >
          Sign in
        </Link>
      </nav>
    </header>
  );
}

