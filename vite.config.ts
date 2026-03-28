import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@client': path.resolve(__dirname, 'src/client'),
        '@server': path.resolve(__dirname, 'src/server'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    },

    // This is the crucial change to fix the blank screen in the Electron app.
    // When building (command === 'build'), it sets the base path to './'.
    // This makes all asset paths in the final `index.html` relative,
    // which is required for the `file://` protocol used by Electron.
    // For the dev server (command === 'serve'), it remains the default '/'.
    base: command === 'build' ? './' : '/',

    build: {
      // As seen in the build logs, the client output goes here.
      outDir: 'dist/client',
    },

    // This proxy is used during development (`npm run dev:client`)
    // to forward API requests to the backend server.
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  };
});
