import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { agenteLocal } from "./servidor/vite.ts";

/** Dirección pública de la web (para la vista previa del enlace y la URL canónica). Se cambia con `VITE_URL_PUBLICA` en el entorno o en `.env.local`. */
export const URL_PUBLICA_POR_DEFECTO = "https://donde-hace-falta.vercel.app";

function urlPublica(url: string): Plugin {
  const limpia = url.replace(/\/+$/, "");
  return { name: "url-publica", transformIndexHtml: (html) => html.replaceAll("__URL_PUBLICA__", limpia) };
}

// La web vive en la raíz del repositorio. El pipeline (Python) y sus datos no se sirven ni se vigilan.
export default defineConfig(({ mode }) => ({
  plugins: [react(), agenteLocal(), urlPublica(loadEnv(mode, process.cwd(), "VITE_").VITE_URL_PUBLICA || process.env.VITE_URL_PUBLICA || URL_PUBLICA_POR_DEFECTO)],
  server: {
    watch: { ignored: ["**/pipeline/**", "**/salida/**", "**/.venv/**"] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1300, // MapLibre va en su propio trozo y se carga en diferido
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "servidor/**/*.test.ts"],
    // Los tests de rendimiento (`rendimiento.test.ts`) miden milisegundos: en paralelo con los que cargan todos los datos se falsean.
    fileParallelism: false,
  },
}));
