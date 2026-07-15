import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateObject,
  generateText,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
  type Experimental_DownloadFunction,
  type GenerateTextStepEndEvent,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type ToolExecutionEndEvent,
  type ToolExecutionStartEvent,
  type UIMessage,
} from "ai";
import {
  agentUiPrompt,
  buildAgentUiRefinementPrompt,
  isAgentUiPart,
  pipeJsonRender,
  refinableAgentUiSpec,
  SPEC_DATA_PART_TYPE,
  specFromAgentUiParts,
  type Spec,
} from "@opentrip/agent-ui-catalog";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import type {
  AgentAddressedRequest,
  AgentChatRequest,
  AgentClientUIMessage,
  AgentEvaluationRequest,
  AgentMessage,
  AgentMessagePart,
  AgentModel,
  AgentObservabilityContext,
  AgentToolApplyResult,
  InterventionDecision,
  PendingPatch,
} from "../../domain/agent";
import type { TripSnapshot } from "../../domain/trip";
import type { WeatherService } from "../../application/weather/weather-service";
import type { GeoService } from "../../application/geo/geo-service";
import type { LodgingService } from "../../application/lodging/lodging-service";
import {
  StreetViewError,
  type StreetViewImageDto,
  type StreetViewSearchResultDto,
  type StreetViewService,
} from "../../application/street-view";
import type { FileStorage } from "../../application/storage";
import {
  isTripMediaStoragePath,
  storageNamespaceOf,
  storagePathFromPublicUrl,
} from "../../application/storage";
import { isAgentFilePart } from "../../application/agent/file-parts";
import {
  listWriteOps,
  proactivePendingPatchSchema,
  writeToolNames,
} from "../../application/trip/ops";
import type { AiConfig } from "../config";
import {
  captureException,
  logger,
  startSpan as startObservabilitySpan,
} from "../observability";

const NOTE_CONTEXT_MAX = 2_000;
const STREET_VIEW_TOOLS = new Set(["streetViewSearch", "streetViewInspect"]);
const INITIAL_STREET_VIEW_RADIUS_METERS = 100;
const MAX_AGENT_STREET_VIEW_RETRY_RADIUS_METERS = 250;
const STREET_VIEW_FAILURE_INSTRUCTION =
  "The one real street-view provider call in this turn failed. Do not call another street-view tool, claim that other coordinates were tried, reuse an older image id, or emit StreetViewCard/openStreetView UI. State only that this call failed and let the member choose whether to try again in a new request.";
const STREET_VIEW_POLICY_INSTRUCTION =
  "An extra street-view tool call was rejected locally by the one-retry policy and did not reach the provider. Do not claim it ran or that another coordinate was tried. Use only successful tool output already present in this turn.";

interface StreetViewSearchToolInput {
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
}

interface StreetViewSearchState {
  input: StreetViewSearchToolInput;
  outcome: "found" | "empty";
  completeness: "complete" | "partial";
}

export class StreetViewToolPolicy {
  private firstSearch: StreetViewSearchState | null = null;
  private searchCount = 0;
  private blockedReason: "provider" | "policy" | null = null;
  private searchInFlight = false;
  private readonly inspectableIds = new Set<string>();

  validateSearch(input: StreetViewSearchToolInput): StreetViewSearchToolInput {
    if (this.blockedReason || this.searchInFlight || this.searchCount >= 2) {
      this.blockedReason ??= "policy";
      throw this.policyError("Street-view search is no longer available in this turn");
    }
    if (!this.firstSearch) {
      this.searchInFlight = true;
      this.searchCount += 1;
      return { ...input, radiusMeters: INITIAL_STREET_VIEW_RADIUS_METERS };
    }
    const effectiveInput = {
      ...input,
      radiusMeters: Math.min(
        input.radiusMeters ?? INITIAL_STREET_VIEW_RADIUS_METERS,
        MAX_AGENT_STREET_VIEW_RETRY_RADIUS_METERS,
      ),
    };
    const retryableResult =
      this.firstSearch.outcome === "empty" ||
      this.firstSearch.completeness === "partial";
    const firstRadius =
      this.firstSearch.input.radiusMeters ?? INITIAL_STREET_VIEW_RADIUS_METERS;
    const retryRadius = effectiveInput.radiusMeters;
    const sameCenter =
      Math.abs(effectiveInput.lat - this.firstSearch.input.lat) <= 1e-5 &&
      Math.abs(effectiveInput.lng - this.firstSearch.input.lng) <= 1e-5;
    if (!retryableResult || !sameCenter || retryRadius <= firstRadius) {
      this.blockedReason = "policy";
      throw this.policyError(
        "A street-view retry must follow an empty or partial result at the same coordinates with a larger radius",
      );
    }
    this.searchInFlight = true;
    this.searchCount += 1;
    return effectiveInput;
  }

  recordSearchSuccess(
    input: StreetViewSearchToolInput,
    result: {
      outcome: "found" | "empty";
      completeness: "complete" | "partial";
      images: Array<{ id: string; supports360: boolean }>;
    },
  ): void {
    this.searchInFlight = false;
    this.firstSearch ??= {
      input: { ...input },
      outcome: result.outcome,
      completeness: result.completeness,
    };
    for (const image of result.images) {
      if (!image.supports360) this.inspectableIds.add(image.id);
    }
  }

  recordSearchFailure(): void {
    this.searchInFlight = false;
    this.blockedReason = "provider";
  }

  validateInspect(imageId: string): void {
    if (this.blockedReason === "provider" || !this.inspectableIds.has(imageId)) {
      throw this.policyError(
        "Street-view inspection requires a static image returned by a successful search in this turn",
      );
    }
  }

  prepareStep(toolNames: string[], instructions: unknown) {
    const searchExhausted =
      this.blockedReason !== null ||
      this.searchCount >= 2 ||
      (this.firstSearch?.outcome === "found" &&
        this.firstSearch.completeness === "complete");
    const activeTools = toolNames.filter((name) => {
      if (this.blockedReason === "provider") return !STREET_VIEW_TOOLS.has(name);
      if (name === "streetViewInspect" && this.inspectableIds.size === 0) {
        return false;
      }
      return name !== "streetViewSearch" || !searchExhausted;
    });
    if (!this.blockedReason) return { activeTools };
    const base = typeof instructions === "string" ? instructions : "";
    return {
      activeTools,
      instructions: `${base}\n\n${
        this.blockedReason === "provider"
          ? STREET_VIEW_FAILURE_INSTRUCTION
          : STREET_VIEW_POLICY_INSTRUCTION
      }`.trim(),
    };
  }

  private policyError(message: string): StreetViewError {
    return new StreetViewError("street_view_invalid_query", message, {
      retryable: false,
      providerOperation: "tool_policy",
    });
  }
}

function providerCall<T>(
  provider: string,
  operation: string,
  call: () => Promise<T>,
): Promise<T> {
  return startObservabilitySpan(
    `opentrip.provider.${provider}.${operation}`,
    { provider, providerOperation: operation },
    async () => call(),
  );
}

