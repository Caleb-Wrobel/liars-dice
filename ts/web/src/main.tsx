import "@fontsource/alegreya/latin-400.css";
import "@fontsource/alegreya/latin-700.css";
import "@fontsource/limelight/latin-400.css";
import "@fontsource/rye/latin-400.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyScene, applySign, applyTheme, loadTheme, pickScene, pickSign } from "./theme.ts";
import "./styles.css";
import "./themes/saloon.css";
import "./themes/casino.css";
import "./themes/spooky.css";
import "./themes/hacker.css";

applyTheme(loadTheme());
applyScene(pickScene());
applySign(pickSign());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
