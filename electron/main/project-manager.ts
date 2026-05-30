import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { Project, PipelineState } from './script-optimizer/types'

export interface ProjectListItem {
  id: string
  title: string
  path: string
  createdAt: string
  updatedAt: string
  durationTargetSec: number
  pipelineState: PipelineState
}

export class ProjectManager {
  private project: Project | null = null
  private projectPath: string | null = null
  private customWorkspace: string | null = null

  private get defaultWorkspace(): string {
    return join(app.getPath('documents'), 'VideoAIStudio', 'projects')
  }

  /** 当前工作空间目录 */
  get projectsDir(): string {
    return this.customWorkspace || this.defaultWorkspace
  }

  /** 加载工作空间配置 */
  async loadWorkspace(): Promise<void> {
    try {
      const configPath = join(app.getPath('userData'), 'workspace.json')
      const data = await fs.readFile(configPath, 'utf-8')
      const config = JSON.parse(data)
      if (config.path) {
        this.customWorkspace = config.path
        await fs.mkdir(config.path, { recursive: true })
      }
    } catch {
      // 使用默认路径
    }
  }

  /** 获取当前工作空间路径 */
  getWorkspacePath(): string {
    return this.projectsDir
  }

  /** 设置工作空间路径 */
  async setWorkspacePath(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true })
    this.customWorkspace = path
    const configPath = join(app.getPath('userData'), 'workspace.json')
    await fs.writeFile(configPath, JSON.stringify({ path }, null, 2), 'utf-8')
  }

  /** 确保项目目录存在 */
  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }

  /** 列出所有项目 */
  async listProjects(): Promise<ProjectListItem[]> {
    const dir = this.projectsDir
    try {
      await fs.access(dir)
    } catch {
      return []
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })
    const items: ProjectListItem[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const projectFile = join(dir, entry.name, 'project.json')
      try {
        const data = await fs.readFile(projectFile, 'utf-8')
        const proj = JSON.parse(data) as Project
        items.push({
          id: proj.id,
          title: proj.title,
          path: join(dir, entry.name),
          createdAt: proj.createdAt,
          updatedAt: proj.updatedAt,
          durationTargetSec: proj.durationTargetSec,
          pipelineState: proj.pipelineState
        })
      } catch {
        // 跳过损坏的项目
      }
    }

    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** 创建新项目 */
  async createProject(title: string, durationTargetSec: number = 300, style: string = 'anime'): Promise<Project> {
    const id = randomUUID()
    const dirName = `${this.sanitize(title)}_${id.slice(0, 8)}`
    const projectDir = join(this.projectsDir, dirName)

    await this.ensureDir(join(projectDir, 'characters'))
    await this.ensureDir(join(projectDir, 'shots'))
    await this.ensureDir(join(projectDir, 'audio', 'bgm'))
    await this.ensureDir(join(projectDir, 'audio', 'sfx'))
    await this.ensureDir(join(projectDir, 'exports'))
    await this.ensureDir(join(projectDir, '.cache', 'thumbnails'))
    await this.ensureDir(join(projectDir, 'logs'))

    const now = new Date().toISOString()
    const project: Project = {
      version: 1,
      id,
      title,
      style,
      durationTargetSec,
      createdAt: now,
      updatedAt: now,
      characters: [],
      pipelineState: {
        phase: 'idle',
        totalShots: 0,
        completedShots: 0,
        failedShots: 0,
        estimatedRemainingSec: 0
      }
    }

    this.project = project
    this.projectPath = projectDir
    await this.saveProject()

    return project
  }

  /** 打开已有项目 */
  async openProject(projectDir: string): Promise<Project> {
    const projectFile = join(projectDir, 'project.json')
    const data = await fs.readFile(projectFile, 'utf-8')
    const project = JSON.parse(data) as Project

    this.project = project
    this.projectPath = projectDir
    return project
  }

  /** 获取当前项目 */
  getProject(): Project | null {
    return this.project
  }

  /** 获取当前项目路径 */
  getProjectPath(): string | null {
    return this.projectPath
  }

  /** 保存 project.json（Windows 兼容） */
  async saveProject(): Promise<void> {
    if (!this.project || !this.projectPath) {
      throw new Error('No project loaded')
    }

    this.project.updatedAt = new Date().toISOString()

    const realPath = join(this.projectPath, 'project.json')
    const content = JSON.stringify(this.project, null, 2)

    // Windows 上 fs.rename 对含中文路径有问题，直接写入目标文件
    await fs.writeFile(realPath, content, 'utf-8')
  }

  /** 更新项目（合并部分数据） */
  async updateProject(partial: Partial<Project>): Promise<void> {
    if (!this.project) throw new Error('No project loaded')
    Object.assign(this.project, partial)
    await this.saveProject()
  }

  /** 更新 Pipeline 状态 */
  async updatePipelineState(state: Partial<PipelineState>): Promise<void> {
    if (!this.project) throw new Error('No project loaded')
    Object.assign(this.project.pipelineState, state)
    await this.saveProject()
  }

  /** 确保分镜目录存在 */
  async ensureShotDir(shotId: string): Promise<string> {
    if (!this.projectPath) throw new Error('No project loaded')
    const dir = join(this.projectPath, 'shots', shotId)
    await this.ensureDir(dir)
    return dir
  }

  /** 确保角色目录存在 */
  async ensureCharacterDir(characterId: string): Promise<string> {
    if (!this.projectPath) throw new Error('No project loaded')
    const dir = join(this.projectPath, 'characters', characterId)
    await this.ensureDir(dir)
    return dir
  }

  /** 文件名安全化 */
  private sanitize(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 50)
  }
}
