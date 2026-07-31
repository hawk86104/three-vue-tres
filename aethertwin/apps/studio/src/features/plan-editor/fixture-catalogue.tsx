import { Button } from "@aethertwin/design-system";
import {
  SHOWROOM_FIXTURE_CATALOGUE,
  type ShowroomFixtureKind,
} from "@aethertwin/mode-showroom";

export interface FixtureCatalogueProps {
  readonly selectedKind: ShowroomFixtureKind | null;
  readonly onSelect: (kind: ShowroomFixtureKind) => void;
}

export function FixtureCatalogue({
  selectedKind,
  onSelect,
}: FixtureCatalogueProps) {
  return (
    <section
      className="studio-calibration-panel studio-fixture-catalogue"
      aria-label="展具目录"
    >
      <header className="studio-fixture-catalogue__header">
        <h2>展具目录</h2>
        <p>选择标准展具，然后在画布中单击放置。</p>
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
              <strong>{descriptor.label}</strong>
              <span>
                宽 {descriptor.defaultSize.width} mm · 深 {descriptor.defaultSize.depth} mm · 高{" "}
                {descriptor.defaultSize.height} mm
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
