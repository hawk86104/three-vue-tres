import { App } from "./app";
import { WebDemoApp } from "./web-demo/web-demo-app";

export interface StudioRootProps {
  readonly webDemo?: boolean;
}

export function StudioRoot({
  webDemo = import.meta.env.VITE_AETHERTWIN_WEB_DEMO === "1",
}: StudioRootProps) {
  return webDemo ? <WebDemoApp /> : <App />;
}
