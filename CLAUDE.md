# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Video AI Studio — a Chinese-language (zh-CN) long-form AI video generation desktop application built with Electron. Purely client-side; all AI inference runs locally or via cloud APIs called directly from the client. No server-side component beyond the local Python sidecar.

## Commands

| Task | Command |
|------|---------|
| Install dependencies | `pnpm install` |
| Dev mode (hot reload) | `pnpm dev` |
| Build (main + preload + renderer) | `pnpm build` |
| Preview built app | `pnpm preview` |
| Package without installer | `pnpm pack` |
| Create distributable installer | `pnpm dist` |
| Lint TypeScript | `pnpm lint` |

Package manager is **pnpm** (not npm/yarn). There are no test scripts or test framework configured.

## Architecture

Electron three-process architecture:

**Main process** (`electron/main/`): App lifecycle, IPC handlers, project file management (`~/Documents/VideoAIStudio/projects/`), pipeline orchestration, FFmpeg control, Python sidecar spawning, encrypted API key storage via `safeStorage`.

**Preload** (`electron/preload/`): Bridges main↔renderer via `contextBridge`. Exposes a typed `window.electronAPI` with namespaces: `app`, `project`, `script`, `llm`, `pipeline`, `provider`, `sidecar`, `ffmpeg`, `dialog`.

**Renderer** (`src/`): React 18 + Zustand SPA. Three views: Home (project list), Workspace (tabbed: Script/Characters/Render/Preview/Export), Settings. All main-process calls go through `window.electronAPI` only.

**Python sidecar** (`sidecar/`): Flask HTTP server on `localhost:18923`. Currently **mock mode only** — returns placeholder files. Endpoints: `/health`, `/generate_image`, `/generate_tts`, `/musetalk`, `/depth_animate`, `/extract_face_embedding`.

## Core Pipeline (4 Phases)

1. **Script Generation** — LLM-powered, 4 layers: story outline → chapter/shot breakdown → camera language/dialogue → SD prompt assembly (rule-based). Orchestrator in `electron/main/script-optimizer/optimizer.ts`.
2. **Character Generation** — Reference portrait images via sidecar.
3. **Shot Rendering** — Images, TTS audio, lip-sync video, 2.5D depth animation per shot type.
4. **Compositing** — FFmpeg assembly with transitions, subtitles, BGM (currently a placeholder).

## Key Patterns

- **Type definitions** live in `electron/main/script-optimizer/types.ts` (Project, Shot, Chapter, Character, etc.) — the canonical data model.
- **Video providers** (Kling, Jimeng) use a registry pattern in `electron/main/providers/`. Both are stubs (throw "not yet implemented").
- **LLM client** (`electron/main/script-optimizer/llm-client.ts`) supports Claude, OpenAI, and custom endpoints. Prompts are in `prompts.ts`.
- **Path aliases**: `@/*` → `src/*`, `@electron/*` → `electron/*` (configured in `tsconfig.json`).
- **State management**: Zustand store in `src/stores/project-store.ts`.

## Build & Config

- **electron-vite** builds three targets (main, preload, renderer) via `electron.vite.config.ts`.
- **electron-builder** config in `electron-builder.yml`. Output to `release/`.
- **Tailwind CSS** with custom `primary` (sky blue) and `dark` (slate) color scales.
- TypeScript strict mode, target ES2022, module ESNext.
- `out/` directory (compiled output) is committed to the project.

## Status

MVP phase. Video providers and FFmpeg compositing are stubs. Sidecar runs in mock mode. The specification document `AI长视频生成工具开发文档.md` (Chinese) drives implementation.
