import { App } from "./app";
import { useMemo } from "react";
import {
  createBrowserLocalePreference,
  createMemoryLocalePreference,
  type LocalePreference,
} from "./i18n/locale-preference";
import { LocaleProvider } from "./i18n/locale-provider";
import { WebDemoApp } from "./web-demo/web-demo-app";

export interface StudioRootProps {
  readonly webDemo?: boolean;
}

function createLocalePreference(webDemo: boolean): LocalePreference {
  if (webDemo || typeof window === "undefined") {
    return createMemoryLocalePreference();
  }
  try {
    return createBrowserLocalePreference(window.localStorage);
  } catch {
    return createMemoryLocalePreference();
  }
}

export function StudioRoot({
  webDemo = import.meta.env.VITE_AETHERTWIN_WEB_DEMO === "1",
}: StudioRootProps) {
  const preference = useMemo(() => createLocalePreference(webDemo), [webDemo]);
  return (
    <LocaleProvider preference={preference}>
      {webDemo ? <WebDemoApp /> : <App />}
    </LocaleProvider>
  );
}
