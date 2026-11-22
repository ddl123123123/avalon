import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发时前端跑在 5310，房间服务跑在 8790；/ws 由 Vite 代理过去，浏览器只需要访问一个地址
const serverPort = process.env.SERVER_PORT ?? '8790';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5310),
    strictPort: true,
    host: true,
    proxy: {
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
    },
  },
});
