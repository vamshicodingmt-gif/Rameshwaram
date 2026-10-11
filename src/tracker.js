// TensorFlow.js + @tensorflow-models hand-pose-detection & body-segmentation
// loader. Bundles everything through Vite so it works cleanly on Vercel
// without any script-tag loading, COOP/COEP headers, or manual wasm paths.
//
// Models are loaded from the TF.js CDN (https://tfhub.dev / models hosted on
// google's CDN) by the libraries themselves — we don't have to serve them from
// Vercel.

import * as tf from '@tensorflow/tfjs';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';

let handDetectorPromise = null;
let segmenterPromise = null;

// SupportedModels uses string constants so we can avoid import issues in older
// versions. @tensorflow-models/hand-pose-detection v2 exposes
// SupportedModels.MediaPipeHands, but defensive lookups are safer.
export async function getHandDetector() {
  if (handDetectorPromise) return handDetectorPromise;
  handDetectorPromise = (async () => {
    await tf.ready();
    const model = handPoseDetection.SupportedModels.MediaPipeHands;
    const detector = await handPoseDetection.createDetector(model, {
      runtime: 'tfjs',
      modelType: 'lite',
      maxHands: 2,
    });
    return detector;
  })();
  return handDetectorPromise;
}

export async function getSegmenter() {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    try {
      await tf.ready();
      const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
      if (!model) return null; // old bundle without segmentation model
      const segmenter = await bodySegmentation.createSegmenter(model, {
        runtime: 'tfjs',
        modelType: 'general',
      });
      return segmenter;
    } catch (e) {
      console.warn('[tracker] body segmenter unavailable:', e.message);
      return null;
    }
  })();
  return segmenterPromise;
}

// Map TF.js hand keypoints (MediaPipe Hands 21-point layout) into the same
// x/y normalized coordinate space we've been using (0..1, mirrored).
// Keypoint indices match our existing constants:
//   wrist=0, thumb_tip=4, index_mcp=5, index_pip=6, index_tip=8,
//   middle_mcp=9, middle_pip=10, middle_tip=12, ring_pip=14, ring_tip=16,
//   pinky_pip=18, pinky_tip=20.
// TF.js hands returns exactly this MediaPipe ordering. Handedness label comes
// back as 'Left'/'Right' (from camera perspective) same as before.
export const KPS = {
  WRIST: 0, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_TIP: 12,
  RING_PIP: 14, RING_TIP: 16,
  PINKY_PIP: 18, PINKY_TIP: 20,
};