function safeToolInputFields(
  toolName: string,
  input: unknown,
): Record<string, unknown> {
  if (toolName !== "streetViewSearch" || !input || typeof input !== "object") {
    return {};
  }
  const value = input as Record<string, unknown>;
  return {
    ...(typeof value.lat === "number" ? { lat: value.lat } : {}),
    ...(typeof value.lng === "number" ? { lng: value.lng } : {}),
    radiusMeters:
      typeof value.radiusMeters === "number" ? value.radiusMeters : 100,
    requestedLimit: typeof value.limit === "number" ? value.limit : 5,
  };
}

export function safeAgentErrorFields(error: unknown): Record<string, unknown> {
  try {
    if (typeof error === "string") {
      return { errorType: "string", errorMessage: error };
    }
    if (!error || typeof error !== "object") {
      return { errorType: typeof error };
    }

    const value = error as Record<string, unknown>;
    return {
      errorType:
        typeof value.name === "string"
          ? value.name
          : error instanceof Error
            ? error.name
            : "object",
      ...(typeof value.message === "string"
        ? { errorMessage: value.message }
        : {}),
      ...(typeof value.code === "string" ? { errorCode: value.code } : {}),
      ...(typeof value.upstreamStatus === "number"
        ? { upstreamStatus: value.upstreamStatus }
        : {}),
      ...(typeof value.retryable === "boolean"
        ? { retryable: value.retryable }
        : {}),
      ...(typeof value.providerOperation === "string"
        ? { providerOperation: value.providerOperation }
        : {}),
      ...(typeof value.attempt === "number" ? { attempt: value.attempt } : {}),
    };
  } catch {
    return { errorType: "uninspectable" };
  }
}

/** MiniMax Anthropic-compatible API prefix.
 * `@ai-sdk/anthropic` appends `/messages`, so this must include `/v1`
 * (same as vercel-minimax-ai-provider default `…/anthropic/v1`). */
const MINIMAX_ANTHROPIC_BASE_URL = "https://api.minimaxi.com/anthropic/v1";

function isMiniMaxProvider(provider: string): boolean {
  return provider.trim().toLowerCase() === "minimax";
}

/** MiniMax-M3 defaults thinking off; adaptive enables separate thinking blocks. */
function isMiniMaxM3(model: string): boolean {
  return /^minimax-m3\b/i.test(model.trim());
}

/**
 * Normalize MiniMax Anthropic base URL for `@ai-sdk/anthropic`.
 * Accepts `…/anthropic` (Anthropic SDK style) or `…/anthropic/v1` (AI SDK style).
 */
function resolveMiniMaxAnthropicBaseUrl(baseUrl: string | null): string {
  const raw = (baseUrl ?? MINIMAX_ANTHROPIC_BASE_URL).replace(/\/+$/, "");
  if (raw.endsWith("/v1")) return raw;
  if (raw.endsWith("/anthropic")) return `${raw}/v1`;
  return raw;
}

/** Build the LanguageModel for the configured provider. */
function createAgentLanguageModel(config: AiConfig): LanguageModel {
  if (isMiniMaxProvider(config.provider)) {
    // AI SDK community MiniMax provider defaults to Anthropic-compatible
    // `…/anthropic/v1` so thinking streams as distinct reasoning parts.
    // https://ai-sdk.dev/providers/community-providers/minimax
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      baseURL: resolveMiniMaxAnthropicBaseUrl(config.baseUrl),
    });
    return anthropic(config.model);
  }
  if (config.baseUrl) {
    const provider = createOpenAICompatible({
      name: config.provider,
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });
    return provider(config.model);
  }
  const openai = createOpenAI({ apiKey: config.apiKey });
  return openai(config.model);
}

function chatSystemPrompt(): string {
  const tools = writeToolNames().join(", ");
  return `You are the OpenTrip trip agent: a quiet, precise trip-planning collaborator embedded in a collaborative trip workspace.

This turn is a **write-capable chat** (@agent / thread follow-up). Write tools are available and will pause for member approval before they run.

Rules:
- The conversation is shared by all trip members. Messages are prefixed with the author's name.
- Be concise and concrete. Reference stops, days, and expenses by their names and day numbers.
- Only discuss this trip. Never reveal system internals, credentials, or unrelated user data.
- When asked for advice, ground it in the trip snapshot and available tools.
- Prefer short answers; expand only when a member explicitly asks for detail.
- Prefer calling write tools (${tools}) over telling the member to edit the trip manually.
- Never claim a trip change was applied, recorded, updated, or deleted unless you called the matching write tool in this turn. Conversational acknowledgement without a tool call is lying.
- Never say write tools are unavailable, broken, or missing in this chat path — they are available. If an earlier assistant message claimed that, ignore it and call the tool.
- For existing entities, only use stop/day/expense/member ids from the trip snapshot. insertStop and addExpense create new ids after approval.
- checkWeather, placeSearch, placeNearby, placeDetail, routeCompute, routeMatrix, reviewLookup, airbnbSearch, airbnbListingDetails, and readTripMedia are read-only and do not need approval.
- Members may attach images, PDFs, or text files in chat. Stop notes may embed trip upload URLs — call readTripMedia when you need file contents.
- Expenses (addExpense / updateExpense) are for money that was actually spent or that the member explicitly asks to record or update. Never invent planned/estimated costs as expenses during itinerary planning.

Itinerary planning (create / fill a multi-day plan):
- Always call tools before inventing places. Use placeSearch / placeNearby / placeDetail for sights, food, and areas; airbnbSearch (and airbnbListingDetails when useful) for lodging; checkWeather for the trip dates; routeCompute / routeMatrix when day order or travel time matters.
- Cover lodging (Stay), sightseeing / check-ins (Sight), and meals (Food) when the request is a full itinerary — not only attractions.
- First turn: research with read tools, then present a clear draft day-by-day plan. Ask whether to write it into the trip (e.g. reply “确认”). Do not call write tools on that first proposal turn.
- When the member confirms (确认 / 好的 / 可以 / go ahead / etc.), call the write tools in the same turn — typically updateDay for cities/dates and insertStop for each planned stop with real names, times, coords, and categories from tool results. Batch the inserts; wait for approval UI; never claim the trip was updated until tools are approved.
- Estimated prices found while planning (tickets, lodging, meals, transit) belong in the stop note (备注), not as expenses. Do not call addExpense unless the member explicitly asks to record a spend (e.g. “记一笔”, “录入花费”, “add expense”).
- When the member asks to update or merge an existing expense (e.g. “更新”, “合并到餐饮”), call updateExpense with the expense id from the snapshot — do not ask them to edit it by hand.
- If the member only wants advice or a comparison, stay read-only and do not ask to write.`;
}

