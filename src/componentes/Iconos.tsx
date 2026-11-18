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
