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

class MissingInterpolationValueError extends Error {}

function checkedArguments(
  id: StudioMessageId,
  args: readonly unknown[],
  expectedCount: number,
): readonly unknown[] {
  if (
    expectedCount > 0
    && (args.length < expectedCount || args[0] === null || typeof args[0] !== "object")
  ) {
    throw new MissingInterpolationValueError(`Missing interpolation values for message "${id}".`);
  }
  return args.map((argument) => {
    if (argument === null || typeof argument !== "object") return argument;
    return new Proxy(argument, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof key === "string" && value === undefined) {
          throw new MissingInterpolationValueError(
            `Missing interpolation value "${key}" for message "${id}".`,
          );
        }
        return value;
      },
    });
  });
}

function invoke(
  locale: StudioLocale,
  id: StudioMessageId,
  args: readonly unknown[],
): string {
  const catalogue: StudioMessageCatalogue = locale === "en" ? enMessages : zhCNMessages;
  const formatter = catalogue[id];
  if (typeof formatter !== "function") return invalidMessageFallback;
  try {
    const values = checkedArguments(id, args, formatter.length);
    return (formatter as (...parameters: never[]) => string)(...(values as never[]));
  } catch (error) {
    if (error instanceof MissingInterpolationValueError) {
      if (import.meta.env.DEV) throw error;
      return invalidMessageFallback;
    }
    throw error;
  }
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
