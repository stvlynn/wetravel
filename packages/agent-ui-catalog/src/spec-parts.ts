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
  data?: unknown;
  state?: unknown;
  output?: unknown;
}

export interface AgentUiSafetyContext {
  allowedStreetViewImageIds?: ReadonlySet<string>;
}

const MAX_REFINEMENT_SPEC_CHARS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    if (!safeElementActions(element.type, element.on, context)) continue;
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
  context: AgentUiSafetyContext,
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
    if (binding.action === "openStreetView") {
      return isAllowedStreetViewImageId(binding.params, context);
    }
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

/** IDs are grounded only when the same assistant UIMessage contains a
 * successful street-view tool output. Text and tool input are never sources. */
export function allowedStreetViewImageIds(
  parts: readonly MessagePartLike[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const part of parts) {
    if (part.state !== "output-available" || !isRecord(part.output)) continue;
    if (part.type === "tool-streetViewSearch") {
      if (part.output.outcome !== "found" || !Array.isArray(part.output.images)) {
        continue;
      }
      for (const image of part.output.images) {
        if (isRecord(image) && typeof image.id === "string") ids.add(image.id);
      }
      continue;
    }
    if (
      part.type === "tool-streetViewInspect" &&
      typeof part.output.id === "string"
    ) {
      ids.add(part.output.id);
    }
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
