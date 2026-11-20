import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "@fontsource-variable/newsreader/wght.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource-variable/public-sans/wght.css";
import "./estilos/base.css";
import App from "./App";
import { limpiarEvento } from "./lib/analitica";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={limpiarEvento} />
  </StrictMode>,
);
