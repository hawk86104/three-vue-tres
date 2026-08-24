import { Button } from "@aethertwin/design-system";
import {
  SHOWROOM_FIXTURE_CATALOGUE,
  type ShowroomFixtureKind,
} from "@aethertwin/mode-showroom";
import { FIXTURE_KIND_MESSAGE_IDS } from "../../i18n/display-message-ids";
import { useI18n } from "../../i18n/locale-provider";

export interface FixtureCatalogueProps {
  readonly selectedKind: ShowroomFixtureKind | null;
  readonly onSelect: (kind: ShowroomFixtureKind) => void;
}

export function FixtureCatalogue({
  selectedKind,
  onSelect,
}: FixtureCatalogueProps) {
  const { t } = useI18n();
  return (
    <section
      className="studio-calibration-panel studio-fixture-catalogue"
      aria-label={t("fixture.catalogue")}
    >
      <header className="studio-fixture-catalogue__header">
        <h2>{t("fixture.catalogue")}</h2>
        <p>{t("fixture.instructions")}</p>
      </header>
      <div className="studio-calibration-panel__actions studio-fixture-catalogue__choices">
        {SHOWROOM_FIXTURE_CATALOGUE.map((descriptor) => {
          const selected = descriptor.kind === selectedKind;
          return (
            <Button
              key={descriptor.kind}
              variant={selected ? "secondary" : "ghost"}
              className="studio-fixture-catalogue__choice"
              aria-pressed={selected}
              data-fixture-kind={descriptor.kind}
              onClick={() => onSelect(descriptor.kind)}
            >
              <strong>{t(FIXTURE_KIND_MESSAGE_IDS[descriptor.kind])}</strong>
              <span>{t("fixture.dimensions", descriptor.defaultSize)}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
