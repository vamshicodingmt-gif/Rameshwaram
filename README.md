# Jujutsu Kaisen · Gojo Satoru — Cursed Technique Simulator

A fully client-side webcam gesture simulator featuring:

- **Cursed Technique Lapse: Blue (蒼)** — left open palm → cyan gravitational orb, swirl, inward implosion.
- **Cursed Technique Reversal: Red (赫)** — right point/palm → crimson orb, radiating shockwaves, red lightning.
- **Hollow Purple (虛式「茈」)** — bring both hands together → purple singularity beam, screen shake, kanji flash, bass drop.
- **Domain Expansion: Unlimited Void (領域展開 ・ 無量空処)** — cross index + middle fingers (Gojo's seal) → pitch-black cosmic void (nebula, warp lines, twinkling stars), selfie-segmentation cutout of yourself, purple aura, giant 無量空処 kanji.

Powered by **MediaPipe Hands** and **MediaPipe Selfie Segmentation** running entirely in the browser (no server-side processing, no frames leave your device). Audio is generated live via the Web Audio API.

## Develop locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173 and click **ENABLE INFINITY** to grant camera access.

## Deploy to Vercel

This project is preconfigured for Vercel:

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Vercel will auto-detect Vite; build command `npm run build` and output directory `dist` are set in `vercel.json`. No environment variables required.
4. After deploy, open the HTTPS URL, click **ENABLE INFINITY**, and allow camera access.

> `vercel.json` sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers so MediaPipe's WASM runs in a cross-origin-isolated context, and marks the `/mediapipe` assets with a 1-year immutable cache.

## How the seal is detected

Using the 21 MediaPipe hand landmarks per hand:

- Index tip = landmark 8, Middle tip = landmark 12.
- Index MCP = landmark 5, Middle MCP = landmark 9.
- Ring (16) and pinky (20) must be folded (tip closer to wrist than PIP joint).
- Index + middle fingertips must be near in Y (same "height") and their X positions must be **flipped** relative to their MCP bases — i.e. index tip crosses over middle tip. That's exactly the X-flip trick from the prompt.

## Files of interest

- `src/App.jsx` — webcam, MediaPipe init, gesture state machine, HUD, overlays.
- `src/effects.js` — Canvas 2D particle/effects renderer (orbs, beam, cosmic bg, shake, lightning).
- `src/sound.js` — Web Audio bass-drop + charging hums.
- `src/loadMP.js` — MediaPipe script loader (served from `/mediapipe/`, no CDN).
- `scripts/copy-mediapipe.sh` — copies WASM/tflite assets from `node_modules` into `public/mediapipe` so they're available at runtime. Auto-runs before `dev` and `build`.
- `vercel.json` — deploy config with COOP/COEP headers and SPA rewrites.
