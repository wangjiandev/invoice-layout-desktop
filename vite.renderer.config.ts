import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/cmaps/*',
          dest: 'pdfjs/cmaps',
          rename: { stripBase: 3 },
        },
        {
          src: 'node_modules/pdfjs-dist/standard_fonts/*',
          dest: 'pdfjs/standard_fonts',
          rename: { stripBase: 3 },
        },
        {
          src: 'node_modules/pdfjs-dist/wasm/*',
          dest: 'pdfjs/wasm',
          rename: { stripBase: 3 },
        },
      ],
    }),
  ],
});
