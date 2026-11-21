import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 하위 경로에서도 동작하도록 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
  build: { assetsInlineLimit: 0 },  // 국기 SVG를 CSS에 넣지 않고 필요할 때만 받는다
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
