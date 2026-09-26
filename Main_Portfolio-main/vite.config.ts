import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // The 3D engine (three.js + postprocessing) is lazy-loaded as one chunk behind the loader.
    chunkSizeWarningLimit: 1000,
  },
});
