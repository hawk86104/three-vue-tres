import type { StudioMessageCatalogue } from "./message-schema";

export const enMessages = {
  "locale.controlLabel": () => "Interface language",
  "locale.zh-CN": () => "简体中文",
  "locale.en": () => "English",
  "projectCenter.reopenProject": ({ name }: { readonly name: string }) => `Reopen ${name}`,
  "projectCenter.projectCount": ({ count }: { readonly count: number }) => (
    count === 1 ? "1 project" : `${count} projects`
  ),
} satisfies StudioMessageCatalogue;
