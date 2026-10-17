import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

/**
 * `virtual:fa-catalog`: every free Font Awesome solid and brand icon as plain
 * data ({ name, style, terms, w, h, d }), built in Node at bundle time. The icon
 * picker lazy-loads it; because it is data rather than an import of the icon
 * packages, it lands in its own chunk instead of dragging the full icon sets
 * into the main bundle alongside the individually imported icons.
 */
function fontAwesomeCatalog(): Plugin {
  const id = 'virtual:fa-catalog';
  const resolved = `\0${id}`;
  type Def = { iconName: string; icon: [number, number, (string | number)[], string, string | string[]] };
  const flatten = (pack: Record<string, Def>, style: 'solid' | 'brands') => {
    const seen = new Set<string>();
    return Object.values(pack)
      .filter((d) => !seen.has(d.iconName) && seen.add(d.iconName))
      .map(({ iconName, icon: [w, h, aliases, , path] }) => ({
        name: iconName,
        style,
        terms: [iconName, ...aliases.filter((a) => typeof a === 'string')].join(' ').replace(/-/g, ' '),
        w,
        h,
        d: Array.isArray(path) ? path.join(' ') : path,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };
  return {
    name: 'fa-catalog',
    resolveId: (source) => (source === id ? resolved : null),
    load(source) {
      if (source !== resolved) return null;
      const require = createRequire(import.meta.url);
      const { fas } = require('@fortawesome/free-solid-svg-icons');
      const { fab } = require('@fortawesome/free-brands-svg-icons');
      return `export const SOLID = ${JSON.stringify(flatten(fas, 'solid'))};\nexport const BRANDS = ${JSON.stringify(flatten(fab, 'brands'))};\n`;
    },
  };
}

// Optional: develop against an already-running stack instead of rebuilding images.
//   ADMIN_DEV_PROXY=http://192.168.1.50:5099 VITE_API_URL=/api pnpm --filter @headtilts/admin dev
// API, upload and socket requests are forwarded there, presenting that origin
// (the only one the API's CORS allow-list accepts).
const devProxy = process.env.ADMIN_DEV_PROXY;
const proxy = devProxy
  ? {
      '/api': {
        target: devProxy,
        changeOrigin: true,
        configure: (p: { on: (event: 'proxyReq', cb: (req: { setHeader: (k: string, v: string) => void }) => void) => void }) =>
          p.on('proxyReq', (req) => req.setHeader('origin', devProxy)),
      },
      '/uploads': { target: devProxy, changeOrigin: true },
      '/socket.io': { target: devProxy, changeOrigin: true, ws: true },
    }
  : undefined;

export default defineConfig({
  // Always serve under /admin/ so module paths like /admin/@vite/client
  // are distinct from the web app's paths and proxy correctly in dev.
  base: '/admin/',

  plugins: [react(), fontAwesomeCatalog()],

  server: {
    port: 5174, // internal port — accessed through web proxy at localhost:5173/admin/
    host: true,
    proxy,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },

  // @headtilts/shared compiles to CommonJS. Vite must pre-bundle it to ESM
  // so named imports (e.g. PERMISSIONS) are available in the browser.
  optimizeDeps: {
    include: ['@headtilts/shared'],
    force: true,
    esbuildOptions: {
      target: 'es2020',
    },
  },
});
