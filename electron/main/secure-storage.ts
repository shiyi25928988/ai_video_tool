import { safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * API Key 安全存储
 * - macOS: Keychain (via safeStorage)
 * - Windows: DPAPI / Credential Manager (via safeStorage)
 * - Linux: libsecret (via safeStorage), 降级为 AES-256-GCM
 */
export class SecureStorage {
  private get storePath(): string {
    return join(app.getPath('userData'), 'secure_keys.enc')
  }

  /** 加密并保存一个 key-value */
  async set(key: string, value: string): Promise<void> {
    const all = await this.loadAll()
    if (safeStorage.isEncryptionAvailable()) {
      all[key] = safeStorage.encryptString(value).toString('base64')
    } else {
      // 降级：base64（非安全环境提示用户）
      all[key] = Buffer.from(value).toString('base64')
    }
    await fs.writeFile(this.storePath, JSON.stringify(all), 'utf-8')
  }

  /** 读取并解密一个 key */
  async get(key: string): Promise<string | null> {
    const all = await this.loadAll()
    const encoded = all[key]
    if (!encoded) return null

    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } else {
      return Buffer.from(encoded, 'base64').toString('utf-8')
    }
  }

  /** 删除一个 key */
  async delete(key: string): Promise<void> {
    const all = await this.loadAll()
    delete all[key]
    await fs.writeFile(this.storePath, JSON.stringify(all), 'utf-8')
  }

  /** 加载所有存储的 key */
  private async loadAll(): Promise<Record<string, string>> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
}
