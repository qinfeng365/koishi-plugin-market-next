import { build } from 'esbuild'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import yaml from 'js-yaml'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')
const { build: buildClient } = require('@koishijs/client/lib')

const yamlPlugin = {
  name: 'yaml',
  setup(build) {
    build.onResolve({ filter: /\/locales\// }, (args) => {
      if (args.path.endsWith('.yml')) return
      const path = require.resolve(args.path + '.yml', { paths: [args.resolveDir] })
      return { path }
    })
    build.onLoad({ filter: /\.ya?ml$/ }, (args) => {
      const contents = JSON.stringify(yaml.load(readFileSync(args.path, 'utf8')))
      return { contents, loader: 'json' }
    })
  },
}

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
  'koishi',
  '@koishijs/loader',
]

const common = {
  bundle: true,
  sourcemap: true,
  platform: 'node',
  target: 'node18',
  external,
  plugins: [yamlPlugin],
  logLevel: 'info',
}

await Promise.all([
  build({ ...common, entryPoints: ['src/node/index.ts'], outfile: 'lib/node/index.js', format: 'cjs' }),
  build({ ...common, entryPoints: ['src/shared/index.ts'], outfile: 'lib/shared/index.js', format: 'cjs' }),
  build({ ...common, entryPoints: ['src/shared/index.ts'], outfile: 'lib/shared/index.mjs', format: 'esm' }),
  build({ ...common, entryPoints: ['src/browser/index.ts'], outfile: 'lib/browser/index.mjs', format: 'esm' }),
])

await buildClient(process.cwd())
