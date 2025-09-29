# PWA GIF Maker — Project Plan (MVP First)

## Goal (MVP)

Let a user pick a local video, trim/select a short segment, preview it, and export a downloadable/shareable GIF — all client-side in the browser, offline-capable as a PWA.

## High-level Architecture

- Frontend SPA (static): Vite + React + TypeScript (deployable to GitHub Pages)
- Client-side processing:
  - Recommended: ffmpeg.wasm for trimming, palette generation, GIF encoding
  - Alternative (lighter): Canvas frame extraction + gif.js / gifski-wasm
- Workerization: Dedicated Web Worker for heavy processing
- Storage & share: File System Access API fallback to download; Web Share API
- PWA basics: `manifest.json`, service worker to cache app shell
- Hosting: GitHub Pages (hash routing or base path config)

## Stack Choices & Rationale

- Framework: React + Vite
- State/UI: Minimal component state; simple CSS
- WASM / encoding:
  - ffmpeg.wasm — robust, featureful, heavier download
  - gif.js — small, simpler, lower quality
  - gifski-wasm — great quality, heavy
- Dev tooling: Vite, TypeScript
- CI/Build: GitHub Actions → gh-pages

## Recommended Approach (MVP)

Start with ffmpeg.wasm for high-quality GIF path (palettegen + paletteuse), but lazy-load and run in a Web Worker to keep UI responsive and mobile-friendly. Consider adding a lighter JS-only path later if needed.

## UI / UX Flow (MVP)

1) Landing / Upload
- File picker and drag & drop

2) Trim & preview
- Video element with in/out trim controls
- FPS selector, scale/resize selector
- Duration + estimated frame count

3) GIF export options
- Quality presets: Low / Medium / High
- Loop toggle
- FPS slider, target width/height (maintain aspect)

4) Export step
- Start processing → show progress
- Show GIF preview and actions: Download, Save, Share

5) Share flow
- Web Share API when supported
- Fallback: download link; optional upload to third-party later

6) Feedback & retry
- Allow re-export with different presets

## Implementation Details

### Video → frames (if using canvas path)
- Use `<video>` with `requestVideoFrameCallback` when available
- Seek video and draw frames to `<canvas>`/`OffscreenCanvas`

### Encoding with ffmpeg.wasm (chosen for MVP)
- Lazy-load ffmpeg.wasm in a Web Worker
- Run commands:
  1) Generate palette: `-vf fps=...,scale=...,palettegen`
  2) Encode GIF using palette: `paletteuse` with proper dithering and loop settings

### Performance & Memory
- Perform all encoding in Worker; UI thread posts progress updates
- Limit max frames by default (short segments, moderate FPS)
- Downscale width for mobile defaults (e.g., 360–480px)

### File APIs & Saving
- Prefer `showSaveFilePicker()` when available
- Fallback to `<a download>` with `Blob` URL

### Sharing
- `navigator.canShare` + `navigator.share` with a `File` when supported
- Fallback to download

## PWA & GitHub Pages Specifics

- PWA: `manifest.json`, icons, basic service worker caching of app shell
- GitHub Pages: configure Vite `base` or inject via env; ensure WASM paths resolve
- Use GitHub Actions to build and deploy to Pages

## Security & Privacy

- All processing is client-side by default
- Warn user on any optional uploads (future feature)
- HTTPS enforced by GitHub Pages

## MVP Checklist

- [x] Project scaffold (Vite + React + TS)
- [ ] File picker / drag-and-drop video upload
- [ ] Video preview with trim controls
- [x] ffmpeg.wasm worker wrapper (initial)
- [ ] Export pipeline wiring (UI → worker → GIF)
- [ ] Download button + Web Share API
- [x] PWA manifest + service worker (basic)
- [x] GitHub Pages workflow & Vite base config
- [ ] UI polish: presets, progress UI, error handling

## Next Features (post-MVP)

- Text overlay & stickers: draw overlays on frames before encoding
- Animated WebP export
- Optional high-quality alternative via gifski-wasm
- Upload & share link generation (serverless target)
- Template library and social presets

## Risks & Tradeoffs

- WASM size: lazy-load, warn user when loading heavy artifacts
- Memory/mobile limits: constrain segment length, FPS, and width defaults
- Browser compatibility: progressive enhancement for FS Access, Share API, OffscreenCanvas

## Repo Layout (Suggested)

```
/src
  /components
    VideoUploader.tsx
    TrimEditor.tsx
    GifExportControls.tsx
    PreviewModal.tsx
  /workers
    ffmpeg.worker.ts
index.html
manifest.json
public/sw.js
vite.config.ts
```

## Deployment Steps (GitHub Pages)

1) Ensure default branch `main`
2) Settings → Pages → Build & deployment: GitHub Actions
3) Push to `main`; workflow builds `dist/` and deploys
4) If deploying to `/<repo>/`, set `VITE_BASE=/<repo>/` (workflow includes this)