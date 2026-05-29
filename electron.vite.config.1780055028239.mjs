// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var __electron_vite_injected_dirname = "D:\\AI_VEDIO_ASSI\\ai_video_tool";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/main/index.ts")
        }
      }
    },
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/preload/index.ts")
        }
      }
    }
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src"),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/index.html")
        }
      }
    },
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src")
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