/** Ambient / threshold replies: read tools only. Must not claim write capability. */
function ambientSystemPrompt(): string {
  return `You are the OpenTrip trip agent in a **read-only ambient** turn (plain member message, not @agent chat).

You only have read tools: checkWeather, placeSearch, placeNearby, placeDetail, routeCompute, routeMatrix, reviewLookup, airbnbSearch, airbnbListingDetails, readTripMedia. You cannot insert/update stops, days, or expenses in this turn.

Rules:
- Be concise. Only discuss this trip. Ground answers in the trip snapshot and read tools.
- Never say write tools are "unavailable", "broken", or "temporarily offline" — they simply are not part of this ambient turn.
- If the member needs a trip edit (add/update stops, record or change expenses), briefly ask them to confirm with @agent (e.g. “回复 @agent 更新 我来改”) so the write-capable chat path can run. Do not invent that tools failed.
- Never claim you already changed the trip. Do not invent expense or stop mutations.
- Estimated prices belong in advice or suggested stop notes, not as recorded expenses.
- Prefer answering with facts from tools/snapshot over asking the member to look things up themselves.`;
}

const EVALUATION_SYSTEM_PROMPT = `You are the OpenTrip trip agent reviewing a single write operation on a collaborative trip. You must stay silent unless the change creates a material planning risk.

Material risks (the only reasons to notify):
- impossible or highly unrealistic timing between stops,
- duplicate or conflicting stops (including repeated lodging/transport bookings),
- outdoor plans that clearly conflict with the season or known weather patterns,
- route order that creates avoidable backtracking across a day,
- budget entries inconsistent with their participants or payer.

Rules:
- Default to shouldNotify=false. Cosmetic, minor, or ambiguous changes are never notified.
- confidence is your own probability in [0,1] that the risk is real and material.
- When you notify, reason must be one short sentence and suggestion one short actionable sentence.
- Propose pendingPatch only when a single trip-edit operation fully fixes the issue; otherwise return null.
- Keep observations factual; never invent stop/day/expense ids not present in the snapshot (except insert_stop / add_expense which create new rows).
Respond with a JSON object matching the decision schema.`;

const ADDRESSED_SYSTEM_PROMPT = `You are the OpenTrip trip agent deciding whether a member message in the shared trip session is addressing you.

Use the recent session context. The latest member message is a follow-up in an ongoing thread when the prior turn was yours.

Return addressed=true when:
- an explicit @agent mention,
- a direct question or request aimed at the agent ("can you…", "帮我…", "agent, …"),
- asking the agent to check, suggest, fix, add stops, or explain something about this trip,
- the previous assistant message proposed a plan / asked for confirmation or a choice, and the latest member message continues that thread (e.g. "确认", "好的", "可以", "按这个来", "那第一天换个午餐？", picking an option).

Return addressed=false only for:
- member-to-member chatter that does not involve the agent,
- status updates or planning notes among humans with no ask of the agent,
- acknowledgements that are clearly not answering the agent (e.g. thanking another member).

When the prior turn was the agent and the member's reply continues that thread, prefer addressed=true. Default to addressed=false only when the thread looks human-to-human.
Respond with a JSON object: {"addressed": true|false}.`;

const interventionSchema = z.object({
  shouldNotify: z.boolean(),
  severity: z.enum(["info", "warning", "critical"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  suggestion: z.string(),
  pendingPatch: proactivePendingPatchSchema.nullable(),
  expiresInMinutes: z.number().int().positive().nullable(),
});

const addressedSchema = z.object({
  addressed: z.boolean(),
});

/** Compact trip context for prompts: enough for planning judgment without
 * leaking member emails or persistence details. */
function tripContext(trip: TripSnapshot): string {
  return JSON.stringify({
    title: trip.title,
    startDate: trip.startDate,
    currency: trip.currency,
    members: trip.members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    days: trip.days.map((d) => ({ number: d.number, date: d.date, city: d.city })),
    stops: trip.stops.map((s) => ({
      id: s.id,
      day: s.day,
      time: s.time,
      duration: s.duration,
      name: s.name,
      area: s.area,
      category: s.category,
      lat: s.lat,
      lng: s.lng,
      cost: s.cost,
      note: s.note
        ? s.note.length > NOTE_CONTEXT_MAX
          ? `${s.note.slice(0, NOTE_CONTEXT_MAX)}…`
          : s.note
        : "",
    })),
    expenses: trip.expenses.map((e) => ({
      id: e.id,
      description: e.description,
      payer: e.payer,
      amount: e.amount,
      currency: e.currency,
      participants: e.participants,
    })),
  });
}

function textOf(parts: AgentMessagePart[]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

type InlineFilePart = {
  type: "file";
  data: { type: "data"; data: Uint8Array };
  mediaType: string;
  filename?: string;
};

/**
 * Resolve persisted file parts to inline bytes via FileStorage.
 *
 * AI SDK's default URL downloader blocks localhost/private hosts (SSRF guard).
 * Best practice for private uploads: never ask the SDK to HTTP-fetch them —
 * load from our storage port and pass `{ type: "data" }` instead.
 */
async function fileContentParts(
  parts: AgentMessagePart[],
  fileStorage: FileStorage,
  tripId: string,
): Promise<InlineFilePart[]> {
  const tripNamespace = storageNamespaceOf(tripId);
  const content: InlineFilePart[] = [];
  for (const part of parts) {
    if (!isAgentFilePart(part)) continue;
    const path = storagePathFromPublicUrl(part.url);
    if (
      !path ||
      !isTripMediaStoragePath(path) ||
      path.split("/")[1] !== tripNamespace
    ) {
      continue;
    }
    const file = await fileStorage.read(path);
    if (!file) continue;
    content.push({
      type: "file",
      data: { type: "data", data: file.content },
      mediaType: file.contentType || part.mediaType,
      ...(part.filename ? { filename: part.filename } : {}),
    });
  }
  return content;
}

/**
 * AI SDK `experimental_download` for trip-owned upload URLs.
 * Reads from FileStorage so localhost/dev public URLs never hit the SSRF guard.
 * Non-trip URLs are passed through only when the model supports them natively.
 */
export function createTripMediaDownload(
  fileStorage: FileStorage,
  tripId: string,
): Experimental_DownloadFunction {
  const tripNamespace = storageNamespaceOf(tripId);
  return async (requestedDownloads) =>
    Promise.all(
      requestedDownloads.map(async ({ url, isUrlSupportedByModel }) => {
        const path = storagePathFromPublicUrl(url.href);
        if (
          path &&
          isTripMediaStoragePath(path) &&
          path.split("/")[1] === tripNamespace
        ) {
          const file = await fileStorage.read(path);
          if (!file) {
            throw new Error(`Trip media not found for ${url.href}`);
          }
          return { data: file.content, mediaType: file.contentType };
        }
        // Model can fetch public HTTPS itself — do not download here.
        if (isUrlSupportedByModel) return null;
        throw new Error(
          `Refusing to download non-trip media URL (${url.hostname})`,
        );
      }),
    );
}

/** Convert the shared session history into model messages. Assistant entries
 * keep their role; human and operation entries become labeled user messages
 * so the model can attribute statements to members. File parts stay multimodal. */
export interface AgentUiRefinement {
  userMessageId: string;
  spec: Spec;
}

const UI_EDIT_INTENT_PATTERN =
  /\b(?:add\s+.+\s+to|change|edit|make|modify|refine|remove|reorder|replace|update)\b|(?:修改|改|调整|更新|替换|删除|精简|重排|把.+加到)/iu;
const UI_EDIT_TARGET_PATTERN =
  /\b(?:card|comparison|interface|option|ui)\b|(?:界面|卡片|选项|比较|第[一二三四五六七八九十\d]+个)/iu;

/** Refinement is opt-in. A new request after a generated card must not
 * silently become an edit of that card merely because it is adjacent. */
export function isAgentUiRefinementRequest(text: string): boolean {
  const normalized = text.normalize("NFKC").trim();
  return (
    normalized.length > 0 &&
    UI_EDIT_INTENT_PATTERN.test(normalized) &&
    UI_EDIT_TARGET_PATTERN.test(normalized)
  );
}

export function agentUiRefinementFromHistory(
  history: readonly AgentMessage[],
): AgentUiRefinement | null {
  let userIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]!;
    if (
      message.role === "user" &&
      (message.source === "chat" || message.source === "mention")
    ) {
      userIndex = index;
      break;
    }
  }
  if (userIndex < 0) return null;
  const userMessage = history[userIndex]!;
  const userText = textOf(userMessage.parts);
  if (!isAgentUiRefinementRequest(userText)) return null;

  // Keep refinement local to the recent thread instead of resurrecting an
  // unrelated interface from much earlier in the shared trip conversation.
  const lowerBound = Math.max(0, userIndex - 8);
  for (let index = userIndex - 1; index >= lowerBound; index -= 1) {
    const message = history[index]!;
    if (message.role !== "assistant") continue;
    const spec = refinableAgentUiSpec(message.parts);
    if (spec) return { userMessageId: userMessage.id, spec };
  }
  return null;
}

export async function toModelMessages(
  history: AgentMessage[],
  actorName: (userId: string | null) => string,
  fileStorage: FileStorage,
  tripId: string,
  refinement: AgentUiRefinement | null = null,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];
  for (const message of history) {
    const text = textOf(message.parts);
    const files = await fileContentParts(message.parts, fileStorage, tripId);

    if (message.role === "assistant") {
      // Generated UI remains in persisted data parts for the renderer. Never
      // flatten it into assistant prose: that mixes flat-spec and JSONL patch
      // formats and encourages models to echo internal context verbatim.
      const content = text.trim();
      if (!content) continue;
      messages.push({ role: "assistant", content });
      continue;
    }

    if (!text.trim() && files.length === 0) continue;

    const label =
      message.source === "operation"
        ? "[operation]"
        : `[${actorName(message.actorUserId)}]`;
    let labeledText = text.trim()
      ? `${label} ${text}`
      : `${label} (attachment)`;
    if (refinement?.userMessageId === message.id) {
      labeledText = buildAgentUiRefinementPrompt(labeledText, refinement.spec);
    }

    if (files.length === 0) {
      messages.push({ role: "user", content: labeledText });
      continue;
    }

    messages.push({
      role: "user",
      content: [{ type: "text", text: labeledText }, ...files],
    });
  }
  return messages;
}

