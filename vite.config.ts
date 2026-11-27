import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: false, host: 'localhost' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
