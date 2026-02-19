const BASE_URL = process.env.SITE_URL ?? "https://hotmetalapp.com";

export type PageConfig = {
  path: string;
  outputPath: string;
  component: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
};

export const pages: PageConfig[] = [
  {
    path: "/",
    outputPath: "index.html",
    component: "LandingContent",
    title: "Hot Metal — AI-Powered Writing Assistant",
    description:
      "Build authority — one great post at a time. Write faster, keep your voice, and turn topics into publish-ready posts on autopilot.",
    ogTitle: "Hot Metal — Build authority, one great post at a time",
    ogDescription:
      "Write faster, keep your voice, and turn topics into publish-ready posts. Human-in-the-loop or fully automated — your call.",
    ogUrl: BASE_URL,
  },
  {
    path: "/about",
    outputPath: "about/index.html",
    component: "AboutPage",
    title: "About — Hot Metal",
    description:
      "Learn about Hot Metal, the AI-powered writing assistant built for consistency and authority.",
    ogTitle: "About Hot Metal",
    ogDescription:
      "Hot Metal was built out of a personal need — a content engine that helps you show up consistently with high-quality posts.",
    ogUrl: `${BASE_URL}/about`,
  },
  {
    path: "/faq",
    outputPath: "faq/index.html",
    component: "FaqPage",
    title: "FAQ — Hot Metal",
    description:
      "Frequently asked questions about Hot Metal's workflow, Scout, writing agent, publishing, and more.",
    ogTitle: "FAQ — Hot Metal",
    ogDescription:
      "The most common questions about consistency, Scout, the writer agent, publishing, feeds, and privacy.",
    ogUrl: `${BASE_URL}/faq`,
  },
  {
    path: "/privacy",
    outputPath: "privacy/index.html",
    component: "PrivacyPage",
    title: "Privacy Policy — Hot Metal",
    description:
      "Hot Metal's privacy policy — how we collect, use, and safeguard your information.",
    ogTitle: "Privacy Policy — Hot Metal",
    ogDescription:
      "Learn how Hot Metal handles your data, privacy rights, and our commitment to security.",
    ogUrl: `${BASE_URL}/privacy`,
  },
  {
    path: "/terms",
    outputPath: "terms/index.html",
    component: "TermsPage",
    title: "Terms of Service — Hot Metal",
    description:
      "Hot Metal's terms of service — your agreement for using the platform.",
    ogTitle: "Terms of Service — Hot Metal",
    ogDescription:
      "Terms governing your use of Hot Metal, the AI-powered writing assistant.",
    ogUrl: `${BASE_URL}/terms`,
  },
];
