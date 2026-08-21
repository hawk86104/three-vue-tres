import type { ProjectProfile } from "@aethertwin/core-model";
import { Badge, Button, Dialog, Field, StatusNotice } from "@aethertwin/design-system";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { localizedErrorDescriptor, localizedErrorLogRef } from "../../i18n/localized-error";
import { message, type StudioMessageDescriptor, type StudioMessageId } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";

const WINDOWS_RESERVED_DEVICE_NAME =
  /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/iu;
const profileLabelIds: Readonly<Record<ProjectProfile, StudioMessageId>> = {
  showroom: "profile.showroom",
  market: "profile.market",
};
const profileDescriptionIds: Readonly<Record<ProjectProfile, StudioMessageId>> = {
  showroom: "dialog.showroomDescription",
  market: "dialog.marketDescription",
};

export type ProjectNameValidationReason =
  | "empty" | "dot-path" | "separator" | "reserved-name"
  | "trailing-dot-or-space" | "too-long";

function trimUnicodeWhiteSpace(value: string): string {
  return value
    .replace(/^[\p{White_Space}\uFEFF]+/u, "")
    .replace(/[\p{White_Space}\uFEFF]+$/u, "");
}

export function validateProjectName(value: string): ProjectNameValidationReason | null {
  const canonicalName = trimUnicodeWhiteSpace(value);
  if (canonicalName.length === 0) return "empty";
  if (canonicalName === "." || canonicalName === "..") return "dot-path";
  if (/[\\/]/u.test(canonicalName)) return "separator";
  if (/(?:[.]|[\p{White_Space}\uFEFF])$/u.test(value)) {
    return "trailing-dot-or-space";
  }
  const nameBeforeExtension = canonicalName.split(".", 1)[0] ?? "";
  if (WINDOWS_RESERVED_DEVICE_NAME.test(nameBeforeExtension)) {
    return "reserved-name";
  }
  if (Array.from(canonicalName).length > 80) {
    return "too-long";
  }
  return null;
}

export function normalizeProjectName(value: string): string { return trimUnicodeWhiteSpace(value); }

function validationDescriptor(reason: ProjectNameValidationReason): StudioMessageDescriptor {
  switch (reason) {
    case "empty": return message("validation.empty");
    case "dot-path": return message("validation.dotPath");
    case "separator": return message("validation.separator");
    case "reserved-name": return message("validation.reservedName");
    case "trailing-dot-or-space": return message("validation.trailing");
    case "too-long": return message("validation.tooLong");
  }
}

export interface CreateProjectDialogProps {
  open: boolean;
  profile: ProjectProfile;
  mode?: "desktop" | "sandbox";
  onOpenChange(open: boolean): void;
  onCreate(name: string, profile: ProjectProfile, location?: string): Promise<void>;
}

interface CreateErrorNotice { readonly descriptor: StudioMessageDescriptor; readonly logRef: string | null; }
function createErrorNotice(value: unknown): CreateErrorNotice {
  return Object.freeze({ descriptor: localizedErrorDescriptor(value), logRef: localizedErrorLogRef(value) });
}

export function CreateProjectDialog({
  open,
  profile,
  mode = "sandbox",
  onOpenChange,
  onCreate,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [validationError, setValidationError] = useState<ProjectNameValidationReason | null>(null);
  const [locationError, setLocationError] = useState<StudioMessageDescriptor | null>(null);
  const [createError, setCreateError] = useState<CreateErrorNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const { format, t } = useI18n();

  useEffect(() => {
    if (!open) {
      setName("");
      setLocation("");
      setValidationError(null);
      setLocationError(null);
      setCreateError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    const validation = validateProjectName(name);
    if (validation !== null) {
      setValidationError(validation);
      setCreateError(null);
      nameFieldRef.current?.focus();
      return;
    }

    if (mode === "desktop" && location.length === 0) {
      setLocationError(message("validation.empty"));
      setCreateError(null);
      return;
    }

    setBusy(true);
    setValidationError(null);
    setCreateError(null);
    try {
      if (mode === "desktop") {
        await onCreate(normalizeProjectName(name), profile, location);
      } else {
        await onCreate(normalizeProjectName(name), profile);
      }
      onOpenChange(false);
    } catch (error) {
      setCreateError(createErrorNotice(error));
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocation() {
    setLocationError(null);
    setCreateError(null);
    try {
      const selected = await openFolderDialog({
        directory: true,
        multiple: false,
        title: t("dialog.openLocationTitle"),
      });
      if (typeof selected === "string") {
        setLocation(selected);
      }
    } catch {
      setLocationError(message("error.generic"));
    }
  }

  return (
    <Dialog
      open={open}
      dismissible={!busy}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
      title={t("dialog.createTitle")}
      description={
        mode === "desktop"
          ? t("dialog.createDesktopDescription") : t("dialog.createSandboxDescription")
      }
    >
      <form
        className="studio-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="studio-create-form__profile" aria-label={t("dialog.fixedProfile")}>
          <span>{t(profileLabelIds[profile])}</span>
          <Badge tone="accent">{t(profileLabelIds[profile])}</Badge>
          <p>{t(profileDescriptionIds[profile])}</p>
        </div>
        {createError === null ? null : (
          <StatusNotice tone="error">
            <span>{format(createError.descriptor)}</span>
            {createError.logRef === null ? null : (
              <span>{t("error.diagnosticReference", { logRef: createError.logRef })}</span>
            )}
          </StatusNotice>
        )}
        <Field
          ref={nameFieldRef}
          label={t("dialog.projectName")}
          value={name}
          error={validationError === null ? null : format(validationDescriptor(validationError))}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setValidationError(null);
            setCreateError(null);
          }}
        />
        {mode === "desktop" ? (
          <div className="studio-create-form__location">
            <Field label={t("dialog.projectLocation")} value={location} error={locationError === null ? null : format(locationError)} readOnly />
            <Button variant="secondary" disabled={busy} onClick={() => void chooseLocation()}>
              {t("dialog.chooseProjectLocation")}
            </Button>
          </div>
        ) : (
          <Field
            label={t("dialog.projectLocation")}
            value={t("dialog.sandboxLocationValue")}
            helpText={t("dialog.sandboxLocation")}
            disabled
            readOnly
          />
        )}
        <div className="studio-create-form__actions">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button type="submit" busy={busy}>
            {t("dialog.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
