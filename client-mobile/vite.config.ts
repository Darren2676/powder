import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    Components({
      resolvers: [VantResolver()]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      workbox: {
        // 清理过期缓存
        cleanupOutdatedCaches: true,
        // 不预缓存静态资源（让运行时缓存处理）
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 跳过等待，立即激活新 SW
        skipWaiting: true,
        clientsClaim: true,
        // 运行时缓存策略
        runtimeCaching: [
          {
            // API GET 请求 - 网络优先，失败回缓存
            urlPattern: /\/api\/v1\/(auth\/me|process-tasks|production-orders|work-reports|material-preparations)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 }, // 5分钟
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // 静态资源 - 缓存优先
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7天
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      manifest: {
        name: '睿信MES - 移动端',
        short_name: '睿信MES',
        description: '睿信密封件MES系统移动端',
        theme_color: '#1989fa',
        background_color: '#f5f5f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/api/mobile': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vant: ['vant'],
          vue: ['vue', 'vue-router', 'pinia']
        }
      }
    }
  }
})
