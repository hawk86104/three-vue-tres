export const zhCNMessages = {
  "locale.controlLabel": () => "界面语言",
  "locale.zh-CN": () => "简体中文",
  "locale.en": () => "English",
  "projectCenter.reopenProject": ({ name }: { readonly name: string }) => `重新打开“${name}”`,
  "projectCenter.projectCount": ({ count }: { readonly count: number }) => `共 ${count} 个项目`,
} as const;
