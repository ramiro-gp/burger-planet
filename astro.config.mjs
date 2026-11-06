import { defineConfig } from 'astro/config';
import tailwind from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  output: 'static',
  devToolbar: { enabled: false },
  vite: { plugins: [tailwind()] },
});
