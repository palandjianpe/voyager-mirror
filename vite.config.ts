import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// `npm run phone` sets VM_HTTPS and makes a certificate in .cert/, so phones on the same
// Wi-Fi can open the app securely (they only allow the camera on https pages).
const phone = !!process.env.VM_HTTPS;

export default defineConfig({
  // Relative paths, so the built site works from any folder (GitHub Pages serves it from /voyager-mirror/).
  base: './',
  server: {
    port: 5173, strictPort: false, host: phone ? true : 'localhost',
    https: phone ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') } : undefined,
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