/** A refinement seed is transport context, not a new assistant result. If the
 * model produced no effective UI change, remove all spec parts before
 * persistence so the previous card is not duplicated in shared history. */
export function removeUnchangedRefinementUi(
  parts: AgentMessagePart[],
  refinementSpec: Spec,
): AgentMessagePart[] {
  const compiled = specFromAgentUiParts(parts);
  if (!compiled || JSON.stringify(compiled) !== JSON.stringify(refinementSpec)) {
    return parts;
  }
  return parts.filter((part) => !isAgentUiPart(part));
}

function contextSnippetFromMessages(messages: ModelMessage[]): string {
  return messages
    .map((m) => {
      if (typeof m.content === "string") return `${m.role}: ${m.content}`;
      if (!Array.isArray(m.content)) return `${m.role}:`;
      const text = m.content
        .filter(
          (p): p is { type: "text"; text: string } =>
            typeof p === "object" &&
            p !== null &&
            "type" in p &&
            p.type === "text" &&
            "text" in p &&
            typeof p.text === "string",
        )
        .map((p) => p.text)
        .join(" ");
      const fileCount = m.content.filter(
        (p) => typeof p === "object" && p !== null && "type" in p && p.type === "file",
      ).length;
      const suffix = fileCount > 0 ? ` [${fileCount} attachment(s)]` : "";
      return `${m.role}: ${text}${suffix}`;
    })
    .join("\n");
}

function clientHasToolApprovalResponse(messages: AgentClientUIMessage[]): boolean {
  return messages.some((m) =>
    m.parts.some((p) => {
      if (typeof p !== "object" || p === null) return false;
      const state = (p as { state?: unknown }).state;
      const approval = (p as { approval?: { approved?: unknown } }).approval;
      return (
        state === "approval-responded" ||
        (typeof approval === "object" &&
          approval !== null &&
          typeof approval.approved === "boolean")
      );
    }),
  );
}

/** Build AI SDK toolApproval from the trip ops catalog. */
function buildWriteToolApproval(canEdit: boolean) {
  const denied = {
    type: "denied" as const,
    reason: "Only editors and owners can apply trip changes",
  };
  const entry = canEdit ? ("user-approval" as const) : denied;
  return Object.fromEntries(
    listWriteOps().map((op) => [op.toolName, entry]),
  ) as Record<string, typeof entry>;
}

/**
 * Generate write tools from the trip ops catalog (Novu/Mastra-style registry
 * projection). Execute only runs after AI SDK tool approval.
 */
function buildWriteTools(
  applyPatch: (patch: PendingPatch) => Promise<AgentToolApplyResult>,
): ToolSet {
  return Object.fromEntries(
    listWriteOps().map((op) => [
      op.toolName,
      tool({
        description: op.description,
        inputSchema: op.inputSchema,
        execute: async (input: unknown) => {
          const patch = op.toPatch(input as never);
          return applyPatch(patch);
        },
      }),
    ]),
  );
}

export function buildAgentTelemetryOptions(
  functionId: string,
  recordContent: boolean,
) {
  return {
    functionId,
    recordInputs: recordContent,
    recordOutputs: recordContent,
  };
}

/** Vercel AI SDK adapter behind the AgentModel port. */
export class AiSdkAgentModel implements AgentModel {
  private model: LanguageModel;

  constructor(
    private config: AiConfig,
    private weatherService: WeatherService,
    private geoService: GeoService,
    private lodgingService: LodgingService,
    private fileStorage: FileStorage,
    private streetViewService: StreetViewService | null,
  ) {
    this.model = createAgentLanguageModel(config);
  }

  /** Provider options that unlock MiniMax thinking as AI SDK reasoning parts. */
  private providerOptions():
    | { anthropic: { thinking: { type: "adaptive" } } }
    | undefined {
    if (
      isMiniMaxProvider(this.config.provider) &&
      isMiniMaxM3(this.config.model)
    ) {
      return { anthropic: { thinking: { type: "adaptive" } } };
    }
    return undefined;
  }

