import {
  applySpecPatch,
  buildUserPrompt,
  nestedToFlat,
  SPEC_DATA_PART_TYPE,
  validateSpec,
  type ActionBinding,
  type Spec,
  type SpecDataPart,
} from "@json-render/core";
import { agentUiCatalog } from "./catalog";

export interface MessagePartLike {
  type: string;
  id?: unknown;
  text?: unknown;
  data?: unknown;
  state?: unknown;
  output?: unknown;
}

export interface AgentUiSafetyContext {
  allowedStreetViewImageIds?: ReadonlySet<string>;
}

export const AGENT_STATUS_DATA_PART_TYPE = "data-agent-status" as const;
export const AGENT_GROUNDING_DATA_PART_TYPE = "data-agent-grounding" as const;

export type AgentUiProtocolViolationReason =
  | "wrong_fence"
  | "flat_spec_leak"
  | "invalid_patch"
  | "invalid_catalog_spec"
  | "ungrounded_media";

export type AgentUiFallbackReason =
  | "place_not_found"
  | "invalid_request"
  | "service_unavailable";

export type AgentGroundingRequest =
  | {
      kind: "place";
      query: string;
      language: "en" | "zh";
      selectionIndex: number;
    }
  | {
      kind: "coordinate";
      lat: number;
      lng: number;
      language: "en" | "zh";
      selectionIndex: number;
    };

export interface AgentGroundingData {
  kind: "street-view";
  outcome:
    | "found"
    | "empty"
    | "place_not_found"
    | "invalid_request"
    | "service_unavailable";
  request?: AgentGroundingRequest;
  placeLabel?: string;
  imageIds: string[];
  selectedImageId?: string;
}

export interface AgentGroundingPart extends MessagePartLike {
  type: typeof AGENT_GROUNDING_DATA_PART_TYPE;
  id: string;
  data: AgentGroundingData;
}

export interface AgentRetryRequest {
  request: AgentGroundingRequest;
}

export type AgentUIDataParts = {
  "agent-grounding": AgentGroundingData;
  "agent-status": AgentStatusPart["data"];
  spec: SpecDataPart;
};

export interface AgentStatusPart extends MessagePartLike {
  type: typeof AGENT_STATUS_DATA_PART_TYPE;
  id: string;
  data: {
    kind: "generated-ui-fallback";
    reason: AgentUiFallbackReason;
    retryable: boolean;
    retryRequest?: AgentRetryRequest;
  };
}

export interface AgentUiProtocolValidation {
  valid: boolean;
  reason?: AgentUiProtocolViolationReason;
}

const MAX_REFINEMENT_SPEC_CHARS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(part: MessagePartLike): string {
  const value = part as MessagePartLike & { text?: unknown };
  return part.type === "text" && typeof value.text === "string" ? value.text : "";
}

function isFlatSpec(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.root === "string" &&
    isRecord(value.elements)
  );
}

