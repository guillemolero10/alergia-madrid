// Solo para `npm run dev`: monta `/api/agente` en el servidor de Vite, para probar el agente con IA sin `vercel dev` ni dependencias.
// Solo se activa si en `.env.local` hay la clave de un proveedor (`META_API_KEY` o `BASETEN_API_KEY`) y `AGENTE_ACTIVO=1`; si no, `/api` no existe y la web responde con el modo sin IA,
// como antes. Carga el código TypeScript del servidor con el cargador de Vite (se recarga al editarlo).
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { avisosDeConfiguracion } from "./presupuesto.ts";
import { avisosProveedor, proveedorDesdeEntorno } from "./proveedor.ts";

export function agenteLocal(): Plugin {
  return {
    name: "agente-local",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      const todo = { ...process.env, ...env };
      for (const aviso of avisosProveedor(todo)) server.config.logger.warn(`  agente de IA: ${aviso}`, { timestamp: false });
      const p = proveedorDesdeEntorno(todo);
      if (todo.AGENTE_ACTIVO?.trim() !== "1" || !p) {
        server.config.logger.info("  agente de IA: apagado (falta AGENTE_ACTIVO=1 o la clave META_API_KEY / BASETEN_API_KEY en .env.local); la web usa el modo sin IA", { timestamp: false });
        return;
      }
      for (const aviso of avisosDeConfiguracion(todo)) server.config.logger.warn(`  agente de IA: ${aviso}`, { timestamp: false });
      server.config.logger.info(`  agente de IA: activo en /api/agente (${p.nombre} en ${p.servicio}, modelo ${p.modelo})`, { timestamp: false });
      server.middlewares.use("/api/agente", (req, res, next) => {
        server
          .ssrLoadModule("/servidor/vercel.ts")
          .then((m) => (m as typeof import("./vercel")).atender(req, res, { ...process.env, ...env }))
          .catch((e) => next(e));
      });
    },
  };
}
