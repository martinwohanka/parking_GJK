import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Kořen projektu určíme napevno. Bez toho si ho Next.js odvozuje podle
  // nalezených lockfilů a při nepovedeném `npm install` mimo projekt
  // (např. v domovské složce) může sáhnout vedle.
  outputFileTracingRoot: projectRoot,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