function isJsonPatchLine(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.op === "string" &&
    typeof value.path === "string"
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function protocolViolationInText(
  text: string,
): AgentUiProtocolViolationReason | null {
  const trimmed = text.trim();
  if (isFlatSpec(parseJson(trimmed))) return "flat_spec_leak";

  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  for (const match of text.matchAll(fencePattern)) {
    const language = (match[1] ?? "").trim().toLowerCase();
    const body = (match[2] ?? "").trim();
    if (!body) continue;
    if (isFlatSpec(parseJson(body))) return "flat_spec_leak";

    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const patchLines = lines.map(parseJson);
    const containsPatch = patchLines.some(isJsonPatchLine);
    if (containsPatch && language !== "spec") return "wrong_fence";
    if (language === "spec") return "invalid_patch";
  }

  return null;
}

function hasUngroundedStreetViewElement(
  spec: Spec,
  allowedIds: ReadonlySet<string>,
): boolean {
  return Object.values(spec.elements).some((element) => {
    if (element.type !== "StreetViewCard") return false;
    return (
      !isRecord(element.props) ||
      typeof element.props.imageId !== "string" ||
      !allowedIds.has(element.props.imageId)
    );
  });
}

export function createAgentUiFallbackPart(
  reason: AgentUiFallbackReason,
  options: {
    id: string;
    retryable: boolean;
    retryRequest?: AgentRetryRequest;
  },
): AgentStatusPart {
  return {
    type: AGENT_STATUS_DATA_PART_TYPE,
    id: options.id,
    data: {
      kind: "generated-ui-fallback",
      reason,
      retryable: options.retryable,
      ...(options.retryRequest ? { retryRequest: options.retryRequest } : {}),
    },
  };
}

function isGroundingRequest(value: unknown): value is AgentGroundingRequest {
  if (!isRecord(value)) return false;
  if (
    (value.language !== "en" && value.language !== "zh") ||
    !Number.isInteger(value.selectionIndex) ||
    (value.selectionIndex as number) < 0 ||
    (value.selectionIndex as number) > 4
  ) {
    return false;
  }
  if (value.kind === "place") {
    return (
      typeof value.query === "string" &&
      value.query.length >= 2 &&
      value.query.length <= 160
    );
  }
  return (
    value.kind === "coordinate" &&
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

export function isAgentGroundingPart(
  part: MessagePartLike,
): part is AgentGroundingPart {
  if (
    part.type !== AGENT_GROUNDING_DATA_PART_TYPE ||
    typeof part.id !== "string" ||
    !isRecord(part.data) ||
    part.data.kind !== "street-view" ||
    !Array.isArray(part.data.imageIds) ||
    part.data.imageIds.length > 5 ||
    !part.data.imageIds.every(
      (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(id),
    )
  ) {
    return false;
  }
  if (
    part.data.outcome !== "found" &&
    part.data.outcome !== "empty" &&
    part.data.outcome !== "place_not_found" &&
    part.data.outcome !== "invalid_request" &&
    part.data.outcome !== "service_unavailable"
  ) {
    return false;
  }
  if (part.data.outcome === "invalid_request") {
    return (
      part.data.request === undefined &&
      part.data.imageIds.length === 0 &&
      part.data.selectedImageId === undefined
    );
  }
  if (!isGroundingRequest(part.data.request)) return false;
  if (part.data.outcome === "found" || part.data.outcome === "empty") {
    if (
      typeof part.data.placeLabel !== "string" ||
      part.data.placeLabel.length < 1 ||
      part.data.placeLabel.length > 160
    ) {
      return false;
    }
  }
  if (part.data.outcome === "found") {
    return (
      typeof part.data.selectedImageId === "string" &&
      part.data.imageIds.includes(part.data.selectedImageId)
    );
  }
  return part.data.selectedImageId === undefined;
}

export function isAgentStatusPart(part: MessagePartLike): part is AgentStatusPart {
  if (!(
    part.type === AGENT_STATUS_DATA_PART_TYPE &&
    typeof part.id === "string" &&
    isRecord(part.data) &&
    part.data.kind === "generated-ui-fallback" &&
    (part.data.reason === "place_not_found" ||
      part.data.reason === "invalid_request" ||
      part.data.reason === "service_unavailable") &&
    typeof part.data.retryable === "boolean"
  )) {
    return false;
  }
  if (part.data.reason === "service_unavailable") {
    return part.data.retryable
      ? isRecord(part.data.retryRequest) &&
          isGroundingRequest(part.data.retryRequest.request)
      : part.data.retryRequest === undefined;
  }
  return part.data.retryable === false && part.data.retryRequest === undefined;
}

/** Validate the complete transformed assistant message before it is exposed or
 * persisted. Prompt instructions improve conformance; this is the deterministic
 * protocol and grounding boundary. */
export function validateAgentUiProtocol(
  parts: readonly MessagePartLike[],
): AgentUiProtocolValidation {
  for (const part of parts) {
    const violation = protocolViolationInText(textOf(part));
    if (violation) return { valid: false, reason: violation };
  }

  const spec = specFromAgentUiParts(parts);
  if (!spec) return { valid: true };

  const allowedIds = allowedStreetViewImageIds(parts);
  if (hasUngroundedStreetViewElement(spec, allowedIds)) {
    return { valid: false, reason: "ungrounded_media" };
  }
  if (!safeAgentUiSpec(spec, { allowedStreetViewImageIds: allowedIds })) {
    return { valid: false, reason: "invalid_catalog_spec" };
  }
  return { valid: true };
}

export function isSpecDataPartPayload(value: unknown): value is SpecDataPart {
  if (!isRecord(value)) return false;
  if (value.type === "patch") return isRecord(value.patch);
  if (value.type === "flat" || value.type === "nested") {
    return isRecord(value.spec);
  }
  return false;
}

export function isAgentUiPart(part: MessagePartLike): boolean {
  return part.type === SPEC_DATA_PART_TYPE && isSpecDataPartPayload(part.data);
}

export function specFromAgentUiParts(parts: readonly MessagePartLike[]): Spec | null {
  const spec: Spec = { root: "", elements: {} };
  let found = false;

  for (const part of parts.slice(0, 240)) {
    if (
      part.type !== SPEC_DATA_PART_TYPE ||
      !isSpecDataPartPayload(part.data)
    ) {
      continue;
    }
    const payload = part.data;
    try {
      if (payload.type === "patch") {
        applySpecPatch(spec, payload.patch);
      } else if (payload.type === "flat") {
        Object.assign(spec, payload.spec);
      } else {
        Object.assign(spec, nestedToFlat(payload.spec));
      }
      found = true;
    } catch {
      // Ignore malformed patches; callers can still render accompanying text.
    }
  }

  return found ? spec : null;
}

export function validatedAgentUiSpec(
  parts: readonly MessagePartLike[],
): Spec | null {
  const spec = specFromAgentUiParts(parts);
  return spec
    ? safeAgentUiSpec(spec, {
        allowedStreetViewImageIds: allowedStreetViewImageIds(parts),
      })
    : null;
}

const componentDefinitions = agentUiCatalog.data.components as Record<
  string,
  { props: { safeParse: (value: unknown) => { success: boolean; data?: unknown } } }
>;

/** Return an allowlisted, size-bounded spec. Missing streamed children are
 * omitted until their patches arrive, so safe elements can render progressively. */
export function safeAgentUiSpec(
  spec: Spec,
  context: AgentUiSafetyContext = {},
): Spec | null {
  if (Object.keys(spec.elements).length > 80) return null;
  if (JSON.stringify(spec).length > 64_000) return null;
  if (!spec.root || typeof spec.root !== "string") return null;

  const safeElements: Spec["elements"] = {};
  for (const [key, element] of Object.entries(spec.elements)) {
    if (element.watch || element.repeat) continue;
    if (element.visible !== undefined && typeof element.visible !== "boolean") {
      continue;
    }
    if (!safeElementActions(element.type, element.on)) continue;
    const definition = componentDefinitions[element.type];
    const parsed = definition?.props.safeParse(element.props);
    if (!parsed?.success) continue;
    if (
      element.type === "StreetViewCard" &&
      !isAllowedStreetViewImageId(parsed.data, context)
    ) {
      continue;
    }
    safeElements[key] = {
      type: element.type,
      props: parsed.data as Record<string, unknown>,
      children: element.children ?? [],
      ...(element.visible === undefined ? {} : { visible: element.visible }),
      ...(element.on === undefined ? {} : { on: element.on }),
    };
  }

  if (!safeElements[spec.root]) return null;
  for (const element of Object.values(safeElements)) {
    element.children = (element.children ?? []).filter(
      (child) => safeElements[child] !== undefined,
    );
  }

  const safeSpec: Spec = { root: spec.root, elements: safeElements };
  return validateSpec(safeSpec).valid ? safeSpec : null;
}

const actionDefinitions = agentUiCatalog.data.actions as Record<
  string,
  { params?: { safeParse: (value: unknown) => { success: boolean } } }
>;

function safeElementActions(
  componentType: string,
  events: Record<string, ActionBinding | ActionBinding[]> | undefined,
): boolean {
  if (!events) return true;
  if (componentType !== "ActionButton") return false;
  if (Object.keys(events).some((event) => event !== "press")) return false;

  const bindings = Object.values(events).flatMap((binding) =>
    Array.isArray(binding) ? binding : [binding],
  );
  return bindings.every((binding) => {
    if (binding.confirm || binding.onSuccess || binding.onError) return false;
    const definition = actionDefinitions[binding.action];
    if (!definition) return false;
    const parsed = definition.params?.safeParse(binding.params ?? {});
    if (parsed?.success !== true) return false;
    return true;
  });
}

function isAllowedStreetViewImageId(
  value: unknown,
  context: AgentUiSafetyContext,
): boolean {
  if (!isRecord(value) || typeof value.imageId !== "string") return false;
  return context.allowedStreetViewImageIds?.has(value.imageId) === true;
}

/** IDs are grounded only by a persistent successful application part in the
 * same assistant UIMessage. Text, model output, and tool parts are never sources. */
export function allowedStreetViewImageIds(
  parts: readonly MessagePartLike[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const part of parts) {
    if (!isAgentGroundingPart(part) || part.data.outcome !== "found") continue;
    for (const imageId of part.data.imageIds) ids.add(imageId);
  }
  return ids;
}

/** Collapse streamed generated UI into one grounded flat spec. Other message
 * parts are preserved verbatim. */
export function sanitizeAgentUiParts<T extends MessagePartLike>(
  parts: readonly T[],
): T[] {
  const nonUiParts = parts.filter((part) => !isAgentUiPart(part));
  const spec = specFromAgentUiParts(parts);
  if (!spec) return [...nonUiParts];
  const safeSpec = safeAgentUiSpec(spec, {
    allowedStreetViewImageIds: allowedStreetViewImageIds(parts),
  });
  if (!safeSpec) return [...nonUiParts];
  return [
    ...nonUiParts,
    {
      type: SPEC_DATA_PART_TYPE,
      data: { type: "flat", spec: safeSpec },
    } as T,
  ];
}

/** Return a complete, bounded spec suitable for json-render's official
 * `buildUserPrompt({ currentSpec })` refinement flow. Street-view specs are
 * deliberately turn-local because their image ids must be grounded again by
 * a successful tool output in the new assistant message. */
export function refinableAgentUiSpec(
  parts: readonly MessagePartLike[],
  maxChars = MAX_REFINEMENT_SPEC_CHARS,
): Spec | null {
  const spec = validatedAgentUiSpec(parts);
  if (!spec) return null;
  if (
    Object.values(spec.elements).some(
      (element) => element.type === "StreetViewCard",
    )
  ) {
    return null;
  }
  return JSON.stringify(spec).length <= maxChars ? spec : null;
}

/** Build the structured edit prompt recommended by json-render. The existing
 * spec is never placed in a prior assistant text message. */
export function buildAgentUiRefinementPrompt(
  prompt: string,
  currentSpec: Spec,
): string {
  return buildUserPrompt({
    prompt,
    currentSpec,
    editModes: ["patch"],
  });
}
