/**
 * Pre-render public marketing pages to static HTML at build time.
 *
 * Runs after `vite build`. Reads the built index.html as a template (to extract
 * hashed CSS/JS asset references), renders each page component to HTML using
 * react-dom/server + StaticRouter, and writes full HTML documents to dist/client/.
 *
 * Cloudflare's asset pipeline serves these static files directly for matching
 * routes; unmatched routes still fall back to index.html (SPA mode).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderToString } from "react-dom/server";
import React from "react";
import { StaticRouter } from "react-router";

import { LandingContent } from "../src/pages/LandingPage";
import { AboutPage } from "../src/pages/AboutPage";
import { FaqPage } from "../src/pages/FaqPage";
import { PrivacyPage } from "../src/pages/PrivacyPage";
import { TermsPage } from "../src/pages/TermsPage";

import { pages, type PageConfig } from "./prerender-config";

const DIST_CLIENT = join(import.meta.dirname, "../dist/client");

// ── Read the built index.html to extract hashed asset references ─────

const template = readFileSync(join(DIST_CLIENT, "index.html"), "utf-8");

// Extract all CSS <link> tags and JS <script> tags from the built template
const cssLinks = template.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || [];
const jsScripts =
  template.match(/<script[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g) || [];

// ── Component map ────────────────────────────────────────────────────

const componentMap: Record<string, React.FC> = {
  LandingContent,
  AboutPage,
  FaqPage,
  PrivacyPage,
  TermsPage,
};

// ── Render each page ─────────────────────────────────────────────────

for (const page of pages) {
  const Component = componentMap[page.component];
  if (!Component) {
    console.error(
      `Component "${page.component}" not found, skipping ${page.path}`
    );
    continue;
  }

  const html = renderToString(
    <StaticRouter location={page.path}>
      <div
        className="bg-white text-[#0a0a0a] antialiased transition-colors selection:bg-amber-200 selection:text-amber-900 dark:bg-[#0a0a0a] dark:text-[#fafafa]"
        style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
      >
        <Component />
      </div>
    </StaticRouter>
  );

  const fullHtml = buildHtmlDocument(page, html);

  const outputPath = join(DIST_CLIENT, page.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, fullHtml, "utf-8");

  console.log(`  Pre-rendered: ${page.path} -> ${page.outputPath}`);
}

console.log(`\nPre-rendered ${pages.length} pages.`);

// ── HTML document builder ────────────────────────────────────────────

function buildHtmlDocument(page: PageConfig, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeAttr(page.description)}" />
    <meta name="theme-color" content="#ffffff" />

    <title>${escapeHtml(page.title)}</title>

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Hot Metal" />
    <meta property="og:title" content="${escapeAttr(page.ogTitle)}" />
    <meta property="og:description" content="${escapeAttr(page.ogDescription)}" />
    <meta property="og:url" content="${escapeAttr(page.ogUrl)}" />
    <meta property="og:image" content="https://hotmetalapp.com/icons/web-app-manifest-512x512.png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:image:alt" content="Hot Metal logo" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeAttr(page.ogTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(page.ogDescription)}" />
    <meta name="twitter:image" content="https://hotmetalapp.com/icons/web-app-manifest-512x512.png" />
    <meta name="twitter:image:alt" content="Hot Metal logo" />

    <!-- Light mode by default -->
    <script>
      if (localStorage.theme === "dark") {
        document.documentElement.classList.add("dark");
      }
    </script>

    <!-- Favicon & icons -->
    <link rel="icon" href="/icons/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icons/favicon-96x96.png" type="image/png" sizes="96x96" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="manifest" href="/icons/site.webmanifest" />

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

    <style>
      html { background: #ffffff; }
      html.dark { background: #0a0a0a; }
    </style>

    ${cssLinks.join("\n    ")}
    ${jsScripts.join("\n    ")}
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="app">${bodyHtml}</div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
