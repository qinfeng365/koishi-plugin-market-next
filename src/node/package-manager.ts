import { Logger } from 'koishi'
import spawn from 'execa'
import { levelMap, type YarnLog } from './installer-types'

const logger = new Logger('market')

export interface PackageManagerAgent {
  name: string
  version: string
}

export type PackageManagerLogEmitter = (type: 'stdout' | 'stderr', line: string) => void

class PackageManagerOutput {
  private stderr = ''
  private stdout = ''

  constructor(
    private useJson: boolean,
    private emit: PackageManagerLogEmitter,
  ) {}

  appendStderr(data: any) {
    this.stderr = appendLines(this.stderr, data, (line) => {
      logger.warn(line)
      this.emit('stderr', line)
    })
  }

  appendStdout(data: any) {
    this.stdout = appendLines(this.stdout, data, line => this.emitStdoutLine(line))
  }

  flush() {
    if (this.stderr) {
      logger.warn(this.stderr)
      this.emit('stderr', this.stderr)
      this.stderr = ''
    }
    if (this.stdout) {
      this.emitStdoutLine(this.stdout)
      this.stdout = ''
    }
  }

  private emitStdoutLine(line: string) {
    if (!line) return
    if (!this.useJson || line[0] !== '{') {
      logger.info(line)
      this.emit('stdout', line)
      return
    }
    try {
      const { type, data } = JSON.parse(line) as YarnLog
      logger[levelMap[type] ?? 'info'](data)
      this.emit('stdout', data)
    } catch (error) {
      logger.warn(line)
      logger.warn(error)
      this.emit('stderr', line)
    }
  }
}

export class PackageManagerRunner {
  constructor(
    private cwd: string,
    private agent: PackageManagerAgent | undefined,
    private emit: PackageManagerLogEmitter,
    private spawnProcess: typeof spawn = spawn,
  ) {}

  async exec(args: string[]) {
    const name = this.agent?.name ?? 'npm'
    const useJson = name === 'yarn' && this.agent.version >= '2'
    if (name !== 'yarn') args.unshift('install')
    const start = Date.now()
    logger.info(`run package manager: agent=${name}${this.agent?.version ? '@' + this.agent.version : ''}, args=${args.join(' ') || '(none)'}, cwd=${this.cwd}, json=${useJson}`)
    return new Promise<number>((resolve) => {
      if (useJson) args.push('--json')
      const child = this.spawnProcess(name, args, { cwd: this.cwd })
      this.emit('stdout', `package manager started: agent=${name}${this.agent?.version ? '@' + this.agent.version : ''}`)

      const output = new PackageManagerOutput(useJson, this.emit)
      let settled = false

      const settle = (code: number) => {
        if (settled) return
        settled = true
        output.flush()
        resolve(code)
      }

      child.on('exit', (code, signal) => {
        logger.info(`package manager exited: code=${code}, signal=${signal ?? '-'}, elapsed=${Date.now() - start}ms`)
        if (code == null) {
          const message = signal
            ? `package manager terminated by signal ${signal}`
            : 'package manager exited without an exit code'
          this.emit('stderr', message)
          settle(-1)
          return
        }
        this.emit(code ? 'stderr' : 'stdout', code ? `package manager exited with code ${code}` : 'package manager finished successfully')
        settle(code)
      })
      child.on('error', (error) => {
        logger.warn(`package manager failed to start: ${error instanceof Error ? error.message : String(error)}`)
        this.emit('stderr', `package manager failed to start: ${error instanceof Error ? error.message : String(error)}`)
        settle(-1)
      })

      child.stderr.on('data', data => output.appendStderr(data))
      child.stdout.on('data', data => output.appendStdout(data))
    })
  }
}

function appendLines(buffer: string, data: any, emit: (line: string) => void) {
  const lines = (buffer + data.toString()).split('\n')
  const tail = lines.pop()!
  for (const line of lines) emit(line)
  return tail
}
