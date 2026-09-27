import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The review engine reads these folders with fs at runtime, so they must ship with the serverless functions
  // (Vercel only bundles files it can trace from imports otherwise). The demo student project sits next to the app.
  outputFileTracingRoot: path.join(here, '..'),
  outputFileTracingIncludes: {
    '/api/**/*': ['./challenges/**/*', '../student-project/**/*', '../demo-solutions/**/*'],
  },
};

export default nextConfig;
