import type { ReactNode } from "react";
import {
  DisplayNameProvider,
  type StudioDisplayNameResolver,
} from "./display-name-provider";
import type { StudioLocale } from "./format-message";
import { createMemoryLocalePreference } from "./locale-preference";
import { LocaleProvider } from "./locale-provider";

export function StudioI18nTestProvider({
  locale = "zh-CN",
  resolver,
  children,
}: {
  readonly locale?: StudioLocale;
  readonly resolver?: StudioDisplayNameResolver;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <LocaleProvider preference={createMemoryLocalePreference(locale)}>
      <DisplayNameProvider {...(resolver === undefined ? {} : { resolver })}>
        {children}
      </DisplayNameProvider>
    </LocaleProvider>
  );
}
