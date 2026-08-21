import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createStudioTranslator,
  formatMessageDescriptor,
  type StudioLocale,
  type StudioMessageDescriptor,
  type StudioTranslator,
} from "./format-message";
import type { LocalePreference } from "./locale-preference";

export interface LocaleContextValue {
  readonly locale: StudioLocale;
  readonly setLocale: (locale: StudioLocale) => void;
  readonly t: StudioTranslator;
  readonly format: (value: StudioMessageDescriptor) => string;
}

const fallbackLocale: StudioLocale = "zh-CN";
const fallbackContext: LocaleContextValue = {
  locale: fallbackLocale,
  setLocale: () => undefined,
  t: createStudioTranslator(fallbackLocale),
  format: (value) => formatMessageDescriptor(fallbackLocale, value),
};

const LocaleContext = createContext<LocaleContextValue>(fallbackContext);

function readLocale(preference: LocalePreference): StudioLocale {
  try {
    return preference.read() ?? fallbackLocale;
  } catch {
    return fallbackLocale;
  }
}

export function LocaleProvider({
  preference,
  children,
}: {
  readonly preference: LocalePreference;
  readonly children: ReactNode;
}): React.JSX.Element {
  const [locale, setLocaleState] = useState<StudioLocale>(() => readLocale(preference));
  const setLocale = useCallback((nextLocale: StudioLocale) => {
    setLocaleState(nextLocale);
    try {
      preference.write(nextLocale);
    } catch {
      // The in-memory selection remains usable when an adapter fails to persist.
    }
  }, [preference]);
  const t = useMemo(() => createStudioTranslator(locale), [locale]);
  const format = useCallback(
    (value: StudioMessageDescriptor) => formatMessageDescriptor(locale, value),
    [locale],
  );
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t, format }),
    [format, locale, setLocale, t],
  );

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const previous = root.getAttribute("lang");
    root.lang = locale;
    return () => {
      if (previous === null) root.removeAttribute("lang");
      else root.lang = previous;
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  return useContext(LocaleContext);
}
