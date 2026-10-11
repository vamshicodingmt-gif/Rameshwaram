// MediaPipe loader: forces the single-threaded WASM build so no COOP/COEP
// headers or SharedArrayBuffer are required. This makes it work on any static
// host (Vercel, Netlify, GitHub Pages, etc.) without special server config.
//
// Why: MediaPipe's default auto-detection picks the threaded SIMD WASM
// whenever SharedArrayBuffer exists, which requires Cross-Origin-Opener-Policy
// + Cross-Origin-Embedder-Policy headers to be set correctly on every asset
// including the page itself and third-party CDN resources (fonts, etc.).
// Forcing the single-threaded build removes that requirement entirely —
// hand/segmentation inference is still fast enough for real-time use.

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve(true);
    s.onerror = () => { console.warn('[loadMP] failed to load', src); resolve(false); };
    document.head.appendChild(s);
  });
}

async function waitForGlobal(name, ms = 8000) {
  const start = performance.now();
  while (performance.now() - start < ms) {
    if (window[name]) return window[name];
    await new Promise(r => setTimeout(r, 30));
  }
  return null;
}

let loaded = null;
export async function loadMediaPipe() {
  if (loaded) return loaded;
  loaded = (async () => {
    // Force single-threaded WASM path BEFORE loading MediaPipe.
    // This is the magic that removes the COOP/COEP requirement.
    try { delete window.SharedArrayBuffer; } catch (e) { window.SharedArrayBuffer = undefined; }
    window.SharedArrayBuffer = undefined;
    // Also neuter the wasm-feature detect for threads if possible by hiding Atomics.
    // (Some MP versions check `typeof Atomics !== 'undefined'`.)
    // We don't delete Atomics globally because it can break other things; instead
    // we rely on SAB being undefined.

    // Load solution scripts (camera_utils / drawing_utils are NOT required for
    // programmatic Hands/SelfieSegmentation usage).
    const handsOk = await loadScript('/mediapipe/hands/hands.js');
    const segOk = await loadScript('/mediapipe/selfie_segmentation/selfie_segmentation.js');

    if (!handsOk) {
      throw new Error('Could not load /mediapipe/hands/hands.js. Make sure `npm run build` copied the MediaPipe assets into public/.');
    }

    // Wait for globals to register
    const Hands = await waitForGlobal('Hands', 8000);
    const SelfieSegmentation = segOk ? await waitForGlobal('SelfieSegmentation', 8000) : null;

    if (!Hands) {
      throw new Error(
        'MediaPipe Hands failed to initialize (window.Hands is missing). ' +
        'Check the browser console for WASM errors.'
      );
    }
    if (!SelfieSegmentation) {
      console.warn('[loadMP] SelfieSegmentation unavailable; Domain will use a dimmed video fallback.');
    }

    return {
      Hands,
      SelfieSegmentation,
      handsWasmDir: '/mediapipe/hands/',
      segWasmDir: '/mediapipe/selfie_segmentation/',
    };
  })();
  return loaded;
}
