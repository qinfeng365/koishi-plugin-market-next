import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Use the Console toolchain, including its host aliases and external modules.
const require = createRequire(createRequire(import.meta.url).resolve('@koishijs/client/lib'))
const { build, transformWithEsbuild } = await import(pathToFileURL(require.resolve('vite')).href)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { default: yaml } = require('@maikolib/vite-plugin-yaml')
const { default: uno } = await import(pathToFileURL(require.resolve('unocss/vite')).href)
const { default: mini } = await import(pathToFileURL(require.resolve('unocss/preset-mini')).href)

export async function buildClient(root, variant) {
  await build({
    root,
    base: './',
    plugins: [
      vue(),
      yaml(),
      uno({ presets: [mini({ preflight: false })] }),
      {
        name: 'console-minify-whitespace',
        async generateBundle(_, output) {
          const modules = Object.values(output)
            .filter(item => item.type === 'chunk')
            .flatMap(item => item.moduleIds.map(id => id.replaceAll('\\', '/')))
          const mixed = modules.some(id => variant === 'standard'
            ? id.includes('/client/variants/ve/')
            : /\/client\/components\/(?:dependencies|package)\.vue(?:\?|$)/.test(id))
          if (mixed) throw new Error(`The ${variant} entry bundles the other dependency UI`)
          // Match the Console builder: Vite leaves whitespace in ES library chunks.
          for (const item of Object.values(output)) {
            if (item.type !== 'chunk') continue
            item.code = (await transformWithEsbuild(item.code, item.fileName, {
              minifyWhitespace: true,
              charset: 'utf8',
            })).code
          }
        },
      },
    ],
    build: {
      target: 'esnext',
      outDir: resolve(root, 'dist', variant),
      emptyOutDir: true,
      assetsDir: '',
      commonjsOptions: { strictRequires: true },
      lib: {
        entry: resolve(root, variant === 've' ? 'client/variants/ve/index.ts' : 'client/index.ts'),
        fileName: () => 'index.js',
        cssFileName: 'style',
        formats: ['es'],
      },
      rollupOptions: {
        external: ['vue', 'vue-router', '@vueuse/core', '@koishijs/client'],
        output: { chunkFileNames: '[name]-[hash].js', assetFileNames: '[name][extname]' },
      },
    },
    esbuild: { target: 'esnext', charset: 'utf8' },
    css: { preprocessorOptions: { scss: { api: 'modern-compiler' } } },
    resolve: { alias: { 'vue-i18n': '@koishijs/client', '@koishijs/components': '@koishijs/client' } },
    define: { 'process.env.NODE_ENV': '"production"' },
  })
}
