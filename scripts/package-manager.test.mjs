import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { PackageManagerRunner } from '../src/node/package-manager.ts'

function createSpawn(run) {
  const invocations = []
  const spawn = (name, args, options) => {
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    invocations.push({ name, args: [...args], options })
    queueMicrotask(() => run(child))
    return child
  }
  return { invocations, spawn }
}

test('runs npm install and flushes complete and trailing output lines', async () => {
  const logs = []
  const state = createSpawn((child) => {
    child.stdout.write('fetching\nresolved')
    child.stderr.write('warning\nlast warning')
    child.emit('exit', 2, null)
  })
  const runner = new PackageManagerRunner(
    'C:/koishi',
    { name: 'npm', version: '10.0.0' },
    (type, line) => logs.push({ type, line }),
    state.spawn,
  )
  const args = ['--registry', 'https://registry.example']

  assert.equal(await runner.exec(args), 2)
  assert.deepEqual(args, ['install', '--registry', 'https://registry.example'])
  assert.deepEqual(state.invocations, [{
    name: 'npm',
    args,
    options: { cwd: 'C:/koishi' },
  }])
  assert.deepEqual(logs, [
    { type: 'stdout', line: 'package manager started: agent=npm@10.0.0' },
    { type: 'stdout', line: 'fetching' },
    { type: 'stderr', line: 'warning' },
    { type: 'stderr', line: 'package manager exited with code 2' },
    { type: 'stderr', line: 'last warning' },
    { type: 'stdout', line: 'resolved' },
  ])
})

test('parses Yarn JSON output and preserves malformed lines as stderr', async () => {
  const logs = []
  const state = createSpawn((child) => {
    child.stdout.write('{"type":"info","data":"resolved from yarn"}\n')
    child.stdout.write('{broken}\nplain output\n')
    child.emit('exit', 0, null)
  })
  const runner = new PackageManagerRunner(
    'C:/koishi',
    { name: 'yarn', version: '4.1.0' },
    (type, line) => logs.push({ type, line }),
    state.spawn,
  )
  const args = []

  assert.equal(await runner.exec(args), 0)
  assert.deepEqual(args, ['--json'])
  assert.deepEqual(state.invocations[0], {
    name: 'yarn',
    args: ['--json'],
    options: { cwd: 'C:/koishi' },
  })
  assert.deepEqual(logs, [
    { type: 'stdout', line: 'package manager started: agent=yarn@4.1.0' },
    { type: 'stdout', line: 'resolved from yarn' },
    { type: 'stderr', line: '{broken}' },
    { type: 'stdout', line: 'plain output' },
    { type: 'stdout', line: 'package manager finished successfully' },
  ])
})

test('returns a stable failure code when the package manager cannot start', async () => {
  const logs = []
  const state = createSpawn((child) => {
    child.emit('error', new Error('spawn failed'))
  })
  const runner = new PackageManagerRunner(
    'C:/koishi',
    undefined,
    (type, line) => logs.push({ type, line }),
    state.spawn,
  )

  assert.equal(await runner.exec([]), -1)
  assert.deepEqual(state.invocations[0], {
    name: 'npm',
    args: ['install'],
    options: { cwd: 'C:/koishi' },
  })
  assert.deepEqual(logs, [
    { type: 'stdout', line: 'package manager started: agent=npm' },
    { type: 'stderr', line: 'package manager failed to start: spawn failed' },
  ])
})
