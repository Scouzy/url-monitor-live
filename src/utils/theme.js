/* ═══════════════════════════════════════════════════════════════
   Theme management — dark/light mode toggle
   Uses CSS filter approach to avoid rewriting all inline styles
   ═══════════════════════════════════════════════════════════════ */

const THEME_KEY = "g1oeil-theme";

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.style.filter = "invert(1) hue-rotate(180deg)";
    root.style.background = "#fff";
    /* Exempt images, videos, and SVGs from inversion */
    document.querySelectorAll("img, video, svg, .no-invert").forEach(el => {
      el.style.filter = "invert(1) hue-rotate(180deg)";
    });
  } else {
    root.style.filter = "";
    root.style.background = "";
    document.querySelectorAll("img, video, svg, .no-invert").forEach(el => {
      el.style.filter = "";
    });
  }
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/* Initialize theme on app load */
export function initTheme() {
  applyTheme(getTheme());
}
