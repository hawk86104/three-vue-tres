import { Badge, Button, Dialog, Field, Panel, StatusNotice } from "@aethertwin/design-system";
import { useState } from "react";

const saveStates = ["dirty", "saving", "saved", "error", "recovered"] as const;
const saveStateTones = {
  dirty: "info",
  saving: "info",
  saved: "saved",
  error: "error",
  recovered: "recovered",
} as const;

export function UiGallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastAction, setLastAction] = useState("尚未操作");

  return (
    <main className="studio-ui-gallery">
      <header>
        <p className="studio-project-center__eyebrow">DEVELOPMENT REFERENCE</p>
        <h1>Aether UI Gallery</h1>
        <p>仅展示 M0 已实现的界面状态。</p>
      </header>

      <Panel aria-label="按钮状态">
        <h2>Button</h2>
        <div className="studio-gallery-row">
          <Button onClick={() => setLastAction("主要按钮")}>主要按钮</Button>
          <Button variant="secondary" onClick={() => setLastAction("次要按钮")}>
            次要按钮
          </Button>
          <Button variant="ghost" onClick={() => setLastAction("幽灵按钮")}>
            幽灵按钮
          </Button>
          <Button variant="danger" onClick={() => setLastAction("危险按钮")}>
            危险按钮
          </Button>
          <Button disabled>禁用按钮</Button>
          <Button busy>处理中</Button>
        </div>
        <p aria-live="polite" data-testid="gallery-last-action">
          最近操作：{lastAction}
        </p>
      </Panel>

      <Panel aria-label="字段状态">
        <h2>Field</h2>
        <div className="studio-gallery-grid">
          <Field label="默认字段" defaultValue="AetherTwin" />
          <Field label="帮助字段" helpText="这是帮助信息" defaultValue="示例" />
          <Field label="必填字段" required defaultValue="必填内容" />
          <Field label="错误字段" error="字段内容无效" defaultValue="错误值" />
          <Field label="禁用字段" disabled value="不可编辑" readOnly />
        </div>
      </Panel>

      <Panel aria-label="示例面板">
        <h2>Panel · Empty · Error</h2>
        <div className="studio-empty-state">空状态：暂无项目</div>
        <StatusNotice tone="error">错误状态：保存失败</StatusNotice>
      </Panel>

      <Panel aria-label="保存状态">
        <h2>Save states</h2>
        <div className="studio-gallery-row">
          {saveStates.map((state) => (
            <StatusNotice
              className={`studio-save-state studio-save-state--${state}`}
              data-testid={`save-state-${state}`}
              key={state}
              tone={saveStateTones[state]}
            >
              {state}
            </StatusNotice>
          ))}
        </div>
      </Panel>

      <Panel aria-label="项目档案徽章">
        <h2>Profile badges</h2>
        <div className="studio-gallery-row">
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="accent">accent</Badge>
          <Badge tone="success">success</Badge>
          <Badge tone="danger">danger</Badge>
          <Badge tone="accent">showroom</Badge>
          <Badge tone="accent">market</Badge>
        </div>
      </Panel>

      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        显示示例对话框
      </Button>
      <Dialog
        open={dialogOpen}
        title="示例对话框"
        description="对话框的标题、说明、内容与关闭动作。"
        onOpenChange={setDialogOpen}
      >
        <p>这是 M0 对话框状态。</p>
        <Button onClick={() => setDialogOpen(false)}>确认</Button>
      </Dialog>
    </main>
  );
}
