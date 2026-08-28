import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n/use-i18n";
import { applyTheme, resolveTheme, themeStorageKey, type ColorTheme } from "@/lib/theme";

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(themeStorageKey);
  } catch {
    return null;
  }
}

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<ColorTheme>("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncFromDocument = () => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    };
    const syncFromSystem = () => {
      if (readStoredTheme() !== null) return;
      const nextTheme = resolveTheme(null, media.matches);
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== themeStorageKey) return;
      const nextTheme = resolveTheme(event.newValue, media.matches);
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    syncFromDocument();
    media.addEventListener("change", syncFromSystem);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      media.removeEventListener("change", syncFromSystem);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const isDark = theme === "dark";
  const label = isDark ? t("nav.switchToLight") : t("nav.switchToDark");

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      data-theme-toggle
      onClick={() => {
        const nextTheme: ColorTheme = document.documentElement.classList.contains("dark")
          ? "light"
          : "dark";
        applyTheme(nextTheme);
        setTheme(nextTheme);
        try {
          window.localStorage.setItem(themeStorageKey, nextTheme);
        } catch {
          // The active page still changes theme when storage is unavailable.
        }
      }}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
