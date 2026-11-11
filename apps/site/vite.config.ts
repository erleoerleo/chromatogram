import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works from any sub-path (e.g. GitHub Pages /chromatogram/).
  base: './',
  plugins: [react()],
});
