import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// La web vive en la raíz del repositorio. El pipeline (Python) y sus datos no se sirven ni se vigilan.
export default defineConfig({
  plugins: [react()],
  server: {
    watch: { ignored: ["**/pipeline/**", "**/salida/**", "**/.venv/**"] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1300, // MapLibre va en su propio trozo y se carga en diferido
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
