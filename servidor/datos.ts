// Carga de los JSON de `public/donde/` en la función (Node). Pensado para Vercel:
//  - Solo se leen los que hacen falta, y solo la primera vez que una instancia los necesita (arranque en frío ≈ 40 ms con
//    `secciones.json` 368 kB + `territorios.json` 832 kB). Los 7 archivos de `servicios/` (1,8 MB; el DEA pesa 1,5 MB) se leen al
//    pedir ese servicio, y `secciones_2030.json` (100 kB) solo si la web está en 2030. El GeoJSON de contornos (2,5 MB) no se lee ni
//    se incluye en la función (`vercel.json`: `includeFiles` + `excludeFiles`).
//  - Todo queda en memoria mientras la instancia siga caliente; los estados calculados los cachea el motor (`crearEntorno`).
// Los datos se validan con las mismas funciones que la web (`cargar.ts`): un archivo roto no llega al motor.
import { cargarProyeccion, cargarServicio as cargarServicioDe, lectorNode, validarSecciones, type Lector } from "../src/lib/donde/cargar";
import { territoriosConPoblacion } from "../src/lib/donde/proyeccion";
import type { Centros, Datos, ServicioId, Territorios } from "../src/lib/donde/tipos";

export interface Cargador {
  /** Datos de hoy (2025) o de 2030 (la proyección sustituye la población; los centros son los de hoy). */
  datos(anio: 2025 | 2030): Promise<Datos>;
  cargarServicio(id: ServicioId): Promise<Centros>;
}

function validarTerritorios(x: unknown): Territorios {
  const t = x as Territorios | null;
  if (!t || t.version !== 1 || !Array.isArray(t.municipios) || !Array.isArray(t.zonas)) throw new Error("territorios.json: formato no válido");
  return t;
}

/** Crea un cargador sobre un lector de la carpeta `donde/`. Las promesas se guardan; si una falla se vuelve a intentar en la siguiente petición. */
export function crearCargador(lector: Lector): Cargador {
  let hoy: Promise<Datos> | null = null;
  let d2030: Promise<Datos> | null = null;
  const servicios = new Map<ServicioId, Promise<Centros>>();
  /** Un único objeto compartido entre 2025 y 2030: los centros son los mismos. */
  const compartidos: Datos["servicios"] = {};

  const cargarServicio = (id: ServicioId): Promise<Centros> => {
    let p = servicios.get(id);
    if (!p) {
      p = cargarServicioDe(lector, id);
      servicios.set(id, p);
      p.catch(() => servicios.delete(id));
    }
    return p;
  };

  const datosHoy = (): Promise<Datos> => {
    if (!hoy) {
      hoy = Promise.all([lector("secciones.json").then(validarSecciones), lector("territorios.json").then(validarTerritorios)]).then(
        ([secciones, territorios]) => ({ secciones, territorios, servicios: compartidos }),
      );
      hoy.catch(() => (hoy = null));
    }
    return hoy;
  };

  return {
    cargarServicio,
    datos(anio) {
      if (anio === 2025) return datosHoy();
      if (!d2030) {
        d2030 = datosHoy().then(async (h) => {
          const { secciones } = await cargarProyeccion(lector, h.secciones);
          return { secciones, territorios: territoriosConPoblacion(h.territorios, secciones), servicios: compartidos };
        });
        d2030.catch(() => (d2030 = null));
      }
      return d2030;
    },
  };
}

/** Carpetas donde puede estar `public/donde/` según dónde corra el código (Vercel: `/var/task`; local y tests: junto al repositorio). */
export function carpetasDeDatos(cwd: string, base: string | URL): (string | URL)[] {
  return [`${cwd.replace(/\/$/, "")}/public/donde/`, new URL("../public/donde/", base)];
}

/** El cargador de producción: prueba cada carpeta hasta encontrar `secciones.json`. */
export function crearCargadorNode(cwd: string, base: string | URL): Cargador {
  const lectores = carpetasDeDatos(cwd, base).map((d) => lectorNode(d));
  let elegido: Lector | null = null;
  const lector: Lector = async (ruta) => {
    if (elegido) return elegido(ruta);
    let ultimo: unknown;
    for (const l of lectores) {
      try {
        const r = await l(ruta);
        elegido = l;
        return r;
      } catch (e) {
        ultimo = e;
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error("No se encuentran los datos de public/donde/");
  };
  return crearCargador(lector);
}
