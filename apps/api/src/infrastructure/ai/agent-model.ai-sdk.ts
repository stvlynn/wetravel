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
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import {
  agentUiModelContext,
  agentUiPrompt,
  pipeJsonRender,
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
  AgentToolApplyResult,
  InterventionDecision,
  PendingPatch,
} from "../../domain/agent";
import type { TripSnapshot } from "../../domain/trip";
import type { WeatherService } from "../../application/weather/weather-service";
import type { GeoService } from "../../application/geo/geo-service";
import type { LodgingService } from "../../application/lodging/lodging-service";
import { StreetViewError, type StreetViewService } from "../../application/street-view";
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

const NOTE_CONTEXT_MAX = 2_000;

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
async function toModelMessages(
  history: AgentMessage[],
  actorName: (userId: string | null) => string,
  fileStorage: FileStorage,
  tripId: string,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];
  for (const message of history) {
    const text = textOf(message.parts);
    const generatedUi = agentUiModelContext(message.parts);
    const files = await fileContentParts(message.parts, fileStorage, tripId);

    if (message.role === "assistant") {
      const content = [
        text.trim(),
        generatedUi
          ? `[Previously generated interface]\n${generatedUi}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      if (!content) continue;
      messages.push({ role: "assistant", content });
      continue;
    }

    if (!text.trim() && files.length === 0) continue;

    const label =
      message.source === "operation"
        ? "[operation]"
        : `[${actorName(message.actorUserId)}]`;
    const labeledText = text.trim()
      ? `${label} ${text}`
      : `${label} (attachment)`;

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
  private readTools(tripId: string): ToolSet {
    return {
      ...buildWeatherReadTools(this.weatherService),
      ...buildGeoReadTools(this.geoService),
      ...buildLodgingReadTools(this.lodgingService),
      ...buildTripMediaReadTools(this.fileStorage, tripId),
      ...(this.streetViewService
        ? buildStreetViewReadTools(this.streetViewService, tripId)
        : {}),
    };
  }

  private chatTools(
    tripId: string,
    applyPatch?: (patch: PendingPatch) => Promise<AgentToolApplyResult>,
  ): ToolSet {
    if (!applyPatch) return this.readTools(tripId);
    return { ...this.readTools(tripId), ...buildWriteTools(applyPatch) };
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
      "Use StreetViewCard with an imageId returned by a street-view tool; never invent an image id, preview URL, capture time, or attribution.",
      "A streetViewSearch outcome of found is a successful call, even when panoramaAvailable is false. An empty outcome only means this search area had no returned images. Never describe either outcome as a tool failure, provider outage, or global coverage gap.",
      "Retry streetViewSearch at most once for the same member request, with a larger radius no greater than 1000 metres. If completeness is partial, state only that the search result may be incomplete.",
      "Use streetViewInspect only for a result with supports360=false when visual examination is useful. Panorama content is for the member's interactive viewer and must never be inspected by the model.",
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

  private async resolveModelMessages(
    request: AgentChatRequest,
    tools: ToolSet,
  ): Promise<ModelMessage[]> {
    const clientMessages = request.clientMessages;
    if (clientMessages?.length && clientHasToolApprovalResponse(clientMessages)) {
      // Approval continuation must use the live UI message tree so AI SDK can
      // map approval-responded parts → tool-approval-response and run execute.
      return convertToModelMessages(clientMessages as unknown as UIMessage[], {
        tools,
      });
    }

    return toModelMessages(
      request.history,
      this.actorNameResolver(request.trip),
      this.fileStorage,
      request.trip.id,
    );
  }

  async streamChat(request: AgentChatRequest): Promise<Response> {
    const tools = this.chatTools(request.trip.id, request.applyPatch);
    const messages = await this.resolveModelMessages(request, tools);

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
    });

    const stream = createUIMessageStream({
      originalMessages,
      generateId,
      execute: ({ writer }) => {
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
        await request.onFinish(
          responseMessage.parts as AgentMessagePart[],
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
    request: Pick<AgentChatRequest, "trip" | "history">,
  ): Promise<AgentMessagePart[]> {
    // Ambient replies stay read-only: no write tools, no approval loop.
    // Use ambientSystem so the model is not told it has editor write tools.
    const result = await generateText({
      model: this.model,
      system: this.ambientSystem(request.trip),
      messages: await toModelMessages(
        request.history,
        this.actorNameResolver(request.trip),
        this.fileStorage,
        request.trip.id,
      ),
      tools: this.readTools(request.trip.id),
      providerOptions: this.providerOptions(),
      experimental_download: createTripMediaDownload(
        this.fileStorage,
        request.trip.id,
      ),
      stopWhen: stepCountIs(this.config.maxToolSteps),
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
        const weather = await weatherService.getWeather(lat, lng, date, time);
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
      execute: async (input) => geoService.placeSearch(input),
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
      execute: async (input) => geoService.placeNearby(input),
    }),
    placeDetail: tool({
      description:
        "Get details for a place id returned by placeSearch or placeNearby (OSM type/id or Google place id).",
      inputSchema: z.object({
        placeId: z.string().min(1),
        lang: z.string().optional(),
      }),
      execute: async (input) => {
        const place = await geoService.placeDetail(input);
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
        const route = await geoService.routeCompute(input);
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
      execute: async (input) => geoService.routeMatrix(input),
    }),
    reviewLookup: tool({
      description:
        "Look up reviews for a place id. Unsupported providers return supported=false with an empty list.",
      inputSchema: z.object({
        placeId: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional(),
        lang: z.string().optional(),
      }),
      execute: async (input) => geoService.reviewLookup(input),
    }),
  };
}

/** Provider-neutral street-view tools. Inspect adds one trusted binary image. */
export function buildStreetViewReadTools(
  streetViewService: StreetViewService,
  tripId: string,
): ToolSet {
  return {
    streetViewSearch: tool({
      description:
        "Find street-level imagery near real coordinates. A found or empty outcome is a successful tool call; only a thrown error is a failure. Prefer supports360=true only for the member's interactive viewer.",
      inputSchema: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusMeters: z.number().int().min(1).max(1_000).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async (input) => {
        const startedAt = Date.now();
        try {
          const result = await streetViewService.searchNearby({ tripId, ...input });
          console.info("Street-view search completed", {
            event: "street_view.search_completed",
            tripId,
            radiusMeters: input.radiusMeters ?? 100,
            requestedLimit: input.limit ?? 5,
            candidateCount: result.candidateCount,
            resultCount: result.images.length,
            panoramaCount: result.panoramaCount,
            outcome: result.outcome,
            completeness: result.completeness,
            durationMs: Date.now() - startedAt,
          });
          return result;
        } catch (error) {
          console.error("Street-view search failed", {
            event: "street_view.search_failed",
            tripId,
            radiusMeters: input.radiusMeters ?? 100,
            requestedLimit: input.limit ?? 5,
            errorCode:
              error instanceof StreetViewError ? error.code : "street_view_unexpected_error",
            durationMs: Date.now() - startedAt,
          });
          throw error;
        }
      },
    }),
    streetViewInspect: tool({
      description:
        "Visually inspect exactly one ordinary static street-view result. Use only an imageId returned by streetViewSearch with supports360=false. Panorama inspection is forbidden.",
      inputSchema: z.object({
        imageId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
      }),
      execute: async ({ imageId }) => streetViewService.getInspectableImage(tripId, imageId),
      toModelOutput: async ({ output }) => {
        const metadata = JSON.stringify(output);
        if (output.supports360) {
          throw new StreetViewError(
            "street_view_panorama_inspection_forbidden",
            "Panorama content cannot be supplied to the model",
          );
        }
        try {
          const preview = await streetViewService.readPreview(output.id);
          return {
            type: "content" as const,
            value: [
              { type: "text" as const, text: metadata },
              {
                type: "file" as const,
                mediaType: preview.mediaType,
                data: { type: "data" as const, data: preview.bytes },
                filename: `street-view-${output.id}`,
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Preview unavailable";
          return { type: "text" as const, value: `${metadata}\nPreview unavailable: ${message}` };
        }
      },
    }),
  };
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
      execute: async (input) => lodgingService.search(input),
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
      execute: async (input) => lodgingService.listingDetails(input),
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
        const file = await fileStorage.read(path);
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
