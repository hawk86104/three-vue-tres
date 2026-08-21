import type { zhCNMessages } from "./messages.zh-CN";

export type StudioLocale = "zh-CN" | "en";

export function isStudioLocale(value: unknown): value is StudioLocale {
  return value === "zh-CN" || value === "en";
}

export type StudioMessageCatalogue = {
  readonly [K in keyof typeof zhCNMessages]:
    (...args: Parameters<(typeof zhCNMessages)[K]>) => string;
};

export type StudioMessageId = keyof StudioMessageCatalogue;
export type StudioMessageArgs<K extends StudioMessageId> =
  Parameters<StudioMessageCatalogue[K]>;

export type StudioTranslator = <K extends StudioMessageId>(
  id: K,
  ...args: StudioMessageArgs<K>
) => string;

export interface StudioMessageDescriptorFor<K extends StudioMessageId> {
  readonly id: K;
  readonly args: StudioMessageArgs<K>;
}

export type StudioMessageDescriptor = {
  readonly [K in StudioMessageId]: StudioMessageDescriptorFor<K>;
}[StudioMessageId];
