import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { EventEmitter } from 'events'

export interface SidecarInfo {
  port: number
  mode: 'mock' | 'local'
  ready: boolean
}

export class PythonSpawner extends EventEmitter {
  private process: ChildProcess | null = null
  private port: number = 18923
  private ready: boolean = false

  /** 启动 Python Sidecar */
  async start(pythonCmd: string = 'python'): Promise<SidecarInfo> {
    const sidecarDir = join(__dirname, '..', '..', 'sidecar')
    const script = join(sidecarDir, 'main.py')

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonCmd, [script], {
        env: {
          ...process.env,
          SIDECAR_PORT: String(this.port)
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdoutBuf = ''

      this.process.stdout?.on('data', (data: Buffer) => {
        stdoutBuf += data.toString()

        // Python 启动时会输出 JSON
        if (!this.ready && stdoutBuf.includes('"ready"')) {
          try {
            const line = stdoutBuf.split('\n').find(l => l.includes('"ready"'))
            if (line) {
              const info = JSON.parse(line)
              this.port = info.port || this.port
              this.ready = true
              this.emit('ready', info)
              resolve({
                port: this.port,
                mode: info.mode || 'mock',
                ready: true
              })
            }
          } catch {
            // 继续等待
          }
        }
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[Sidecar stderr]', data.toString())
      })

      this.process.on('error', (err) => {
        this.emit('error', err)
        if (!this.ready) reject(err)
      })

      this.process.on('exit', (code) => {
        this.ready = false
        this.emit('exit', code)
      })

      // 超时保护
      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Python sidecar 启动超时 (15s)'))
        }
      }, 15000)
    })
  }

  /** 调用 Sidecar API */
  async call(endpoint: string, data: object): Promise<Record<string, unknown>> {
    if (!this.ready) throw new Error('Sidecar not ready')

    const res = await fetch(`http://127.0.0.1:${this.port}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Sidecar ${endpoint} error ${res.status}: ${errText}`)
    }

    return res.json() as Promise<Record<string, unknown>>
  }

  /** 健康检查 */
  async healthCheck(): Promise<Record<string, unknown>> {
    if (!this.ready) return { status: 'not_ready' }
    const res = await fetch(`http://127.0.0.1:${this.port}/health`)
    return res.json() as Promise<Record<string, unknown>>
  }

  /** 停止 Sidecar */
  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
      this.ready = false
    }
  }

  get isReady(): boolean {
    return this.ready
  }

  get sidecarPort(): number {
    return this.port
  }
}
