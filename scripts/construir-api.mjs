// Empaqueta la función del agente (`servidor/vercel.ts` + el motor de `src/lib/donde/`) en UN archivo, `api/agente.js`.
// Por qué: Vercel ejecuta `api/*.js` tal cual y, con `"type": "module"`, Node exige extensiones en los imports relativos
// (`./agregados.js`), que el código del motor (compartido con la web) no lleva. Un solo archivo sin imports relativos evita el
// problema y no depende de cómo Vercel rastree los archivos. Solo importa módulos internos de Node (`node:*`).
// Se ejecuta en `npm run build` y se sube al repositorio (así la función existe aunque Vercel detecte `api/` antes de construir).
import { build } from "vite";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));

await build({
  root: raiz,
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "servidor/vercel.ts",
    outDir: "api",
    emptyOutDir: false,
    target: "node20",
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: { format: "esm", entryFileNames: "agente.js", codeSplitting: false },
    },
  },
});
console.log("api/agente.js generado");
