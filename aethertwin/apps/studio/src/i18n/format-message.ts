import { enMessages } from "./messages.en";
import type {
  StudioLocale,
  StudioMessageArgs,
  StudioMessageCatalogue,
  StudioMessageDescriptor,
  StudioMessageDescriptorFor,
  StudioMessageId,
  StudioTranslator,
} from "./message-schema";
import { zhCNMessages } from "./messages.zh-CN";

export type {
  StudioLocale,
  StudioMessageArgs,
  StudioMessageCatalogue,
  StudioMessageDescriptor,
  StudioMessageDescriptorFor,
  StudioMessageId,
  StudioTranslator,
} from "./message-schema";

const invalidMessageFallback = "界面文本不可用";

function invoke(
  locale: StudioLocale,
  id: StudioMessageId,
  args: readonly unknown[],
): string {
  const catalogue: StudioMessageCatalogue = locale === "en" ? enMessages : zhCNMessages;
  const formatter = catalogue[id];
  if (typeof formatter !== "function") return invalidMessageFallback;
  return (formatter as (...parameters: never[]) => string)(...(args as never[]));
}

export function formatMessage<K extends StudioMessageId>(
  locale: StudioLocale,
  id: K,
  ...args: StudioMessageArgs<K>
): string {
  return invoke(locale, id, args);
}

export function createStudioTranslator(locale: StudioLocale): StudioTranslator {
  return (id, ...args) => invoke(locale, id, args);
}

export function formatMessageDescriptor(
  locale: StudioLocale,
  value: StudioMessageDescriptor,
): string {
  return invoke(locale, value.id, value.args);
}

export function message<K extends StudioMessageId>(
  id: K,
  ...args: StudioMessageArgs<K>
): StudioMessageDescriptorFor<K> {
  return { id, args };
}
