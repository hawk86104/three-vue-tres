import type { ProjectProfile } from "@aethertwin/core-model";
import { Badge, Button, Dialog, Field, StatusNotice } from "@aethertwin/design-system";
import { useEffect, useRef, useState } from "react";

const WINDOWS_RESERVED_DEVICE_NAME =
  /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/iu;

const profilePresentation: Record<
  ProjectProfile,
  { readonly label: string; readonly description: string }
> = {
  showroom: {
    label: "店铺展厅",
    description: "创建店铺展厅项目的 M0 基础空间。",
  },
  market: {
    label: "市集导览",
    description: "创建市集导览项目的 M0 基础空间。",
  },
};

export type ProjectNameValidation =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly error: string };

function trimUnicodeWhiteSpace(value: string): string {
  return value
    .replace(/^\p{White_Space}+/u, "")
    .replace(/\p{White_Space}+$/u, "");
}

export function validateProjectName(value: string): ProjectNameValidation {
  const canonicalName = trimUnicodeWhiteSpace(value);
  if (canonicalName.length === 0) {
    return { ok: false, error: "请输入项目名称" };
  }
  if (/[\\/]/u.test(canonicalName)) {
    return { ok: false, error: "项目名称不能包含路径分隔符" };
  }
  if (/(?:[.]|\p{White_Space})$/u.test(value)) {
    return { ok: false, error: "项目名称不能以点或空格结尾" };
  }
  const nameBeforeExtension = canonicalName.split(".", 1)[0] ?? "";
  if (WINDOWS_RESERVED_DEVICE_NAME.test(nameBeforeExtension)) {
    return { ok: false, error: "项目名称不能使用 Windows 保留设备名" };
  }
  if (Array.from(canonicalName).length > 80) {
    return { ok: false, error: "项目名称不能超过 80 个字符" };
  }
  return { ok: true, name: canonicalName };
}

export interface CreateProjectDialogProps {
  open: boolean;
  profile: ProjectProfile;
  onOpenChange(open: boolean): void;
  onCreate(name: string, profile: ProjectProfile): Promise<void>;
}

export function CreateProjectDialog({
  open,
  profile,
  onOpenChange,
  onCreate,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const presentation = profilePresentation[profile];

  useEffect(() => {
    if (!open) {
      setName("");
      setValidationError(null);
      setCreateError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    const validation = validateProjectName(name);
    if (!validation.ok) {
      setValidationError(validation.error);
      setCreateError(null);
      nameFieldRef.current?.focus();
      return;
    }

    setBusy(true);
    setValidationError(null);
    setCreateError(null);
    try {
      await onCreate(validation.name, profile);
      onOpenChange(false);
    } catch {
      setCreateError("创建失败，请重试");
    } finally {
      setBusy(false);
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
      title="新建项目"
      description="项目只保存在当前 Web 沙盒会话中，关闭页面后不会保留。"
    >
      <form
        className="studio-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="studio-create-form__profile" aria-label="固定项目类型">
          <span>{presentation.label}</span>
          <Badge tone="accent">{profile}</Badge>
          <p>{presentation.description}</p>
        </div>
        {createError === null ? null : (
          <StatusNotice tone="error">{createError}</StatusNotice>
        )}
        <Field
          ref={nameFieldRef}
          label="项目名称"
          value={name}
          error={validationError}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setValidationError(null);
            setCreateError(null);
          }}
        />
        <Field
          label="项目位置"
          value="sandbox"
          helpText="Web 沙盒位置固定且不持久保存。"
          disabled
          readOnly
        />
        <div className="studio-create-form__actions">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" busy={busy}>
            创建项目
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
