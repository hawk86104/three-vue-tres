import type { ProjectSnapshot } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { useEffect, useId, useState } from "react";
import { validateProjectName } from "../project-center/create-project-dialog";

export interface ProjectInspectorProps {
  snapshot: ProjectSnapshot;
  onHandledStoreError?(error: Error | null): void;
  onRename(name: string): Promise<void>;
  onSetTags(tags: readonly string[]): Promise<void>;
}

function readableError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function logReference(value: unknown): string | null {
  if (value === null || typeof value !== "object" || !("logRef" in value)) {
    return null;
  }
  return typeof value.logRef === "string" && value.logRef.length > 0 ? value.logRef : null;
}

function parsedTags(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

export function ProjectInspector({
  snapshot,
  onHandledStoreError = () => undefined,
  onRename,
  onSetTags,
}: ProjectInspectorProps) {
  const [name, setName] = useState(snapshot.project.name);
  const [tags, setTags] = useState(snapshot.project.tags.join(", "));
  const [nameError, setNameError] = useState<string | null>(null);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [nameHandledError, setNameHandledError] = useState<Error | null>(null);
  const [tagsHandledError, setTagsHandledError] = useState<Error | null>(null);
  const nameErrorId = `project-inspector-name-error-${useId().replaceAll(":", "")}`;
  const tagsErrorId = `project-inspector-tags-error-${useId().replaceAll(":", "")}`;

  useEffect(() => {
    setName(snapshot.project.name);
    setTags(snapshot.project.tags.join(", "));
    setNameError(null);
    setTagsError(null);
    setNameHandledError(null);
    setTagsHandledError(null);
  }, [snapshot]);

  function clearNameError() {
    setNameError(null);
    setNameHandledError(null);
    onHandledStoreError(tagsHandledError);
  }

  function clearTagsError() {
    setTagsError(null);
    setTagsHandledError(null);
    onHandledStoreError(nameHandledError);
  }

  async function commitName() {
    const validation = validateProjectName(name);
    if (!validation.ok) {
      setNameError(validation.error);
      setNameHandledError(null);
      onHandledStoreError(tagsHandledError);
      return;
    }
    if (validation.name === snapshot.project.name) {
      clearNameError();
      return;
    }
    try {
      await onRename(validation.name);
      clearNameError();
    } catch (error) {
      const handled = errorValue(error);
      onHandledStoreError(handled);
      setNameError(readableError(handled));
      setNameHandledError(handled);
    }
  }

  async function commitTags() {
    const nextTags = parsedTags(tags);
    if (
      nextTags.length === snapshot.project.tags.length &&
      nextTags.every((tag, index) => tag === snapshot.project.tags[index])
    ) {
      clearTagsError();
      return;
    }
    try {
      await onSetTags(nextTags);
      clearTagsError();
    } catch (error) {
      const handled = errorValue(error);
      onHandledStoreError(handled);
      setTagsError(readableError(handled));
      setTagsHandledError(handled);
    }
  }

  const nameLogRef = logReference(nameHandledError);
  const tagsLogRef = logReference(tagsHandledError);

  return (
    <div className="studio-inspector-form">
      <h2>检查器</h2>
      {nameError === null ? null : (
        <StatusNotice id={nameErrorId} tone="error">
          <span>{nameError}</span>
          {nameLogRef === null ? null : <span>日志参考：{nameLogRef}</span>}
        </StatusNotice>
      )}
      {tagsError === null ? null : (
        <StatusNotice id={tagsErrorId} tone="error">
          <span>{tagsError}</span>
          {tagsLogRef === null ? null : <span>日志参考：{tagsLogRef}</span>}
        </StatusNotice>
      )}
      <Field
        label="项目名称"
        value={name}
        aria-describedby={nameError === null ? undefined : nameErrorId}
        aria-invalid={nameError === null ? undefined : true}
        onChange={(event) => {
          setName(event.currentTarget.value);
          clearNameError();
        }}
        onBlur={() => void commitName()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitName()}
      >
        应用名称
      </Button>
      <Field
        label="项目标签"
        value={tags}
        aria-describedby={tagsError === null ? undefined : tagsErrorId}
        aria-invalid={tagsError === null ? undefined : true}
        helpText="使用英文逗号分隔标签"
        onChange={(event) => {
          setTags(event.currentTarget.value);
          clearTagsError();
        }}
        onBlur={() => void commitTags()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitTags()}
      >
        应用标签
      </Button>
    </div>
  );
}
