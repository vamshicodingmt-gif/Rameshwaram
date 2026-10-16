import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  optimizeDeps: {
    exclude: ['@mediapipe/hands', '@mediapipe/selfie_segmentation', '@mediapipe/camera_utils'],
  },
});
