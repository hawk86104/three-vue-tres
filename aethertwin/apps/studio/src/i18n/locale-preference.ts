import type { StudioLocale } from "./message-schema";

const localePreferenceKey = "aethertwin.studio.locale.v1";

export interface LocalePreference {
  read(): StudioLocale | null;
  write(locale: StudioLocale): void;
}

function isStudioLocale(value: string | null): value is StudioLocale {
  return value === "zh-CN" || value === "en";
}

export function createBrowserLocalePreference(
  storage: Pick<Storage, "getItem" | "setItem">,
): LocalePreference {
  return {
    read() {
      try {
        const value = storage.getItem(localePreferenceKey);
        return isStudioLocale(value) ? value : null;
      } catch {
        return null;
      }
    },
    write(locale) {
      try {
        storage.setItem(localePreferenceKey, locale);
      } catch {
        // Persistence is optional; the provider retains the current document selection.
      }
    },
  };
}

export function createMemoryLocalePreference(initial?: StudioLocale): LocalePreference {
  let value = initial ?? null;
  return {
    read: () => value,
    write: (locale) => {
      value = locale;
    },
  };
}
