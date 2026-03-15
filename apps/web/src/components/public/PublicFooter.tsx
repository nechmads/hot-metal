import { Link } from "react-router";

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--color-border-default)] px-6 py-8 text-sm text-[var(--color-text-muted)]">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="whitespace-nowrap font-medium text-[var(--color-text-primary)]">
          Hot Metal
        </span>
        <Dot />
        <Link to="/ai-agents" className="whitespace-nowrap hover:underline">
          AI Agents
        </Link>
        <Dot />
        <Link to="/analyze" className="whitespace-nowrap hover:underline">
          Analyze
        </Link>
        <Dot />
        <Link to="/about" className="whitespace-nowrap hover:underline">
          About
        </Link>
        <Dot />
        <Link to="/faq" className="whitespace-nowrap hover:underline">
          FAQ
        </Link>
        <Dot />
        <Link to="/blog" className="whitespace-nowrap hover:underline">
          Blog
        </Link>
        <Dot />
        <Link to="/pricing" className="whitespace-nowrap hover:underline">
          Pricing
        </Link>
        <Dot />
        <a href="https://docs.hotmetalapp.com" target="_blank" rel="noopener noreferrer" className="whitespace-nowrap hover:underline">
          Docs
        </a>
        <Dot />
        <Link to="/privacy" className="whitespace-nowrap hover:underline">
          Privacy
        </Link>
        <Dot />
        <Link to="/terms" className="whitespace-nowrap hover:underline">
          Terms
        </Link>
        <Dot />
        <Link to="/sign-up" className="whitespace-nowrap hover:underline">
          Sign Up
        </Link>
      </div>
    </footer>
  );
}

function Dot() {
  return <span aria-hidden="true" className="text-[var(--color-border-default)]">·</span>;
}
