import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary";

/* Polyfill crypto.randomUUID pour les navigateurs mobiles qui ne le supportent pas */
try {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
    crypto.randomUUID = function () {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
  }
} catch {}

/* Capturer les erreurs non gérées pour éviter page blanche sur mobile */
window.addEventListener("error", (e) => {
  console.error("[Global Error]", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Unhandled Promise]", e.reason);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