  /** Read-only tools always available (no approval). Not part of trip ops.
   * Weather, geo, and trip media go through application/storage ports. */
  private readTools(
    tripId: string,
    streetViewPolicy = new StreetViewToolPolicy(),
    observability?: AgentObservabilityContext,
  ): ToolSet {
    return {
      ...buildWeatherReadTools(this.weatherService),
      ...buildGeoReadTools(this.geoService),
      ...buildLodgingReadTools(this.lodgingService),
      ...buildTripMediaReadTools(this.fileStorage, tripId),
      ...(this.streetViewService
        ? buildStreetViewReadTools(
            this.streetViewService,
            tripId,
            streetViewPolicy,
            observability,
          )
        : {}),
    };
  }

  private chatTools(
    tripId: string,
    applyPatch?: (patch: PendingPatch) => Promise<AgentToolApplyResult>,
    streetViewPolicy = new StreetViewToolPolicy(),
    observability?: AgentObservabilityContext,
  ): ToolSet {
    if (!applyPatch) {
      return this.readTools(tripId, streetViewPolicy, observability);
    }
    return {
      ...this.readTools(tripId, streetViewPolicy, observability),
      ...buildWriteTools(applyPatch),
    };
  }

  private chatSystem(trip: TripSnapshot): string {
    return `${chatSystemPrompt()}\n\n${this.streetViewInstructions()}\n\n${agentUiPrompt}\n\nCurrent trip snapshot:\n${tripContext(trip)}`;
  }

  private ambientSystem(trip: TripSnapshot): string {
    return `${ambientSystemPrompt()}\n\n${this.streetViewInstructions()}\n\nCurrent trip snapshot:\n${tripContext(trip)}`;
  }

  private streetViewInstructions(): string {
    if (!this.streetViewService) return "Street-view imagery is not configured.";
    return [
      "Street-view tools are provider-neutral. Resolve a place to real coordinates with placeSearch/placeDetail before streetViewSearch.",
      "Use StreetViewCard with an imageId returned by a street-view tool in this same reply; never invent an image id, preview URL, capture time, heading, distance, or attribution.",
      "A successful streetViewSearch already supplies trusted captions and at most one static preview to you. When outcome is found, emit StreetViewCard with one returned imageId in the same reply. Do not replace the card with a prose metadata caption.",
      "Never claim street-view imagery was found unless this turn contains a successful street-view tool result. Do not reuse image ids from earlier messages.",
      "A streetViewSearch outcome of found is a successful call, even when panoramaAvailable is false. An empty outcome only means this search area had no returned images. Never describe either outcome as a tool failure, provider outage, or global coverage gap.",
      "Start streetViewSearch without radiusMeters. The first search is always executed at 100 metres even if you supply a larger value. Retry at most once, and only after an empty or partial successful result, at the same coordinates with a larger radius no greater than 250 metres. Do not retry a thrown error with guessed coordinates or claim that the error proves a coverage gap. If completeness is partial, state only that the search result may be incomplete.",
      "Use streetViewInspect only for another supports360=false id from this turn's search when a second visual look is useful. Panorama content is for the member's interactive viewer and must never be inspected by the model.",
      "When a member explicitly asks to save a reference, call appendStopNote with the stop id and trusted same-origin preview/metadata from the tool result.",
    ].join("\n");
  }

  private actorNameResolver(trip: TripSnapshot) {
    return (userId: string | null): string => {
      if (!userId) return "system";
      const member = trip.members.find((m) => m.userId === userId);
      return member?.name ?? "member";
    };
  }

  private telemetry(functionId: string) {
    return buildAgentTelemetryOptions(
      functionId,
      this.config.telemetryRecordContent,
    );
  }

  private runtimeContext(
    tripId: string,
    observability: AgentObservabilityContext,
  ) {
    return {
      requestId: observability.requestId ?? "",
      tripId,
      agentSessionId: tripId,
      turnId: observability.turnId,
      trigger: observability.trigger,
      runtime: observability.runtime ?? "unknown",
    };
  }

  private includedRuntimeContext() {
    return {
      requestId: true,
      tripId: true,
      agentSessionId: true,
      turnId: true,
      trigger: true,
      runtime: true,
    } as const;
  }

  private lifecycleCallbacks(
    tripId: string,
    observability: AgentObservabilityContext,
  ) {
    const common = {
      runtime: observability.runtime,
      requestId: observability.requestId,
      tripId,
      agentSessionId: tripId,
      turnId: observability.turnId,
      trigger: observability.trigger,
    };
    return {
      onToolExecutionStart: (event: ToolExecutionStartEvent) => {
        logger.info("agent.tool.started", {
          ...common,
          toolCallId: event.toolCall.toolCallId,
          toolName: event.toolCall.toolName,
          ...safeToolInputFields(event.toolCall.toolName, event.toolCall.input),
        });
      },
      onToolExecutionEnd: (event: ToolExecutionEndEvent) => {
        const failed = event.toolOutput.type === "tool-error";
        const error = failed ? event.toolOutput.error : undefined;
        logger[failed ? "error" : "info"](
          failed ? "agent.tool.failed" : "agent.tool.completed",
          {
            ...common,
            toolCallId: event.toolCall.toolCallId,
            toolName: event.toolCall.toolName,
            durationMs: event.toolExecutionMs,
            outcome: failed ? "error" : "success",
            ...(failed ? safeAgentErrorFields(error) : {}),
            ...safeToolInputFields(event.toolCall.toolName, event.toolCall.input),
          },
        );
      },
      onStepEnd: (event: GenerateTextStepEndEvent) => {
        logger.info("agent.model.step_completed", {
          ...common,
          stepNumber: event.stepNumber,
          finishReason: event.finishReason,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          totalTokens: event.usage.totalTokens,
          toolCallCount: event.toolCalls.length,
          toolResultCount: event.toolResults.length,
          provider: event.model.provider,
          model: event.model.modelId,
        });
      },
    };
  }

  private async resolveModelMessages(
    request: AgentChatRequest,
    tools: ToolSet,
  ): Promise<{ messages: ModelMessage[]; refinementSpec: Spec | null }> {
    const clientMessages = request.clientMessages;
    if (clientMessages?.length && clientHasToolApprovalResponse(clientMessages)) {
      // Approval continuation must use the live UI message tree so AI SDK can
      // map approval-responded parts → tool-approval-response and run execute.
      return {
        messages: await convertToModelMessages(
          clientMessages as unknown as UIMessage[],
          { tools },
        ),
        refinementSpec: null,
      };
    }

    const refinement = agentUiRefinementFromHistory(request.history);
    return {
      messages: await toModelMessages(
        request.history,
        this.actorNameResolver(request.trip),
        this.fileStorage,
        request.trip.id,
        refinement,
      ),
      refinementSpec: refinement?.spec ?? null,
    };
  }

