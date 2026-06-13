import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  integrations: [mdx()],
  server: { port: 4323 },
  vite: {
    // Vite 8 (rolldown) requires resolve.tsconfigPaths to be set explicitly;
    // without it, @tailwindcss/vite's build-time resolver throws
    // "Missing field `tsconfigPaths` on BindingViteResolvePluginConfig".
    // Enabling native tsconfig path resolution populates the field.
    // (The SSR Astro apps get this implicitly via the Cloudflare adapter.)
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [tailwindcss()],
  },
});
