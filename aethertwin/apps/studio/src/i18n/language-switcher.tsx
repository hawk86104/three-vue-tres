import { useId } from "react";
import type { StudioLocale } from "./format-message";
import { useI18n } from "./locale-provider";

const localeIds: readonly StudioLocale[] = ["zh-CN", "en"];

export function LanguageSwitcher(): React.JSX.Element {
  const id = useId();
  const { locale, setLocale, t } = useI18n();
  return (
    <label htmlFor={id}>
      {t("locale.controlLabel")}
      <select
        id={id}
        value={locale}
        onChange={(event) => setLocale(event.target.value as StudioLocale)}
      >
        {localeIds.map((localeId) => <option key={localeId} value={localeId}>{t(`locale.${localeId}`)}</option>)}
      </select>
    </label>
  );
}
