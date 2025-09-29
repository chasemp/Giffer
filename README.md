# PWA GIF Maker

Create, save, and share GIFs from local video in your browser. Offline-capable PWA, uses ffmpeg.wasm for on-device processing.

## Run locally

```bash
npm i
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

- Ensure your default branch is `main`
- Enable GitHub Pages: Settings → Pages → Source: GitHub Actions
- Push to `main`; the included workflow builds and deploys

## Notes

- Large WASM (ffmpeg) is lazy loaded in a worker
- For Pages, `VITE_BASE` is injected so assets resolve under `/<repo>/`
# Giffer
Do it for the giffer
