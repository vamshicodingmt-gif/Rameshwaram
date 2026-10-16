#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/public/mediapipe/hands" "$ROOT/public/mediapipe/selfie_segmentation" "$ROOT/public/mediapipe/camera_utils" "$ROOT/public/mediapipe/drawing_utils"
cp -u "$ROOT"/node_modules/@mediapipe/hands/* "$ROOT/public/mediapipe/hands/"
cp -u "$ROOT"/node_modules/@mediapipe/selfie_segmentation/* "$ROOT/public/mediapipe/selfie_segmentation/"
if [ -d "$ROOT/node_modules/@mediapipe/camera_utils" ]; then cp -u "$ROOT"/node_modules/@mediapipe/camera_utils/* "$ROOT/public/mediapipe/camera_utils/" 2>/dev/null || true; fi
if [ -d "$ROOT/node_modules/@mediapipe/drawing_utils" ]; then cp -u "$ROOT"/node_modules/@mediapipe/drawing_utils/* "$ROOT/public/mediapipe/drawing_utils/" 2>/dev/null || true; fi
echo "MediaPipe assets copied to public/mediapipe/"
