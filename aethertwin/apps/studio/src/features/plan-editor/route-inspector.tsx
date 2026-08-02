import type {
  RouteNetwork,
  RouteNode,
  RouteNodeKind,
} from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { useEffect, useRef, useState } from "react";

export interface RouteInspectorProps {
  readonly network: RouteNetwork;
  readonly node: RouteNode;
  readonly editable: boolean;
  readonly onApplyRouteNetworkPatch: (
    before: RouteNetwork,
    after: RouteNetwork,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

const nodeKinds: readonly RouteNodeKind[] = [
  "junction",
  "entrance",
  "showroom-stop",
];

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function parsedTags(value: string): readonly string[] {
  return [...new Set(
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  )];
}

export function RouteInspector({
  network,
  node,
  editable,
  onApplyRouteNetworkPatch,
  onError,
}: RouteInspectorProps) {
  const [name, setName] = useState(node.name);
  const [kind, setKind] = useState<RouteNodeKind>(node.kind);
  const [tags, setTags] = useState(node.tags.join(", "));
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const selectionIdentity = `${network.id}:${node.id}`;
  const selectionIdentityRef = useRef(selectionIdentity);
  const submissionGeneration = useRef(0);
  selectionIdentityRef.current = selectionIdentity;

  useEffect(() => {
    submissionGeneration.current += 1;
    setName(node.name);
    setKind(node.kind);
    setTags(node.tags.join(", "));
    setError(null);
    setBusy(false);
  }, [network.id, node.id, node.name, node.kind, node.tags]);

  async function apply(): Promise<void> {
    if (!editable || busy) return;
    const identityAtStart = selectionIdentity;
    const generation = submissionGeneration.current + 1;
    submissionGeneration.current = generation;
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      setError(new Error("路线节点名称不能为空。"));
      return;
    }
    const nextNode: RouteNode = {
      ...node,
      name: normalizedName,
      tags: parsedTags(tags),
      kind,
    };
    const after: RouteNetwork = {
      ...network,
      nodes: network.nodes.map((candidate) => (
        candidate.id === node.id ? nextNode : candidate
      )),
    };
    setBusy(true);
    setError(null);
    try {
      await onApplyRouteNetworkPatch(network, after);
    } catch (value) {
      if (
        selectionIdentityRef.current !== identityAtStart
        || submissionGeneration.current !== generation
      ) return;
      const handled = errorValue(value);
      setError(handled);
      onError(handled);
    } finally {
      if (
        selectionIdentityRef.current === identityAtStart
        && submissionGeneration.current === generation
      ) {
        setBusy(false);
      }
    }
  }

  return (
    <div className="studio-inspector-form">
      <h2>路线节点</h2>
      {error === null ? null : (
        <StatusNotice tone="error">{error.message}</StatusNotice>
      )}
      <dl className="studio-plan-inspector__metadata">
        <div><dt>网络</dt><dd>{network.name}</dd></div>
        <div><dt>节点 ID</dt><dd>{node.id}</dd></div>
        <div><dt>坐标</dt><dd>X: {node.position.x} mm</dd></div>
        <div><dt>坐标</dt><dd>Y: {node.position.y} mm</dd></div>
      </dl>
      <Field
        label="路线节点名称"
        value={name}
        readOnly={!editable}
        onChange={(event) => {
          setName(event.currentTarget.value);
          setError(null);
        }}
      />
      <label className="aether-field">
        <span className="aether-field__label">路线节点类型</span>
        <select
          value={kind}
          disabled={!editable}
          onChange={(event) => {
            setKind(event.currentTarget.value as RouteNodeKind);
            setError(null);
          }}
        >
          {nodeKinds.map((candidate) => (
            <option key={candidate} value={candidate}>{candidate}</option>
          ))}
        </select>
      </label>
      <Field
        label="路线节点标签"
        value={tags}
        readOnly={!editable}
        helpText="使用英文逗号分隔标签"
        onChange={(event) => {
          setTags(event.currentTarget.value);
          setError(null);
        }}
      />
      <Button
        variant="secondary"
        disabled={!editable || busy}
        onClick={() => void apply()}
      >
        应用路线节点
      </Button>
    </div>
  );
}
