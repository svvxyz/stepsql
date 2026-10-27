/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps asset paths relative, so the build works from a GitHub Pages
// project subfolder (https://<user>.github.io/stepsql/) or any other static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The SQL parser and the code editor make up most of the bundle; one file is fine for a static site.
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
