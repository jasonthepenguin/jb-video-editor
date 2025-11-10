# JB Video Editor

A no-backend video editor playground built with React, TypeScript, and Vite. Everything runs locally in the browser: import a clip, preview it, scrub a lightweight timeline, and inspect metadata as we flesh out future features.

## Getting started

```bash
npm install
npm run dev
```

The dev server defaults to `http://localhost:5173`. Because processing happens fully on the client, no additional services are required.

## Available scripts

- `npm run dev` – start the Vite dev server with hot reloading.
- `npm run build` – produce an optimized production build in `dist/`.
- `npm run preview` – serve the production build locally for a quick sanity check.

## Current surface area

- Local-only library panel with drag/browse import flow.
- Preview player connected to a timeline scrubber so we can test the interaction loop.
- Inspector panel that reflects metadata for the active clip (name, size, mime, derived duration).
- Static storyboard-style timeline blocks to sketch the future editing experience.

## Next ideas

1. Move video decoding/transcoding into a dedicated worker via `ffmpeg.wasm`.
2. Persist projects in IndexedDB so edits survive refreshes and offline sessions.
3. Add multi-track timeline data structures plus snapping/selection interactions.
