export const themeStorageKey = "dshx-color-theme";

export type ColorTheme = "light" | "dark";

export function resolveTheme(storedTheme: string | null, prefersDark: boolean): ColorTheme {
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme: ColorTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset["theme"] = theme;
  root.style.colorScheme = theme;
}

export const themeInitializationScript = `(function(){try{var stored=window.localStorage.getItem(${JSON.stringify(themeStorageKey)});var prefersDark=typeof window.matchMedia==="function"&&window.matchMedia("(prefers-color-scheme: dark)").matches;var theme=stored==="light"||stored==="dark"?stored:(prefersDark?"dark":"light");var root=document.documentElement;root.classList.toggle("dark",theme==="dark");root.dataset.theme=theme;root.style.colorScheme=theme}catch{}})()`;
