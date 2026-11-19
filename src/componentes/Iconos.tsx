// Iconos SVG propios (sin librería). Todos decorativos: el texto de al lado dice lo mismo.

interface PropsIcono {
  tam?: number;
  className?: string;
}

const base = (tam: number) => ({
  width: tam,
  height: tam,
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": true,
  focusable: false,
});

/** Estación de calidad del aire: el mismo círculo que en el mapa. */
export function IconoAire({ tam = 18, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  );
}

/** Captador de polen: rombo. */
export function IconoPolen({ tam = 18, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="2" transform="rotate(45 12 12)" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Viento: flecha como las del mapa. */
export function IconoViento({ tam = 18, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M12 2.5l5.2 8.6-3.8-1.4-.6 12h-1.6l-.6-12-3.8 1.4L12 2.5z" fill="currentColor" transform="rotate(62 12 12)" />
    </svg>
  );
}

export function IconoAviso({ tam = 14, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M12 3.2 2.6 19.5h18.8L12 3.2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function IconoCerrar({ tam = 18, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconoInfo({ tam = 16, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="7.6" r="1.2" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------- servicios de «¿Dónde hace falta?»
const trazo = { stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Centro de salud: edificio bajo con cruz. */
export function IconoCentroSalud({ tam = 22, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M4 20V9.5L12 4l8 5.5V20z" {...trazo} />
      <path d="M12 10.2v5.6M9.2 13h5.6" {...trazo} />
    </svg>
  );
}

/** Hospital: edificio alto con una H. */
export function IconoHospital({ tam = 22, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" {...trazo} />
      <path d="M9.5 8v7M14.5 8v7M9.5 11.5h5" {...trazo} />
    </svg>
  );
}

/** Residencia: cama. */
export function IconoResidencia({ tam = 22, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M3.5 18.5v-10M3.5 15h17v3.5M20.5 15v-3.2a2.3 2.3 0 0 0-2.3-2.3H11V15" {...trazo} />
      <circle cx="7.2" cy="11.6" r="1.7" {...trazo} />
    </svg>
  );
}

/** Farmacia: cápsula. */
export function IconoFarmacia({ tam = 22, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <rect x="2.8" y="8.6" width="18.4" height="6.8" rx="3.4" transform="rotate(-40 12 12)" {...trazo} />
      <path d="m9.2 9.4 5.4 5.2" {...trazo} />
    </svg>
  );
}

/** Colegio: edificio con frontón y bandera. */
export function IconoColegio({ tam = 22, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M3.5 20.5v-9L12 6l8.5 5.5v9zM12 6V2.8l3 1.1-3 1.1" {...trazo} />
      <path d="M10 20.5v-4.2h4v4.2" {...trazo} />
    </svg>
  );
}

/** Desfibrilador: corazón con un rayo. */
export function IconoDea({ tam = 22, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M12 20.2 4.6 12.6A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 7.4 6.2z" {...trazo} />
      <path d="m12.8 8.8-2.3 3.4h3l-2.3 3.4" {...trazo} />
    </svg>
  );
}

/** Flecha de enlace externo. */
export function IconoEnlace({ tam = 12, className }: PropsIcono) {
  return (
    <svg {...base(tam)} className={className}>
      <path d="M9 4.5H5a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1h13.5a1 1 0 0 0 1-1v-4M14 4h6v6M20 4l-9 9" {...trazo} />
    </svg>
  );
}
