import { defineConfig } from 'vite';

// The quest world is served by the ProofArena Next.js app at /quest/ (same origin as its /api).
// `npm run build` writes straight into ../proofarena/public/quest.
// `npm run dev` proxies /api to the Next.js dev server on port 3000.
export default defineConfig({
  base: '/quest/',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    target: 'es2022',
    outDir: '../proofarena/public/quest',
    emptyOutDir: true,
    // The 3D engine (three.js + postprocessing) is lazy-loaded as one ~1.2 MB chunk (~400 KB gzipped)
    // while the loading screen and Gate Quiz are shown, so its size is expected.
    chunkSizeWarningLimit: 1500,
  },
});
