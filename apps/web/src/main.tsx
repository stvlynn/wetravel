import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { applyTheme } from "@/features/toggle-theme";
import "@/app/styles/global.css";
import "maplibre-gl/dist/maplibre-gl.css";

applyTheme();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
