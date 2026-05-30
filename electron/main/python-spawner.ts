import { spawn, execSync, type ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { createServer } from 'net'

export interface SidecarInfo {
  port: number
  mode: 'mock' | 'local'
  ready: boolean
}

export class PythonSpawner extends EventEmitter {
  private process: ChildProcess | null = null
  private port: number = 18923
  private ready: boolean = false

  /** 检测端口是否被占用 */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(true))
      server.once('listening', () => {
        server.close()
        resolve(false)
      })
      server.listen(port, '127.0.0.1')
    })
  }

  /** 尝试连接已有的 sidecar */
  private async tryConnectExisting(): Promise<SidecarInfo | null> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: AbortSignal.timeout(2000)
      })
      if (res.ok) {
        const data = await res.json() as any
        if (data.status === 'ok') {
          this.ready = true
          return { port: this.port, mode: data.mode || 'mock', ready: true }
        }
      }
    } catch {
      // 连不上，说明不是我们的 sidecar
    }
    return null
  }

  /** 启动 Python Sidecar */
  async start(pythonCmd: string = 'python'): Promise<SidecarInfo> {
    // 如果已经 ready，先健康检查
    if (this.ready && this.process) {
      const existing = await this.tryConnectExisting()
      if (existing) return existing
    }

    // 检测端口是否被占用
    const portBusy = await this.isPortInUse(this.port)
    if (portBusy) {
      // 尝试连接已有的 sidecar
      const existing = await this.tryConnectExisting()
      if (existing) {
        console.log('[PythonSpawner] 检测到已有 sidecar 运行，复用连接')
        return existing
      }
      // 端口被非 sidecar 进程占用
      throw new Error(`端口 ${this.port} 已被其他进程占用，请先关闭该进程或更换端口`)
    }

    // 尝试多个可能的 sidecar 路径（dev 模式 vs 打包后）
    const candidates = [
      join(__dirname, '..', '..', 'sidecar', 'main.py'),   // out/main/ → 项目根
      join(__dirname, '..', 'sidecar', 'main.py'),          // 一级上
      join(process.cwd(), 'sidecar', 'main.py'),            // 工作目录
    ]
    const script = candidates.find(p => existsSync(p))

    if (!script) {
      throw new Error(
        `找不到 sidecar/main.py，已尝试路径:\n${candidates.join('\n')}`
      )
    }
    console.log(`[PythonSpawner] script=${script}, pythonCmd=${pythonCmd}`)

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonCmd, [script], {
        env: {
          ...process.env,
          SIDECAR_PORT: String(this.port)
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdoutBuf = ''
      let stderrBuf = ''

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
        const msg = data.toString()
        stderrBuf += msg
        console.error('[Sidecar stderr]', msg)
      })

      this.process.on('error', (err) => {
        this.emit('error', err)
        if (!this.ready) reject(err)
      })

      let wasReady = false
      this.process.on('exit', (code) => {
        if (this.ready) wasReady = true
        this.ready = false
        this.emit('exit', code)
        // 进程快速退出（从未变为 ready）时立即 reject，不等超时
        if (!wasReady && code !== 0) {
          const hint = stderrBuf.includes('ModuleNotFoundError')
            ? 'Python 缺少依赖，请运行: pip install -r sidecar/requirements.txt'
            : stderrBuf.includes('Address already in use')
              ? `端口 ${this.port} 已被占用`
              : `请检查 Python 和依赖是否已安装`
          reject(new Error(`Python sidecar 退出 (code ${code}): ${hint}`))
        }
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

  /** 健康检查 — 主动探测端口，不管 this.ready 状态 */
  async healthCheck(): Promise<Record<string, unknown>> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: AbortSignal.timeout(3000)
      })
      if (res.ok) {
        const data = await res.json() as any
        // 探测成功，同步 ready 状态
        if (data.status === 'ok') {
          this.ready = true
        }
        return data
      }
      this.ready = false
      return { status: 'unhealthy' }
    } catch {
      this.ready = false
      return { status: 'not_running' }
    }
  }

  /** 停止 Sidecar */
  stop(): void {
    if (!this.process) return

    const pid = this.process.pid
    try {
      if (process.platform === 'win32' && pid) {
        // Windows: taskkill 强制终止进程树
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
      } else {
        this.process.kill('SIGKILL')
      }
    } catch {
      // 进程可能已退出
    }

    this.process = null
    this.ready = false
    console.log(`[PythonSpawner] Sidecar stopped (pid=${pid})`)
  }

  get isReady(): boolean {
    return this.ready
  }

  get sidecarPort(): number {
    return this.port
  }
}