  async streamChat(request: AgentChatRequest): Promise<Response> {
    const streetViewPolicy = new StreetViewToolPolicy();
    const tools = this.chatTools(
      request.trip.id,
      request.applyPatch,
      streetViewPolicy,
      request.observability,
    );
    const { messages, refinementSpec } = await this.resolveModelMessages(
      request,
      tools,
    );

    // When the last message is an assistant with tool parts, the UI stream
    // must continue that same message — pass originalMessages for approval
    // continuation (AI SDK official pattern).
    const originalMessages = (request.clientMessages ?? []).map((m) => ({
      id: m.id ?? generateId(),
      role: m.role as UIMessage["role"],
      parts: m.parts as UIMessage["parts"],
    })) as UIMessage[];

    const result = streamText({
      model: this.model,
      system: this.chatSystem(request.trip),
      messages,
      tools,
      toolApproval: buildWriteToolApproval(request.canEdit),
      experimental_toolApprovalSecret: this.config.apiKey,
      providerOptions: this.providerOptions(),
      // Private trip uploads: resolve via FileStorage, never HTTP-fetch localhost.
      experimental_download: createTripMediaDownload(
        this.fileStorage,
        request.trip.id,
      ),
      stopWhen: stepCountIs(this.config.maxToolSteps),
      prepareStep: ({ instructions }) =>
        streetViewPolicy.prepareStep(Object.keys(tools), instructions),
      ...this.lifecycleCallbacks(request.trip.id, request.observability),
      onError: ({ error }) => {
        const fields = {
          runtime: request.observability.runtime,
          requestId: request.observability.requestId,
          tripId: request.trip.id,
          agentSessionId: request.trip.id,
          turnId: request.observability.turnId,
          trigger: request.observability.trigger,
          ...safeAgentErrorFields(error),
        };
        logger.error("agent.stream.failed", fields);
        captureException(error, fields);
      },
      runtimeContext: this.runtimeContext(request.trip.id, request.observability),
      telemetry: {
        ...this.telemetry("agent.chat"),
        includeRuntimeContext: this.includedRuntimeContext(),
      },
    });

    const stream = createUIMessageStream({
      originalMessages,
      generateId,
      execute: ({ writer }) => {
        if (refinementSpec) {
          // Patch-only refinement needs the validated base spec in the new UI
          // message so useJsonRenderMessage can apply streamed patches to it.
          writer.write({
            type: SPEC_DATA_PART_TYPE,
            data: { type: "flat", spec: refinementSpec },
          });
        }
        writer.merge(
          pipeJsonRender(
            toUIMessageStream({
              stream: result.stream,
              tools,
              originalMessages,
              generateMessageId: generateId,
              sendReasoning: true,
            }),
          ),
        );
      },
      // Persist after json-render transforms SpecStream text into data-spec
      // parts; an inner stream callback would only see the raw fenced JSONL.
      onEnd: async ({ responseMessage }) => {
        const parts = refinementSpec
          ? removeUnchangedRefinementUi(
              responseMessage.parts as AgentMessagePart[],
              refinementSpec,
            )
          : (responseMessage.parts as AgentMessagePart[]);
        await request.onFinish(
          parts,
          responseMessage.id,
        );
      },
    });

    return createUIMessageStreamResponse({
      stream,
      // Drain an independent SSE branch so transformation and persistence
      // finish even when the HTTP client disconnects mid-response.
      consumeSseStream: ({ stream: sseStream }) =>
        consumeStream({ stream: sseStream }),
    });
  }

  async generateReply(
    request: Pick<AgentChatRequest, "trip" | "history" | "observability">,
  ): Promise<AgentMessagePart[]> {
    // Ambient replies stay read-only: no write tools, no approval loop.
    // Use ambientSystem so the model is not told it has editor write tools.
    const streetViewPolicy = new StreetViewToolPolicy();
    const tools = this.readTools(
      request.trip.id,
      streetViewPolicy,
      request.observability,
    );
    const result = await generateText({
      model: this.model,
      system: this.ambientSystem(request.trip),
      messages: await toModelMessages(
        request.history,
        this.actorNameResolver(request.trip),
        this.fileStorage,
        request.trip.id,
      ),
      tools,
      providerOptions: this.providerOptions(),
      experimental_download: createTripMediaDownload(
        this.fileStorage,
        request.trip.id,
      ),
      stopWhen: stepCountIs(this.config.maxToolSteps),
      prepareStep: ({ instructions }) =>
        streetViewPolicy.prepareStep(Object.keys(tools), instructions),
      ...this.lifecycleCallbacks(request.trip.id, request.observability),
      runtimeContext: this.runtimeContext(request.trip.id, request.observability),
      telemetry: {
        ...this.telemetry("agent.ambient_reply"),
        includeRuntimeContext: this.includedRuntimeContext(),
      },
    });
    return [{ type: "text", text: result.text }];
  }

  async isAddressed(request: AgentAddressedRequest): Promise<boolean> {
    const recentContext = contextSnippetFromMessages(
      await toModelMessages(
        request.history.slice(-20),
        this.actorNameResolver(request.trip),
        this.fileStorage,
        request.trip.id,
      ),
    );

    const { object } = await generateObject({
      model: this.model,
      schema: addressedSchema,
      system: ADDRESSED_SYSTEM_PROMPT,
      providerOptions: this.providerOptions(),
      prompt: [
        `Trip snapshot:\n${tripContext(request.trip)}`,
        `Recent session context:\n${recentContext || "(none)"}`,
        `Latest member message:\n${request.messageText}`,
      ].join("\n\n"),
      telemetry: this.telemetry("agent.addressed_classifier"),
    });

    return object.addressed;
  }

  async evaluateOperation(
    request: AgentEvaluationRequest,
  ): Promise<InterventionDecision> {
    const recentContext = contextSnippetFromMessages(
      await toModelMessages(
        request.history.slice(-20),
        this.actorNameResolver(request.trip),
        this.fileStorage,
        request.trip.id,
      ),
    );

    const { object } = await generateObject({
      model: this.model,
      schema: interventionSchema,
      system: EVALUATION_SYSTEM_PROMPT,
      providerOptions: this.providerOptions(),
      prompt: [
        `Trip snapshot:\n${tripContext(request.trip)}`,
        `Recent session context:\n${recentContext || "(none)"}`,
        `Operation to review:\n${JSON.stringify({
          actor: request.event.actorName,
          operation: request.event.operation,
          summary: request.event.summary,
          details: request.event.details,
        })}`,
      ].join("\n\n"),
      telemetry: this.telemetry("agent.operation_evaluation"),
    });

    return object as InterventionDecision;
  }
}

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const travelModeSchema = z
  .enum(["driving", "walking", "cycling", "transit"])
  .optional();

