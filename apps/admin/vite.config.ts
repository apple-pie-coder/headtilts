import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Always serve under /admin/ so module paths like /admin/@vite/client
  // are distinct from the web app's paths and proxy correctly in dev.
  base: '/admin/',

  plugins: [react()],

  server: {
    port: 5174, // internal port — accessed through web proxy at localhost:5173/admin/
    host: true,
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
