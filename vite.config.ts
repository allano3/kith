import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths: the app works from any sub-path (e.g. GitHub Pages /kith/).
  base: './',
  plugins: [react()],
});
