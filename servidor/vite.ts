// Solo para `npm run dev`: monta `/api/agente` en el servidor de Vite, para probar el agente con IA sin `vercel dev` ni dependencias.
// Solo se activa si en `.env.local` hay `BASETEN_API_KEY` y `AGENTE_ACTIVO=1`; si no, `/api` no existe y la web responde con el modo sin IA,
// como antes. Carga el código TypeScript del servidor con el cargador de Vite (se recarga al editarlo).
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { avisosDeConfiguracion } from "./presupuesto.ts";

export function agenteLocal(): Plugin {
  return {
    name: "agente-local",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      if (env.AGENTE_ACTIVO?.trim() !== "1" || !env.BASETEN_API_KEY?.trim()) {
        server.config.logger.info("  agente de IA: apagado (sin BASETEN_API_KEY o AGENTE_ACTIVO=1 en .env.local); la web usa el modo sin IA", { timestamp: false });
        return;
      }
      for (const aviso of avisosDeConfiguracion({ ...process.env, ...env })) server.config.logger.warn(`  agente de IA: ${aviso}`, { timestamp: false });
      server.config.logger.info("  agente de IA: activo en /api/agente (Muse Spark Open en Baseten)", { timestamp: false });
      server.middlewares.use("/api/agente", (req, res, next) => {
        server
          .ssrLoadModule("/servidor/vercel.ts")
          .then((m) => (m as typeof import("./vercel")).atender(req, res, { ...process.env, ...env }))
          .catch((e) => next(e));
      });
    },
  };
}
