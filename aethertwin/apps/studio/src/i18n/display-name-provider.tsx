import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { StudioMessageDescriptor } from "./format-message";
import { useI18n } from "./locale-provider";

export type DisplayNameSubjectKind =
  | "project"
  | "floor"
  | "layer"
  | "plan-reference"
  | "entity"
  | "vendor"
  | "product-content"
  | "media-asset"
  | "route-network"
  | "guided-route"
  | "material"
  | "camera-shot"
  | "story-sequence";

export interface DisplayNameSubject {
  readonly kind: DisplayNameSubjectKind;
  readonly id: string;
  readonly authoredName: string;
}

export type StudioDisplayNameResolver = (
  subject: DisplayNameSubject,
) => StudioMessageDescriptor | null;

export type StudioDisplayName = (subject: DisplayNameSubject) => string;

const defaultResolver: StudioDisplayNameResolver = () => null;
const DisplayNameContext = createContext<StudioDisplayName>(
  (subject) => subject.authoredName,
);

export function DisplayNameProvider({
  resolver = defaultResolver,
  children,
}: {
  readonly resolver?: StudioDisplayNameResolver;
  readonly children: ReactNode;
}): React.JSX.Element {
  const { format } = useI18n();
  const displayName = useCallback((subject: DisplayNameSubject) => {
    const descriptor = resolver(subject);
    return descriptor === null ? subject.authoredName : format(descriptor);
  }, [format, resolver]);

  return <DisplayNameContext.Provider value={displayName}>{children}</DisplayNameContext.Provider>;
}

export function useDisplayName(): StudioDisplayName {
  return useContext(DisplayNameContext);
}
