// Lanzador de `npm run evaluar`: carga `scripts/evaluar-agente.ts` con el cargador de Vite (el código del servidor y del motor
// importa sin extensiones, como en la web), igual que hace `servidor/vite.ts` en desarrollo.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const servidor = await createServer({ root: raiz, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, watch: null } });
let codigo = 1;
try {
  const { main } = await servidor.ssrLoadModule("/scripts/evaluar-agente.ts");
  codigo = await main(process.argv.slice(2));
} finally {
  await servidor.close();
}
process.exit(codigo);
