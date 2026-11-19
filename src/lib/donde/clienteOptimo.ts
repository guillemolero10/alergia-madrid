// Cliente del óptimo: manda el cálculo a un Web Worker para que el mapa no se congele. Sin DOM: el canal (el Worker real,
// uno falso en los tests o el hilo principal como respaldo) se inyecta.
import type { OpcionesEstado, OpcionesOptimo } from "./cobertura";
import { crearManejador, type MensajeAlWorker, type RespuestaDelWorker } from "./mensajesOptimo";
import type { Centros, ResultadoOptimo, Secciones, ServicioId } from "./tipos";

export interface Canal {
  enviar(m: MensajeAlWorker): void;
  /** Quien recibe las respuestas; se llama una sola vez, antes de enviar nada. */
  alRecibir(cb: (r: RespuestaDelWorker) => void): void;
  /** Quien se entera de que el canal ha muerto (el script del worker no carga, etc.). */
  alFallar(cb: (mensaje: string) => void): void;
  cerrar(): void;
}

/** Respaldo: el mismo manejador en el hilo principal, tras un `setTimeout` para dejar respirar a la pantalla. */
export function canalEnMemoria(): Canal {
  const manejar = crearManejador();
  let recibir: (r: RespuestaDelWorker) => void = () => undefined;
  return {
    enviar(m) {
      if (m.tipo !== "optimo") {
        manejar(m);
        return;
      }
      setTimeout(() => {
        const r = manejar(m);
        if (r) recibir(r);
      }, 0);
    },
    alRecibir(cb) {
      recibir = cb;
    },
    alFallar() {
      /* en memoria no hay nada que pueda fallar aparte de lo que ya devuelve el manejador */
    },
    cerrar() {
      recibir = () => undefined;
    },
  };
}

export interface Pedido {
  promesa: Promise<ResultadoOptimo>;
  /** La respuesta que llegue después de cancelar se descarta (la promesa se rechaza con «cancelado»). */
  cancelar: () => void;
}

interface Pendiente {
  id: number;
  mensaje: Extract<MensajeAlWorker, { tipo: "optimo" }>;
  secciones: Secciones;
  centros: Centros;
  resolver: (r: ResultadoOptimo) => void;
  rechazar: (e: Error) => void;
}

export class Cancelado extends Error {
  constructor() {
    super("cancelado");
    this.name = "Cancelado";
  }
}

export class ClienteOptimo {
  private canal: Canal | null = null;
  private seccionesEnviadas: Secciones | null = null;
  private centrosEnviados = new Map<ServicioId, Centros>();
  private pendientes = new Map<number, Pendiente>();
  private siguiente = 1;
  private enMemoria = false;

  constructor(private crearCanal: () => Canal) {}

  private abrir(): Canal {
    if (this.canal) return this.canal;
    let canal: Canal;
    try {
      canal = this.crearCanal();
    } catch {
      canal = canalEnMemoria();
      this.enMemoria = true;
    }
    canal.alRecibir((r) => this.recibir(r));
    canal.alFallar(() => this.alFallar());
    this.canal = canal;
    return canal;
  }

  private alFallar(): void {
    if (this.enMemoria) return;
    // El worker no ha podido arrancar: se sigue en el hilo principal con lo que estaba pendiente.
    this.canal?.cerrar();
    this.canal = null;
    this.enMemoria = true;
    this.crearCanal = canalEnMemoria;
    this.seccionesEnviadas = null;
    this.centrosEnviados.clear();
    const pendientes = [...this.pendientes.values()];
    for (const p of pendientes) this.enviar(p);
  }

  private recibir(r: RespuestaDelWorker): void {
    const p = this.pendientes.get(r.id);
    if (!p) return; // cancelada
    this.pendientes.delete(r.id);
    if (r.tipo === "resultado") p.resolver(r.resultado);
    else p.rechazar(new Error(r.mensaje));
  }

  private enviar(p: Pendiente): void {
    const canal = this.abrir();
    if (this.seccionesEnviadas !== p.secciones) {
      canal.enviar({ tipo: "datos", secciones: p.secciones });
      this.seccionesEnviadas = p.secciones;
    }
    if (this.centrosEnviados.get(p.mensaje.servicio) !== p.centros) {
      canal.enviar({ tipo: "centros", servicio: p.mensaje.servicio, centros: p.centros });
      this.centrosEnviados.set(p.mensaje.servicio, p.centros);
    }
    canal.enviar(p.mensaje);
  }

  /** Pide el óptimo. Los datos grandes viajan una sola vez al worker; las siguientes peticiones solo llevan las opciones. */
  calcular(servicio: ServicioId, secciones: Secciones, centros: Centros, estado: OpcionesEstado, opciones: OpcionesOptimo): Pedido {
    const id = this.siguiente++;
    const promesa = new Promise<ResultadoOptimo>((resolver, rechazar) => {
      const p: Pendiente = { id, mensaje: { tipo: "optimo", id, servicio, estado, opciones }, secciones, centros, resolver, rechazar };
      this.pendientes.set(id, p);
      try {
        this.enviar(p);
      } catch (e) {
        this.pendientes.delete(id);
        rechazar(e instanceof Error ? e : new Error("No se pudo enviar el cálculo"));
      }
    });
    return {
      promesa,
      cancelar: () => {
        const p = this.pendientes.get(id);
        if (!p) return;
        this.pendientes.delete(id);
        p.rechazar(new Cancelado());
      },
    };
  }

  cerrar(): void {
    this.canal?.cerrar();
    this.canal = null;
    this.seccionesEnviadas = null;
    this.centrosEnviados.clear();
    for (const p of this.pendientes.values()) p.rechazar(new Cancelado());
    this.pendientes.clear();
  }
}
