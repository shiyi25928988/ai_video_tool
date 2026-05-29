import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

export class Logger {
  private minLevel: LogLevel = 'info'
  private logFile: string | null = null

  /** 设置日志文件路径 */
  setLogFile(filePath: string): void {
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.logFile = filePath
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  debug(msg: string, ...args: unknown[]): void { this.log('debug', msg, ...args) }
  info(msg: string, ...args: unknown[]): void { this.log('info', msg, ...args) }
  warn(msg: string, ...args: unknown[]): void { this.log('warn', msg, ...args) }
  error(msg: string, ...args: unknown[]): void { this.log('error', msg, ...args) }

  private log(level: LogLevel, msg: string, ...args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return

    const timestamp = new Date().toISOString()
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${msg}`
    const extra = args.length ? ' ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') : ''

    const line = formatted + extra

    if (level === 'error') {
      console.error(line)
    } else if (level === 'warn') {
      console.warn(line)
    } else {
      console.log(line)
    }

    if (this.logFile) {
      try {
        appendFileSync(this.logFile, line + '\n', 'utf-8')
      } catch {
        // 文件写入失败不影响主流程
      }
    }
  }
}

export const logger = new Logger()