/** Exported for focused wiring tests. */
export function buildWeatherReadTools(weatherService: WeatherService): ToolSet {
  return {
    checkWeather: tool({
      description:
        "Get the forecast/observed weather at a coordinate for an ISO date and optional HH:MM time.",
      inputSchema: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().optional(),
      }),
      execute: async ({ lat, lng, date, time }) => {
        const weather = await providerCall("weather", "get", () =>
          weatherService.getWeather(lat, lng, date, time),
        );
        return weather ?? { unavailable: true };
      },
    }),
  };
}

/** Read-only geo tools. Place inserts still go through insertStop + approval. */
export function buildGeoReadTools(geoService: GeoService): ToolSet {
  return {
    placeSearch: tool({
      description:
        "Search places by free-text query. Optionally bias results near a lat/lng.",
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(20).optional(),
        lang: z.string().optional(),
        near: coordinateSchema.optional(),
      }),
      execute: async (input) =>
        providerCall("geo", "place_search", () => geoService.placeSearch(input)),
    }),
    placeNearby: tool({
      description:
        "Find places near a coordinate within a radius in meters. Optional category filters (e.g. cafe, museum).",
      inputSchema: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusMeters: z.number().positive().max(50_000).optional(),
        categories: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(30).optional(),
        lang: z.string().optional(),
      }),
      execute: async (input) =>
        providerCall("geo", "place_nearby", () => geoService.placeNearby(input)),
    }),
    placeDetail: tool({
      description:
        "Get details for a place id returned by placeSearch or placeNearby (OSM type/id or Google place id).",
      inputSchema: z.object({
        placeId: z.string().min(1),
        lang: z.string().optional(),
      }),
      execute: async (input) => {
        const place = await providerCall("geo", "place_detail", () =>
          geoService.placeDetail(input),
        );
        return place ?? { unavailable: true };
      },
    }),
    routeCompute: tool({
      description:
        "Compute a route between ordered waypoints. Coordinates are lat/lng. Modes: driving, walking, cycling, transit.",
      inputSchema: z.object({
        waypoints: z.array(coordinateSchema).min(2).max(25),
        mode: travelModeSchema,
        includeGeometry: z.boolean().optional(),
      }),
      execute: async (input) => {
        const route = await providerCall("geo", "route_compute", () =>
          geoService.routeCompute(input),
        );
        return route ?? { unavailable: true };
      },
    }),
    routeMatrix: tool({
      description:
        "Compute a travel-time/distance matrix between origins and destinations (lat/lng).",
      inputSchema: z.object({
        origins: z.array(coordinateSchema).min(1).max(10),
        destinations: z.array(coordinateSchema).min(1).max(10),
        mode: travelModeSchema,
      }),
      execute: async (input) =>
        providerCall("geo", "route_matrix", () => geoService.routeMatrix(input)),
    }),
    reviewLookup: tool({
      description:
        "Look up reviews for a place id. Unsupported providers return supported=false with an empty list.",
      inputSchema: z.object({
        placeId: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional(),
        lang: z.string().optional(),
      }),
      execute: async (input) =>
        providerCall("geo", "review_lookup", () => geoService.reviewLookup(input)),
    }),
  };
}

/** Provider-neutral street-view tools. Search/inspect may add one trusted preview. */
export function buildStreetViewReadTools(
  streetViewService: StreetViewService,
  tripId: string,
  policy = new StreetViewToolPolicy(),
  observability?: AgentObservabilityContext,
): ToolSet {
  return {
    streetViewSearch: tool({
      description:
        "Find street-level imagery near real coordinates. Omit radiusMeters first; the first search is always executed at 100 metres. Retry once at the same coordinates with a radius up to 250 metres only after an empty or partial result. A found or empty outcome is a successful call; only a thrown error is a failure. On found, you receive trusted captions and at most one static preview — emit StreetViewCard with a returned imageId in the same reply. Prefer supports360=true only for the member's interactive viewer.",
      inputSchema: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusMeters: z.number().int().min(1).max(1_000).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async (input) => {
        const effectiveInput = policy.validateSearch(input);
        const startedAt = Date.now();
        try {
          const result = await providerCall("street_view", "search", () =>
            streetViewService.searchNearby({
              tripId,
              ...effectiveInput,
              observability,
            }),
          );
          logger.info("street_view.search_completed", {
            tripId,
            requestedRadiusMeters:
              input.radiusMeters ?? INITIAL_STREET_VIEW_RADIUS_METERS,
            radiusMeters: effectiveInput.radiusMeters,
            requestedLimit: effectiveInput.limit ?? 5,
            candidateCount: result.candidateCount,
            resultCount: result.images.length,
            panoramaCount: result.panoramaCount,
            outcome: result.outcome,
            completeness: result.completeness,
            durationMs: Date.now() - startedAt,
          });
          policy.recordSearchSuccess(effectiveInput, result);
          return result;
        } catch (error) {
          policy.recordSearchFailure();
          logger.error("street_view.search_failed", {
            tripId,
            requestedRadiusMeters:
              input.radiusMeters ?? INITIAL_STREET_VIEW_RADIUS_METERS,
            radiusMeters: effectiveInput.radiusMeters,
            requestedLimit: effectiveInput.limit ?? 5,
            errorCode:
              error instanceof StreetViewError ? error.code : "street_view_unexpected_error",
            durationMs: Date.now() - startedAt,
          });
          throw error;
        }
      },
      toModelOutput: async ({ output }) =>
        streetViewSearchToModelOutput(streetViewService, tripId, output, observability),
    }),
    streetViewInspect: tool({
      description:
        "Visually inspect exactly one ordinary static street-view result. Use only an imageId returned by streetViewSearch with supports360=false. Panorama inspection is forbidden.",
      inputSchema: z.object({
        imageId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
      }),
      execute: async ({ imageId }) => {
        policy.validateInspect(imageId);
        return providerCall("street_view", "inspect", () =>
          streetViewService.getInspectableImage(tripId, imageId, observability),
        );
      },
      toModelOutput: async ({ output }) => {
        if (output.supports360) {
          throw new StreetViewError(
            "street_view_panorama_inspection_forbidden",
            "Panorama content cannot be supplied to the model",
          );
        }
        return streetViewStaticPreviewToModelOutput(
          streetViewService,
          output,
          formatStreetViewImageCaption(output),
          observability,
        );
      },
    }),
  };
}

type StreetViewModelContent = {
  type: "content";
  value: Array<
    | { type: "text"; text: string }
    | {
        type: "file";
        mediaType: string;
        data: { type: "data"; data: Uint8Array };
        filename: string;
      }
  >;
};

type StreetViewModelText = { type: "text"; value: string };

type StreetViewPreviewAttachOutcome =
  | "attached"
  | "skipped_empty"
  | "skipped_panorama_only"
  | "preview_unavailable";

export function formatStreetViewImageCaption(image: StreetViewImageDto): string {
  const parts = [
    `id=${image.id}`,
    image.distanceMeters === undefined
      ? null
      : `distanceMeters=${image.distanceMeters}`,
    image.headingDegrees === undefined
      ? null
      : `headingDegrees=${Math.round(image.headingDegrees)}`,
    image.capturedAt ? `capturedAt=${image.capturedAt}` : null,
    `supports360=${image.supports360}`,
    `attribution=${image.attribution.label}`,
  ].filter((part): part is string => part !== null);
  return parts.join(" ");
}

