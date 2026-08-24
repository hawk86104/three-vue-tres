import type {
  RouteNetwork,
  RouteNode,
  RouteNodeKind,
} from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { useEffect, useRef, useState } from "react";
import { ROUTE_NODE_KIND_MESSAGE_IDS } from "../../i18n/display-message-ids";
import { message, type StudioMessageDescriptor } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";
import { localizedErrorDescriptor } from "../../i18n/localized-error";

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
  onError: _onError,
}: RouteInspectorProps) {
  const { format, t } = useI18n();
  const [name, setName] = useState(node.name);
  const [kind, setKind] = useState<RouteNodeKind>(node.kind);
  const [tags, setTags] = useState(node.tags.join(", "));
  const [error, setError] = useState<StudioMessageDescriptor | null>(null);
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
      setError(message("route.node.invalidName"));
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
      setError(localizedErrorDescriptor(value));
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
      <h2>{t("route.node.heading")}</h2>
      {error === null ? null : (
        <StatusNotice tone="error">{format(error)}</StatusNotice>
      )}
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{t("route.node.network")}</dt><dd>{network.name}</dd></div>
        <div><dt>{t("route.node.id")}</dt><dd>{node.id}</dd></div>
        <div><dt>{t("route.node.coordinate")}</dt><dd>{t("route.node.x", { value: node.position.x })}</dd></div>
        <div><dt>{t("route.node.coordinate")}</dt><dd>{t("route.node.y", { value: node.position.y })}</dd></div>
      </dl>
      <Field
        label={t("route.node.name")}
        value={name}
        readOnly={!editable}
        onChange={(event) => {
          setName(event.currentTarget.value);
          setError(null);
        }}
      />
      <label className="aether-field">
        <span className="aether-field__label">{t("route.node.type")}</span>
        <select
          value={kind}
          disabled={!editable}
          onChange={(event) => {
            setKind(event.currentTarget.value as RouteNodeKind);
            setError(null);
          }}
        >
          {nodeKinds.map((candidate) => (
            <option key={candidate} value={candidate}>{t(ROUTE_NODE_KIND_MESSAGE_IDS[candidate])}</option>
          ))}
        </select>
      </label>
      <Field
        label={t("route.node.tags")}
        value={tags}
        readOnly={!editable}
        helpText={t("route.node.tagsHelp")}
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
        {t("route.node.apply")}
      </Button>
    </div>
  );
}
