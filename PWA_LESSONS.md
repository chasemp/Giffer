# PWA Lessons Learned

## GitHub Pages Deployment Issues & Solutions

### The Problem We Keep Relearning

GitHub Pages only serves from:
- Root directory (`/`)
- `docs/` folder

**NOT** from `dist/` or any other custom build folder.

### Common Symptoms
- Blank white page on GitHub Pages
- 404 errors for assets (JS, CSS files)
- Site loads but shows development version instead of production build

### Root Cause Analysis
1. **Wrong serving location**: GitHub Pages serves from root, but build outputs to `dist/`
2. **Missing .nojekyll**: Jekyll processes files and can break React apps
3. **Incorrect base path**: Vite config may have wrong base URL
4. **CNAME in wrong location**: Custom domain file needs to be in served directory

### Solution: Optimize for Root Deployment

#### 1. Update Vite Configuration
```typescript
// vite.config.ts
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
```

#### 2. Update GitHub Actions Workflow
```yaml
# .github/workflows/gh-pages.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install
        run: npm ci || npm i

      - name: Build
        run: npm run build

      - name: Prepare for root deployment
        run: |
          # Copy built files to root for GitHub Pages
          cp -r dist/* .
          # Add CNAME for custom domain
          echo "your-domain.com" > CNAME
          # Add .nojekyll to prevent Jekyll processing
          touch .nojekyll

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

#### 3. Add Local Build Script
```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:deploy": "npm run build && cp -r dist/* . && echo 'your-domain.com' > CNAME && touch .nojekyll",
    "preview": "vite preview --port 5173"
  }
}
```

### Key Files for GitHub Pages
- `CNAME` - Custom domain configuration
- `.nojekyll` - Prevents Jekyll from processing files
- `index.html` - Must be the production build version
- `assets/` - Built JS, CSS, and other assets
- `manifest.json` - PWA manifest
- `sw.js` - Service worker

### Debugging Checklist
1. ✅ Check if GitHub Pages is serving from root
2. ✅ Verify `index.html` is production build (has script tags with hashed filenames)
3. ✅ Confirm `.nojekyll` file exists in root
4. ✅ Check `CNAME` file is in root for custom domains
5. ✅ Verify assets are accessible (e.g., `/assets/index-abc123.js`)
6. ✅ Check browser console for 404 errors
7. ✅ Test with hard refresh (Ctrl+F5)

### Common Mistakes
- ❌ Trying to serve from `dist/` folder
- ❌ Forgetting `.nojekyll` file
- ❌ Wrong base path in Vite config
- ❌ CNAME in wrong location
- ❌ Serving development `index.html` instead of built version

### Best Practices
- ✅ Always test locally with `npm run build:deploy`
- ✅ Use GitHub Actions for automated deployment
- ✅ Keep build artifacts in `.gitignore` except when deploying
- ✅ Use relative paths in manifest and service worker
- ✅ Test PWA functionality after deployment

### Quick Fix Commands
```bash
# Clean and rebuild for root deployment
rm -rf assets/ icons/ sw.js .nojekyll CNAME
npm run build:deploy
git add .
git commit -m "Deploy to root for GitHub Pages"
git push origin main
```

---

*Last updated: September 2024*
*This document captures lessons learned from multiple PWA deployments to GitHub Pages*