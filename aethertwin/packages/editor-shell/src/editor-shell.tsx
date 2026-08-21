import { Badge, Button, StatusNotice } from "@aethertwin/design-system";
import type { SaveState } from "@aethertwin/core-model";
import type React from "react";
import "./editor-shell.css";

export type EditorSaveState = SaveState;

export interface EditorShellMessages {
  readonly back: string;
  readonly undo: string;
  readonly redo: string;
  readonly saveStates: Readonly<Record<EditorSaveState, string>>;
  readonly leftPanelLabel: string;
  readonly canvasLabel: string;
  readonly rightPanelLabel: string;
  readonly save?: string;
  readonly close?: string;
}

export interface EditorShellProps {
  readonly projectName: string;
  readonly profileLabel: string;
  readonly messages: EditorShellMessages;
  readonly headerAccessory?: React.ReactNode;
  readonly saveState: SaveState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onBack: () => void;
  readonly onSave: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClose: () => void;
  readonly toolbar: React.ReactNode;
  readonly tree: React.ReactNode;
  readonly workspace: React.ReactNode;
  readonly inspector: React.ReactNode;
}

const saveStateTone: Readonly<Record<EditorSaveState, "error" | "saved" | "recovered" | "info">> = {
  dirty: "info",
  saving: "info",
  saved: "saved",
  error: "error",
  recovered: "recovered",
};

export function EditorShell({
  projectName,
  profileLabel,
  messages,
  headerAccessory,
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
  const isSaving = saveState === "saving";

  return (
    <div className="aether-editor-shell">
      <header className="aether-editor-shell__header">
        <div className="aether-editor-shell__topbar">
          <Button variant="ghost" onClick={onBack}>{messages.back}</Button>
          <div className="aether-editor-shell__identity">
            <h1 className="aether-editor-shell__project-name">{projectName}</h1>
            <Badge tone="accent">{profileLabel}</Badge>
          </div>
          <StatusNotice
            className="aether-editor-shell__save-status"
            tone={saveStateTone[saveState]}
            data-save-state={saveState}
          >
            {messages.saveStates[saveState]}
          </StatusNotice>
          <div className="aether-editor-shell__actions">
            <Button busy={isSaving} variant="primary" onClick={onSave}>
              {messages.save ?? messages.saveStates.saved}
            </Button>
            <Button disabled={!canUndo} variant="secondary" onClick={onUndo}>{messages.undo}</Button>
            <Button disabled={!canRedo} variant="secondary" onClick={onRedo}>{messages.redo}</Button>
            <Button variant="ghost" onClick={onClose}>{messages.close ?? messages.back}</Button>
            {headerAccessory}
          </div>
        </div>
        <div className="aether-editor-shell__toolbar" role="toolbar" aria-label={messages.canvasLabel}>
          {toolbar}
        </div>
      </header>

      <div className="aether-editor-shell__body">
        <nav className="aether-editor-shell__tree" aria-label={messages.leftPanelLabel}>{tree}</nav>
        <main className="aether-editor-shell__workspace" aria-label={messages.canvasLabel}>{workspace}</main>
        <aside className="aether-editor-shell__inspector" aria-label={messages.rightPanelLabel}>{inspector}</aside>
      </div>
    </div>
  );
}
