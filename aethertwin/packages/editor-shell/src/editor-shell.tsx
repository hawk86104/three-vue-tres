import { Badge, Button, StatusNotice } from "@aethertwin/design-system";
import type { ProjectProfile, SaveState } from "@aethertwin/core-model";
import type React from "react";
import "./editor-shell.css";

export interface EditorShellProps {
  projectName: string;
  profile: ProjectProfile;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onBack(): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
  onClose(): void;
  toolbar: React.ReactNode;
  tree: React.ReactNode;
  workspace: React.ReactNode;
  inspector: React.ReactNode;
}

const saveStatePresentation: Record<
  SaveState,
  {
    label: string;
    tone: "error" | "saved" | "recovered" | "info";
  }
> = {
  dirty: { label: "未保存", tone: "info" },
  saving: { label: "保存中", tone: "info" },
  saved: { label: "已保存", tone: "saved" },
  error: { label: "保存失败", tone: "error" },
  recovered: { label: "已恢复", tone: "recovered" },
};

export function EditorShell({
  projectName,
  profile,
  saveState,
  canUndo,
  canRedo,
  onBack,
  onSave,
  onUndo,
  onRedo,
  onClose,
  toolbar,
  tree,
  workspace,
  inspector,
}: EditorShellProps) {
  const status = saveStatePresentation[saveState];
  const isSaving = saveState === "saving";

  return (
    <div className="aether-editor-shell">
      <header className="aether-editor-shell__header">
        <div className="aether-editor-shell__topbar">
          <Button variant="ghost" onClick={onBack}>
            返回
          </Button>
          <div className="aether-editor-shell__identity">
            <h1 className="aether-editor-shell__project-name">{projectName}</h1>
            <Badge tone="accent">{profile}</Badge>
          </div>
          <StatusNotice
            className="aether-editor-shell__save-status"
            tone={status.tone}
            data-save-state={saveState}
          >
            {status.label}
          </StatusNotice>
          <div className="aether-editor-shell__actions">
            <Button busy={isSaving} variant="primary" onClick={onSave}>
              保存
            </Button>
            <Button disabled={!canUndo} variant="secondary" onClick={onUndo}>
              撤销
            </Button>
            <Button disabled={!canRedo} variant="secondary" onClick={onRedo}>
              重做
            </Button>
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
        <div
          className="aether-editor-shell__toolbar"
          role="toolbar"
          aria-label="平面工具"
        >
          {toolbar}
        </div>
      </header>

      <div className="aether-editor-shell__body">
        <nav className="aether-editor-shell__tree" aria-label="项目树">
          {tree}
        </nav>
        <main className="aether-editor-shell__workspace" aria-label="二维平面编辑器">
          {workspace}
        </main>
        <aside className="aether-editor-shell__inspector" aria-label="检查器">
          {inspector}
        </aside>
      </div>
    </div>
  );
}
