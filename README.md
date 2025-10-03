# Pipkin 🐲
**The GIF Making Dragon**

Create, save, and share GIFs from local video files. Offline-capable PWA using ffmpeg.wasm for on-device video processing.

**Live Demo:** https://giffer.523.life

---

## ✨ Features

- 🎬 **Convert Videos to GIFs** - Process any local video file
- ⚡ **On-Device Processing** - Uses ffmpeg.wasm (no server needed)
- 📱 **PWA** - Install as an app, works offline
- 🔗 **Share Target** - Share videos directly from other apps
- 🎨 **Quality Options** - Choose low, medium, or high quality
- ⏱️ **Trim Videos** - Select start/end times
- 🎯 **Precise Control** - Adjust FPS, width, and loop settings

---

## 🚀 Quick Start

### Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3005)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Assigned Port:** 3005 (see `/PORT_REGISTRY.md` in peadoubleueh)

### Port Management

```bash
npm run port        # Show this project's port
npm run port:check  # Check if port is free
npm run port:kill   # Kill process on port 3005
npm run port:force  # Kill and restart dev server
```

---

## 📁 Project Structure

```
Giffer/
├── src/              # ✅ Source code (EDIT HERE)
│   ├── index.html    # Main HTML template
│   ├── main.tsx      # App entry point
│   ├── App.tsx       # Main React component
│   ├── sw.ts         # Service worker (TypeScript)
│   ├── styles.css    # App styles
│   └── workers/
│       └── ffmpeg.worker.ts  # FFmpeg web worker
├── public/           # ✅ Static assets (EDIT HERE)
│   ├── manifest.json # PWA manifest
│   ├── icons/        # App icons
│   └── logo.svg      # Logo
├── docs/             # 🤖 Auto-generated build output (NEVER EDIT)
├── vite.config.ts    # Build configuration
└── package.json      # Dependencies & scripts
```

**⚠️ CRITICAL:** Never edit files in `/docs` - they are auto-generated!

---

## 🏗️ Deployment Architecture

This project follows the **`/src → /docs` deployment pattern**.

### How It Works

1. **Edit** source files in `/src` and `/public`
2. **Build** with `npm run build` → generates `/docs`
3. **Commit** both `/src` and `/docs` to git
4. **Push** to main branch
5. **Deploy** GitHub Pages serves from `/docs` (live in ~2 min)

### GitHub Pages Setup

- **Settings** → Pages
- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/docs`

### Protection Layers

- `.gitattributes` - Marks `/docs` as generated code
- `.cursorrules` - Warns AI assistants about `/docs`
- `.gitignore` - Excludes build artifacts from root
- HTML comments - In-file warnings

---

## 🔧 Tech Stack

- **Frontend:** React 18 + TypeScript
- **Build Tool:** Vite 5
- **Video Processing:** @ffmpeg/ffmpeg (WASM)
- **PWA Features:** Service Worker, Web Share Target API
- **Styling:** Vanilla CSS (no framework)

---

## 📖 Documentation

For PWA development best practices, see the main documentation:

- **[PWA Quick Reference](../peadoubleueh/project-docs/PWA_QUICK_REFERENCE.md)** - Code snippets & troubleshooting
- **[Deployment Architecture](../peadoubleueh/project-docs/DEPLOYMENT_ARCHITECTURE.md)** - The `/src → /docs` pattern
- **[Multi-PWA Port Management](../peadoubleueh/project-docs/MULTI_PWA_PORT_MANAGEMENT.md)** - Managing multiple dev servers
- **[PWA Development Lessons](../peadoubleueh/project-docs/PWA_DEVELOPMENT_LESSONS.md)** - Complete guide index

---

## 🤝 Contributing

This project follows established PWA development patterns. Please:

1. ✅ Only edit files in `/src` and `/public`
2. ❌ Never edit files in `/docs` (auto-generated)
3. 🔧 Run `npm run build` before committing
4. 📝 Follow TypeScript and React best practices
5. 🧪 Test PWA features (offline, install, share target)

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file

---

## 🔗 Related Projects

- **[PWA Template](../peadoubleueh)** - Base template with documentation
- **Blockdoku** - Puzzle game PWA
- **CannonPop** - Physics game PWA
- **BustAGroove** - Music player PWA

**Live Demo:** https://giffer.523.life  
**Repository:** https://github.com/chasemp/Giffer
