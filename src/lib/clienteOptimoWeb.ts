// El cliente del óptimo con el Web Worker real. Vite empaqueta el worker aparte y solo se descarga al pedir el primer óptimo.
import { canalEnMemoria, ClienteOptimo, type Canal } from "./donde/clienteOptimo";
import type { RespuestaDelWorker } from "./donde/mensajesOptimo";

function canalWorker(): Canal {
  if (typeof Worker === "undefined") return canalEnMemoria();
  const w = new Worker(new URL("../workers/optimo.worker.ts", import.meta.url), { type: "module" });
  return {
    enviar: (m) => w.postMessage(m),
    alRecibir: (cb) => w.addEventListener("message", (e: MessageEvent<RespuestaDelWorker>) => cb(e.data)),
    alFallar: (cb) => {
      w.addEventListener("error", (e) => cb(e.message || "El worker ha fallado"));
      w.addEventListener("messageerror", () => cb("El worker no entiende el mensaje"));
    },
    cerrar: () => w.terminate(),
  };
}

export const clienteOptimo = new ClienteOptimo(canalWorker);
