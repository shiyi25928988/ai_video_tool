/**
 * 轻量并发信号量 — 控制同时执行的异步任务数
 */
export class Semaphore {
  private permits: number
  private waiting: Array<() => void> = []

  constructor(count: number) {
    if (count < 1) throw new Error('Semaphore count must be >= 1')
    this.permits = count
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }
    return new Promise<void>(resolve => this.waiting.push(resolve))
  }

  private release(): void {
    this.permits++
    const next = this.waiting.shift()
    if (next) {
      this.permits--
      next()
    }
  }

  get available(): number {
    return this.permits
  }

  get pending(): number {
    return this.waiting.length
  }
}
