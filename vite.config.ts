import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For GitHub Pages, set base to '/<repo>/' when deploying. We'll read from env.
const base = (process.env && process.env['VITE_BASE']) || '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2020'
  },
  worker: {
    format: 'es'
  },
});