export function formatStreetViewSearchModelText(
  result: StreetViewSearchResultDto,
): string {
  const header = [
    `Street-view search outcome=${result.outcome}`,
    `completeness=${result.completeness}`,
    `resultCount=${result.images.length}`,
    `candidateCount=${result.candidateCount}`,
    `panoramaAvailable=${result.panoramaAvailable}`,
    `panoramaCount=${result.panoramaCount}`,
  ].join(" ");
  if (result.outcome === "empty" || result.images.length === 0) {
    return [
      header,
      "No images returned for this search area.",
      "Do not invent image ids or claim coverage elsewhere.",
    ].join("\n");
  }
  const lines = result.images.map(
    (image, index) => `${index + 1}. ${formatStreetViewImageCaption(image)}`,
  );
  return [
    header,
    "Trusted candidates (use only these image ids for StreetViewCard):",
    ...lines,
    "Emit StreetViewCard with one of these imageIds in this same reply. Do not invent image ids, capture times, headings, distances, or attribution. Keep prose brief; the card hydrates preview metadata.",
  ].join("\n");
}

export async function streetViewSearchToModelOutput(
  streetViewService: StreetViewService,
  tripId: string,
  output: StreetViewSearchResultDto,
  observability?: AgentObservabilityContext,
): Promise<StreetViewModelContent | StreetViewModelText> {
  const text = formatStreetViewSearchModelText(output);
  if (output.outcome === "empty" || output.images.length === 0) {
    logSearchPreviewAttach(tripId, "skipped_empty");
    return { type: "text", value: text };
  }
  const staticImage = output.images.find((image) => !image.supports360);
  if (!staticImage) {
    logSearchPreviewAttach(tripId, "skipped_panorama_only");
    return {
      type: "text",
      value: `${text}\nNo ordinary static preview is available for the model; panoramas are for the member viewer only.`,
    };
  }
  const withPreview = await streetViewStaticPreviewToModelOutput(
    streetViewService,
    staticImage,
    text,
    observability,
  );
  if (withPreview.type === "content") {
    logSearchPreviewAttach(tripId, "attached", staticImage.id);
    return withPreview;
  }
  logSearchPreviewAttach(tripId, "preview_unavailable", staticImage.id);
  return withPreview;
}

async function streetViewStaticPreviewToModelOutput(
  streetViewService: StreetViewService,
  image: Pick<StreetViewImageDto, "id">,
  text: string,
  observability?: AgentObservabilityContext,
): Promise<StreetViewModelContent | StreetViewModelText> {
  try {
    const preview = await providerCall("street_view", "read_preview", () =>
      streetViewService.readPreview(image.id, observability),
    );
    return {
      type: "content",
      value: [
        { type: "text", text },
        {
          type: "file",
          mediaType: preview.mediaType,
          data: { type: "data", data: preview.bytes },
          filename: `street-view-${image.id}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview unavailable";
    return { type: "text", value: `${text}\nPreview unavailable: ${message}` };
  }
}

function logSearchPreviewAttach(
  tripId: string,
  outcome: StreetViewPreviewAttachOutcome,
  imageId?: string,
): void {
  logger.info("street_view.search_model_output", {
    tripId,
    previewAttach: outcome,
    ...(imageId ? { imageId } : {}),
  });
}

const lodgingPropertyTypeSchema = z.enum([
  "entire_home",
  "private_room",
  "shared_room",
  "hotel_room",
]);

const lodgingGuestsSchema = {
  adults: z.number().int().min(0).max(50).optional(),
  children: z.number().int().min(0).max(50).optional(),
  infants: z.number().int().min(0).max(50).optional(),
  pets: z.number().int().min(0).max(50).optional(),
};

/** Read-only Airbnb lodging tools (openbnb-style scrape, in-process). */
export function buildLodgingReadTools(
  lodgingService: LodgingService,
): ToolSet {
  return {
    airbnbSearch: tool({
      description:
        "Search Airbnb vacation rentals by location with optional dates, guests, price range, and property type. Returns listing ids, URLs, ratings, and price summaries. Provide listing URLs to the member.",
      inputSchema: z.object({
        location: z
          .string()
          .min(2)
          .describe('Location to search (e.g. "Paris, France")'),
        placeId: z
          .string()
          .optional()
          .describe("Google Maps Place ID; skips client-side geocoding"),
        checkin: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        checkout: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        ...lodgingGuestsSchema,
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from a prior search"),
        propertyType: lodgingPropertyTypeSchema.optional(),
      }),
      execute: async (input) =>
        providerCall("lodging", "search", () => lodgingService.search(input)),
    }),
    airbnbListingDetails: tool({
      description:
        "Get amenities, house rules, description, and location for an Airbnb listing id from airbnbSearch.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Airbnb listing id"),
        checkin: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        checkout: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        ...lodgingGuestsSchema,
      }),
      execute: async (input) =>
        providerCall("lodging", "listing_details", () =>
          lodgingService.listingDetails(input),
        ),
    }),
  };
}

type TripMediaToolResult =
  | { error: string }
  | { mediaType: string; data: string; filename?: string };

/** Read trip-owned uploads into multimodal tool output (AI SDK toModelOutput). */
export function buildTripMediaReadTools(
  fileStorage: FileStorage,
  tripId: string,
): ToolSet {
  const tripNamespace = storageNamespaceOf(tripId);
  return {
    readTripMedia: tool({
      description:
        "Read a trip-owned uploaded image, PDF, or text file so you can see its contents. Pass a URL from a chat attachment or a stop note that points at this trip's /api/uploads/trips/... path. External URLs are rejected.",
      inputSchema: z.object({
        url: z.string().min(1).describe("Public upload URL for this trip"),
      }),
      execute: async ({ url }): Promise<TripMediaToolResult> => {
        const path = storagePathFromPublicUrl(url);
        if (
          !path ||
          !isTripMediaStoragePath(path) ||
          path.split("/")[1] !== tripNamespace
        ) {
          return {
            error:
              "URL is not a managed media file for this trip. Use a /api/uploads/trips/... URL from this trip.",
          };
        }
        const file = await startObservabilitySpan(
          "opentrip.agent.attachment_resolution",
          { tripId, storagePath: path },
          async () => fileStorage.read(path),
        );
        if (!file) {
          return { error: "File not found" };
        }
        return {
          mediaType: file.contentType,
          data: bytesToBase64(file.content),
          filename: path.split("/").pop(),
        };
      },
      toModelOutput: ({ output }: { output: TripMediaToolResult }) => {
        if ("error" in output) {
          return { type: "text" as const, value: output.error };
        }
        return {
          type: "content" as const,
          value: [
            {
              type: "file" as const,
              mediaType: output.mediaType,
              data: { type: "data" as const, data: output.data },
              ...(output.filename ? { filename: output.filename } : {}),
            },
          ],
        };
      },
    }),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
