import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// 디자인 시스템은 빌드된 dist가 아니라 소스를 직접 본다(DOI CAD·갤러리와 같은 방식).
// 기본은 submodule(vendor/design_system), BRICKS_SRC로 로컬 사본을 가리킬 수 있다.
const bricksRoot = process.env.BRICKS_SRC
  ? path.resolve(process.env.BRICKS_SRC)
  : path.resolve(dirname, '../../vendor/design_system/packages/bricks');

const serverPort = Number(process.env.KB_SERVER_PORT ?? 5181);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@bricks/core': path.join(bricksRoot, 'src/index.ts'),
      '@bricks/styles': path.join(bricksRoot, 'src/styles'),
    },
    // bricks 소스가 다른 node_modules의 React를 잡으면 훅이 깨진다.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: Number(process.env.KB_WEB_PORT ?? 5180),
    strictPort: true,
    // 서버(apps/server)가 붙으면 /api를 넘긴다. 지금 화면은 브라우저 안의 데모 API로 돈다.
    proxy: {
      '/api': { target: `http://127.0.0.1:${serverPort}`, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // 자주 안 바뀌는 큰 라이브러리를 따로 묶어 브라우저 캐시를 살린다.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/react-markdown|remark|micromark|mdast|unified|hast|unist|vfile/.test(id)) return 'markdown';
          if (/[\\/]react(-dom)?[\\/]|scheduler|@base-ui|react-resizable-panels|zustand/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
