import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build so the demo can be published as one HTML page (artifact) or opened from disk.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2022', cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
