export interface NavItem {
  title: string;
  slug: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Quick Start', slug: 'getting-started/quick-start' },
      { title: 'Dashboard', slug: 'getting-started/dashboard' },
      { title: 'Onboarding Checklist', slug: 'getting-started/onboarding-checklist' },
    ],
  },
  {
    title: 'Publications',
    items: [
      { title: 'Creating a Publication', slug: 'publications/creating-a-publication' },
      { title: 'Publication Settings', slug: 'publications/settings' },
      { title: 'Topics', slug: 'publications/topics' },
      { title: 'Scout Scheduling', slug: 'publications/scout-scheduling' },
      { title: 'Comments', slug: 'publications/comments' },
      { title: 'RSS & Atom Feeds', slug: 'publications/rss-feeds' },
      { title: 'Custom Domains', slug: 'publications/custom-domains' },
    ],
  },
  {
    title: 'Content Scout',
    items: [
      { title: 'How It Works', slug: 'content-scout/how-it-works' },
      { title: 'Browsing Ideas', slug: 'content-scout/browsing-ideas' },
      { title: 'Idea Actions', slug: 'content-scout/idea-actions' },
    ],
  },
  {
    title: 'Writing',
    items: [
      { title: 'Writing Sessions', slug: 'writing/sessions' },
      { title: 'The Workspace', slug: 'writing/workspace' },
      { title: 'Chat Panel', slug: 'writing/chat-panel' },
      { title: 'Draft Editor', slug: 'writing/draft-editor' },
      { title: 'Images', slug: 'writing/images' },
      { title: 'Writing Styles', slug: 'writing/writing-styles' },
    ],
  },
  {
    title: 'Publishing',
    items: [
      { title: 'Publish to Blog', slug: 'publishing/publish-to-blog' },
      { title: 'LinkedIn', slug: 'publishing/social-linkedin' },
      { title: 'X (Twitter)', slug: 'publishing/social-twitter' },
      { title: 'Editing Published Posts', slug: 'publishing/editing-posts' },
    ],
  },
  {
    title: 'Settings & Billing',
    items: [
      { title: 'Plans & Billing', slug: 'settings/billing' },
      { title: 'Social Connections', slug: 'settings/social-connections' },
      { title: 'Notifications', slug: 'settings/notifications' },
      { title: 'API Keys', slug: 'settings/api-keys' },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Overview', slug: 'api/overview' },
      { title: 'Endpoint Reference', slug: 'api/reference' },
    ],
  },
];

export function findCurrentSection(slug: string): NavSection | undefined {
  return navigation.find((section) =>
    section.items.some((item) => item.slug === slug)
  );
}

export function findPrevNext(slug: string): { prev?: NavItem; next?: NavItem } {
  const allItems = navigation.flatMap((s) => s.items);
  const index = allItems.findIndex((item) => item.slug === slug);
  return {
    prev: index > 0 ? allItems[index - 1] : undefined,
    next: index < allItems.length - 1 ? allItems[index + 1] : undefined,
  };
}
