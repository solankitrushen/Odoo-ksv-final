"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: "class" | "data-theme";
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
};

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    return (window.localStorage.getItem(storageKey) as Theme) || null;
  } catch {
    return null;
  }
}

function setDocumentClass(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  storageKey = "dashboard-theme",
  ..._rest
}: ThemeProviderProps) {
  const [mounted, setMounted] = React.useState(false);
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    setMounted(true);
    const stored = getStoredTheme(storageKey);
    const initial: Theme = stored || defaultTheme;
    setThemeState(initial);

    const resolve = (t: Theme): "light" | "dark" => {
      if (t === "system" && enableSystem) return getSystemTheme();
      return t === "dark" ? "dark" : "light";
    };
    const resolved = resolve(initial);
    setResolvedTheme(resolved);
    setDocumentClass(resolved);
  }, [defaultTheme, enableSystem, storageKey]);

  React.useEffect(() => {
    if (!mounted) return;
    const resolved = theme === "system" && enableSystem ? getSystemTheme() : theme === "dark" ? "dark" : "light";
    setResolvedTheme(resolved);
    setDocumentClass(resolved);
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // ignore
    }
  }, [theme, mounted, enableSystem, storageKey]);

  React.useEffect(() => {
    if (!mounted || !enableSystem) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        setDocumentClass(resolved);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mounted, theme, enableSystem]);

  const setTheme = React.useCallback((t: Theme) => setThemeState(t), []);

  const state: ThemeProviderState = { theme, setTheme, resolvedTheme };

  return (
    <ThemeProviderContext.Provider value={state}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  const ctx = React.useContext(ThemeProviderContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
