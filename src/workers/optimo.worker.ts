// Web Worker del óptimo («¿Y dónde lo pondría el modelo?»): el cálculo voraz va aquí para que el mapa no se congele.
import { crearManejador, type MensajeAlWorker, type RespuestaDelWorker } from "../lib/donde/mensajesOptimo";

const manejar = crearManejador();
const contexto = self as unknown as {
  onmessage: ((e: MessageEvent<MensajeAlWorker>) => void) | null;
  postMessage: (m: RespuestaDelWorker) => void;
};

contexto.onmessage = (e) => {
  const respuesta = manejar(e.data);
  if (respuesta) contexto.postMessage(respuesta);
};
