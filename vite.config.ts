import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For GitHub Pages root deployment
const base = '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020'
  },
  worker: {
    format: 'es'
  },
});
