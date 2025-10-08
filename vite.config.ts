import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { copyFileSync } from 'fs';
import { fileURLToPath } from 'url';

// ES modules don't have __dirname, so we create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * BUILD SYSTEM (DEPLOYMENT MODEL):
 *
 * Source → Build → Deploy
 * /src   → /docs → GitHub Pages
 *
 * Development:
 * - root: 'src'                      → dev server serves from /src
 * - Run: npm run dev → http://localhost:3005
 *
 * Production Build:
 * - build.outDir: '../docs'          → builds to /docs directory
 * - build.emptyOutDir: true          → safe to clear /docs (only contains built files)
 * - base: './'                       → enables relative paths for GitHub Pages
 * - Run: npm run build → generates /docs
 *
 * Deployment:
 * - GitHub Pages serves from /docs directory on main branch
 * - /docs contains ONLY generated files (never edit directly!)
 * - Pre-commit hook automatically builds to /docs before commit
 * - See PORT_REGISTRY.md for port assignment (3005)
 *
 * ⚠️  CRITICAL: Never edit files in /docs manually - they are auto-generated!
 */

// Plugin to copy service worker to output root
function copyServiceWorker() {
  return {
    name: 'copy-service-worker',
    closeBundle: async () => {
      const swSource = resolve(__dirname, 'src/sw.ts')
      const swDest = resolve(__dirname, 'docs/sw.js')
      try {
        // Vite compiles sw.ts, we need to find the compiled version
        // For now, we'll compile it separately or use the TypeScript output
        // Since TypeScript is compiled by Vite, we'll handle this differently
        console.log('⚠️  Note: Service worker should be built separately')
        console.log('   Run: npx tsc src/sw.ts --outDir docs --target es2020 --lib es2020,webworker')
      } catch (error) {
        console.error('❌ Service worker note:', error)
      }
    }
  }
}

export default defineConfig({
  // Serve app files from `src/` during development
  root: 'src',
  // Static files (CNAME, manifest, icons) that should be copied as-is
  publicDir: '../public',
  // Use relative base to support GitHub Pages deployment
  base: './',
  plugins: [
    react(),
    copyServiceWorker()
  ],
  build: {
    // Output into /docs directory at repository root for GitHub Pages deployment
    // Note: Relative to 'root' (src/), so ../docs = repo root /docs
    outDir: '../docs',
    // Safe to empty /docs since it only contains built files
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html')
      }
    }
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  server: {
    port: 3005,        // Registered in PORT_REGISTRY.md
    host: '0.0.0.0',   // Allow network access
    strictPort: true   // Fail fast if port is taken (prevents conflicts)
  }
});
