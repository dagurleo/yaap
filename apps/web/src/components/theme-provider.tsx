import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
const storageKey = "os-analytics-theme";
const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark" || value === "system";
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    return isTheme(saved) ? saved : "system";
  } catch {
    return "system";
  }
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme =
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
}
// Run before styles paint so a saved choice also applies on reload and sign-in.
export const themeScript = `(function(){var t="system";try{var s=localStorage.getItem("os-analytics-theme");if(s==="light"||s==="dark"||s==="system")t=s}catch(e){}document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t})()`;
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setPreference] = useState<Theme>("system");
  useEffect(() => {
    const current = readTheme();
    setPreference(current);
    applyTheme(current);
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      const next = readTheme();
      setPreference(next);
      applyTheme(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      if (theme === "system") applyTheme(theme);
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);
  function setTheme(next: Theme) {
    setPreference(next);
    applyTheme(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* The choice still works for this session. */
    }
  }
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
