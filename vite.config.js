import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const httpsEnabled = String(process.env.HTTPS || '').toLowerCase() === 'true';
let httpsOptions;
if (httpsEnabled) {
  try {
    const keyPath = path.resolve('ssl', 'localhost.key');
    const certPath = path.resolve('public', 'localhost.crt');
    httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  } catch (_) {
    httpsOptions = true;
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true,
    allowedHosts: true, // Allow Cloudflare Tunnels and other proxies
    https: httpsEnabled ? httpsOptions : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['node_modules/**', 'dist/**', 'backend/**', 'tests/**'],
    coverage: {
      provider: 'v8'
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('jsbarcode')) return 'vendor-jsbarcode';
            if (id.includes('react-window')) return 'vendor-react-window';
            if (id.includes('react-toastify')) return 'vendor-toastify';
            if (id.includes('qrcode')) return 'vendor-qrcode';
            if (id.includes('@heroicons')) return 'vendor-heroicons';
            if (id.includes('react-router-dom')) return 'vendor-react-router';
          }
        }
      }
    }
  },
});
