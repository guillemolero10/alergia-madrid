import type { Map as MapaLibre } from "maplibre-gl";
import { vientoEn, type RejillaViento } from "../lib/viento";

// Partículas de viento sobre un <canvas> 2D superpuesto al mapa. Cada partícula vive en coordenadas
// geográficas y se mueve con el viento interpolado de la rejilla; solo existen dentro de la rejilla
// (fuera no hay dato). El mapa no rota ni se inclina, así que la proyección a pantalla es lineal en
// longitud y en la «y» de Mercator y basta con proyectar dos esquinas por fotograma.

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latDeMercY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

const PX_POR_KMH = 0.055; // 18 km/h ≈ 1 px por fotograma a 60 Hz
const CUADRO_MS = 1000 / 60;
const DESVANECE = 0.085; // parte de la estela que se borra en cada fotograma de 60 Hz
const BORDE = 0.07; // franja (fracción de la rejilla) donde las partículas se van apagando
const VIDA_MIN = 50;
const VIDA_MAX = 130;
const TRAMOS = 3; // tramos de opacidad: se dibuja un trazo por tramo y no uno por partícula

export interface ParticulasViento {
  ponerRejilla(rejilla: RejillaViento | null): void;
  activar(activo: boolean): void;
  destruir(): void;
}

export function crearParticulasViento(mapa: MapaLibre, lienzo: HTMLCanvasElement): ParticulasViento {
  const ctx = lienzo.getContext("2d");
  let rejilla: RejillaViento | null = null;
  let activo = false;
  let cuadro = 0;
  let anterior = 0;
  let ancho = 0;
  let alto = 0;
  let escala = 1;

  // Posición normalizada dentro de la rejilla: gx (oeste→este) y gy (sur→norte, en Mercator), ambas 0..1.
  let gx = new Float32Array(0);
  let gy = new Float32Array(0);
  let edad = new Float32Array(0);
  let vida = new Float32Array(0);

  function sembrar(i: number, edadInicial = 0) {
    gx[i] = Math.random();
    gy[i] = Math.random();
    vida[i] = VIDA_MIN + Math.random() * (VIDA_MAX - VIDA_MIN);
    edad[i] = edadInicial;
  }

  function redimensionar() {
    const caja = mapa.getContainer().getBoundingClientRect();
    escala = Math.min(window.devicePixelRatio || 1, 2);
    ancho = Math.round(caja.width);
    alto = Math.round(caja.height);
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    lienzo.style.width = `${ancho}px`;
    lienzo.style.height = `${alto}px`;

    const n = Math.max(260, Math.min(1500, Math.round((ancho * alto) / 1100)));
    if (n !== gx.length) {
      gx = new Float32Array(n);
      gy = new Float32Array(n);
      edad = new Float32Array(n);
      vida = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        sembrar(i);
        edad[i] = Math.random() * vida[i]!;
      }
    }
  }

  function limpiar() {
    ctx?.setTransform(1, 0, 0, 1, 0, 0);
    ctx?.clearRect(0, 0, lienzo.width, lienzo.height);
  }

  function pintar(ahora: number) {
    cuadro = 0;
    if (!activo || !rejilla || !ctx) return;
    cuadro = requestAnimationFrame(pintar);

    // Paso proporcional al tiempo real: misma velocidad a 60 Hz que a 120 Hz o con el equipo cargado.
    const paso = anterior ? Math.min(3, (ahora - anterior) / CUADRO_MS) : 1;
    anterior = ahora;

    const r = rejilla;
    const so = mapa.project([r.lonMin, r.latMin]);
    const ne = mapa.project([r.lonMax, r.latMax]);
    const anchoRejilla = ne.x - so.x; // px, positivo
    const altoRejilla = ne.y - so.y; // px, negativo: el norte queda arriba
    if (anchoRejilla < 1 || altoRejilla > -1) return;
    const mySur = mercY(r.latMin);
    const myRango = mercY(r.latMax) - mySur;

    // Desvanece lo ya pintado para dejar estela.
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - Math.pow(1 - DESVANECE, paso)})`;
    ctx.fillRect(0, 0, ancho, alto);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    const trazos: Path2D[] = [];
    for (let t = 0; t < TRAMOS; t++) trazos.push(new Path2D());
    const vMax = Math.max(r.velocidadMax, 12);

    for (let i = 0; i < gx.length; i++) {
      const x = so.x + gx[i]! * anchoRejilla;
      const y = so.y + gy[i]! * altoRejilla;
      const lat = latDeMercY(mySur + gy[i]! * myRango);
      const lon = r.lonMin + gx[i]! * (r.lonMax - r.lonMin);
      const w = vientoEn(r, lon, lat);
      edad[i] = edad[i]! + paso;
      if (!w || edad[i]! > vida[i]!) {
        sembrar(i);
        continue;
      }
      const dx = w.u * PX_POR_KMH * paso;
      const dy = -w.v * PX_POR_KMH * paso;
      const nx = x + dx;
      const ny = y + dy;
      gx[i] = gx[i]! + dx / anchoRejilla;
      gy[i] = gy[i]! + dy / altoRejilla;
      if (gx[i]! < 0 || gx[i]! > 1 || gy[i]! < 0 || gy[i]! > 1) {
        sembrar(i);
        continue;
      }
      if (nx < -8 || nx > ancho + 8 || ny < -8 || ny > alto + 8) continue; // fuera de pantalla: vive, pero no se pinta
      // Cerca del borde de la rejilla se pintan menos partículas: el campo se difumina en vez de cortarse.
      const borde = Math.min(gx[i]!, 1 - gx[i]!, gy[i]!, 1 - gy[i]!);
      if (borde < BORDE && Math.random() > borde / BORDE) continue;
      const velocidad = Math.hypot(w.u, w.v);
      const tramo = Math.min(TRAMOS - 1, Math.floor((velocidad / vMax) * TRAMOS));
      const trazo = trazos[tramo]!;
      trazo.moveTo(x, y);
      trazo.lineTo(nx, ny);
    }

    for (let t = 0; t < TRAMOS; t++) {
      ctx.strokeStyle = `rgba(190, 226, 255, ${0.24 + (0.4 * t) / (TRAMOS - 1)})`;
      ctx.lineWidth = 1 + t * 0.35;
      ctx.stroke(trazos[t]!);
    }
  }

  function arrancar() {
    if (!cuadro && activo && rejilla) {
      anterior = 0;
      cuadro = requestAnimationFrame(pintar);
    }
  }

  function parar() {
    if (cuadro) cancelAnimationFrame(cuadro);
    cuadro = 0;
    limpiar();
  }

  // Las estelas están en coordenadas de pantalla: al mover el mapa se borran y se rehacen solas.
  const alMover = () => limpiar();
  const alRedimensionar = () => {
    redimensionar();
    limpiar();
  };
  mapa.on("move", alMover);
  mapa.on("resize", alRedimensionar);
  redimensionar();

  return {
    ponerRejilla(nueva) {
      rejilla = nueva;
      if (!rejilla) parar();
      else arrancar();
    },
    activar(valor) {
      activo = valor;
      if (activo) arrancar();
      else parar();
    },
    destruir() {
      parar();
      mapa.off("move", alMover);
      mapa.off("resize", alRedimensionar);
    },
  };
}
