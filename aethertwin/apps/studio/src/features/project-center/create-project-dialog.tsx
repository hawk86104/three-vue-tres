import type { ProjectProfile } from "@aethertwin/core-model";
import { Badge, Button, Dialog, Field } from "@aethertwin/design-system";
import { useEffect, useState } from "react";

const WINDOWS_RESERVED_DEVICE_NAME =
  /^(?:CON|PRN|AUX|NUL|COM(?:[1-9]|[¹²³])|LPT(?:[1-9]|[¹²³]))$/iu;

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

export function validateProjectName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "请输入项目名称";
  }
  if (/[\\/]/u.test(value)) {
    return "项目名称不能包含路径分隔符";
  }
  if (/[. ]$/u.test(value)) {
    return "项目名称不能以点或空格结尾";
  }
  const nameBeforeExtension = trimmed.split(".", 1)[0] ?? "";
  if (WINDOWS_RESERVED_DEVICE_NAME.test(nameBeforeExtension)) {
    return "项目名称不能使用 Windows 保留设备名";
  }
  if (Array.from(trimmed).length > 80) {
    return "项目名称不能超过 80 个字符";
  }
  return null;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const presentation = profilePresentation[profile];

  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    const validationError = validateProjectName(name);
    if (validationError !== null) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), profile);
      onOpenChange(false);
    } catch {
      setError("创建失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
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
        <Field
          autoFocus
          label="项目名称"
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.currentTarget.value);
            if (error !== null) {
              setError(null);
            }
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
