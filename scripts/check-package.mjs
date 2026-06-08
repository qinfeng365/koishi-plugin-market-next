import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'

const npm = 'npm'
const requiredFiles = [
  'dist/index.js',
  'dist/index.css',
  'dist/style.css',
]

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing build artifact: ${file}`)
  }
}

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
if (hash('dist/index.css') !== hash('dist/style.css')) {
  throw new Error('dist/index.css and dist/style.css must be identical')
}

const output = execFileSync(npm, ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const [pack] = JSON.parse(output)
const files = new Set(pack.files.map(file => file.path))

for (const file of requiredFiles) {
  if (!files.has(file)) {
    throw new Error(`Package tarball is missing: ${file}`)
  }
}

console.log(`Package artifact check passed for ${pack.name}@${pack.version}.`)
