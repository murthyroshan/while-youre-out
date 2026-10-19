import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The site's pages share one header and footer: <!-- include:header --> pulls in src/partials/header.html.
const partials = (): Plugin => ({
  name: 'partials',
  // 'pre': the included markup (the stylesheets in head.html) is then bundled like the page's own
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html.replace(/<!--\s*include:([a-z-]+)\s*-->/g, (_m, name: string) => readFileSync(fileURLToPath(new URL(`./src/partials/${name}.html`, import.meta.url)), 'utf8')),
  },
});

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  // GitHub Pages serves the repository's docs/ folder at /while-youre-out/.
  base: '/while-youre-out/',
  plugins: [partials()],
  server: { port: 5176, host: '127.0.0.1' },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    target: 'es2022',
    rolldownOptions: {
      input: { index: page('index'), safety: page('safety'), how: page('how'), try: page('try'), judges: page('judges'), game: page('game') },
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
