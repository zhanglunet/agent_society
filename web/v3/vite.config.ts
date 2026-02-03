import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  base: './',
  build: {
    minify: false,        // 禁用压缩
    sourcemap: true,      // 生成 source map
    outDir: 'dist',
    emptyOutDir: true
  }
})
