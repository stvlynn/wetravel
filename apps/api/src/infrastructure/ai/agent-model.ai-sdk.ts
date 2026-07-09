import {
  convertToModelMessages,
  generateId,
  generateObject,
  generateText,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
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
import {
  listWriteOps,
  pendingPatchSchema,
  writeToolNames,
} from "../../application/trip/ops";
import type { AiConfig } from "../config";

function chatSystemPrompt(): string {
  const tools = writeToolNames().join(", ");
  return `You are the OpenTrip trip agent: a quiet, precise trip-planning collaborator embedded in a collaborative trip workspace.

Rules:
- The conversation is shared by all trip members. Messages are prefixed with the author's name.
- Be concise and concrete. Reference stops, days, and expenses by their names and day numbers.
- Only discuss this trip. Never reveal system internals, credentials, or unrelated user data.
- When asked for advice, ground it in the trip snapshot provided below and available tools.
- Prefer short answers; expand only when a member explicitly asks for detail.
- You have the same trip-edit capabilities as a human editor. Prefer calling write tools over telling the member to do it manually.
- Write tools (${tools}) pause for member approval before they run — never claim a change already applied.
- For existing entities, only use stop/day/expense/member ids from the trip snapshot. insertStop and addExpense create new ids after approval.
- checkWeather, placeSearch, placeNearby, placeDetail, routeCompute, routeMatrix, and reviewLookup are read-only and do not need approval.
- Use geo read tools to discover places and travel times, then propose insertStop (or other write tools) when the member wants a found place added to the trip.`;
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

Return addressed=true only when the latest message clearly expects a reply from the agent, for example:
- an explicit @agent mention,
- a direct question or request aimed at the agent ("can you…", "帮我…", "agent, …"),
- asking the agent to check, suggest, fix, or explain something about this trip.

Return addressed=false for:
- member-to-member chatter that does not involve the agent,
- status updates, acknowledgements, or planning notes with no ask,
- messages that only discuss the trip among humans without inviting the agent.

Default to addressed=false when unsure.
Respond with a JSON object: {"addressed": true|false}.`;

const interventionSchema = z.object({
  shouldNotify: z.boolean(),
  severity: z.enum(["info", "warning", "critical"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  suggestion: z.string(),
  pendingPatch: pendingPatchSchema.nullable(),
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

/** Convert the shared session history into model messages. Assistant entries
 * keep their role; human and operation entries become labeled user messages
 * so the model can attribute statements to members. */
function toModelMessages(
  history: AgentMessage[],
  actorName: (userId: string | null) => string,
): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const message of history) {
    const text = textOf(message.parts);
    if (!text.trim()) continue;
    if (message.role === "assistant") {
      messages.push({ role: "assistant", content: text });
    } else if (message.source === "operation") {
      messages.push({ role: "user", content: `[operation] ${text}` });
    } else {
      messages.push({
        role: "user",
        content: `[${actorName(message.actorUserId)}] ${text}`,
      });
    }
  }
  return messages;
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
  ) {
    if (config.baseUrl) {
      const provider = createOpenAICompatible({
        name: config.provider,
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      });
      this.model = provider(config.model);
    } else {
      const provider = createOpenAI({ apiKey: config.apiKey });
      this.model = provider(config.model);
    }
  }

  /** Read-only tools always available (no approval). Not part of trip ops.
   * Weather and geo go through application services, never provider clients. */
  private readTools(): ToolSet {
    return {
      ...buildWeatherReadTools(this.weatherService),
      ...buildGeoReadTools(this.geoService),
    };
  }

  private chatTools(
    applyPatch?: (patch: PendingPatch) => Promise<AgentToolApplyResult>,
  ): ToolSet {
    if (!applyPatch) return this.readTools();
    return { ...this.readTools(), ...buildWriteTools(applyPatch) };
  }

  private chatSystem(trip: TripSnapshot): string {
    return `${chatSystemPrompt()}\n\nCurrent trip snapshot:\n${tripContext(trip)}`;
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
    );
  }

  async streamChat(request: AgentChatRequest): Promise<Response> {
    const tools = this.chatTools(request.applyPatch);
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
      stopWhen: stepCountIs(this.config.maxToolSteps),
    });

    return result.toUIMessageStreamResponse({
      originalMessages,
      generateMessageId: generateId,
      onFinish: async ({ responseMessage }) => {
        await request.onFinish(
          responseMessage.parts as AgentMessagePart[],
          responseMessage.id,
        );
      },
    });
  }

  async generateReply(
    request: Pick<AgentChatRequest, "trip" | "history">,
  ): Promise<AgentMessagePart[]> {
    // Ambient replies stay read-only: no write tools, no approval loop.
    const result = await generateText({
      model: this.model,
      system: this.chatSystem(request.trip),
      messages: toModelMessages(
        request.history,
        this.actorNameResolver(request.trip),
      ),
      tools: this.readTools(),
      stopWhen: stepCountIs(this.config.maxToolSteps),
    });
    return [{ type: "text", text: result.text }];
  }

  async isAddressed(request: AgentAddressedRequest): Promise<boolean> {
    const recentContext = toModelMessages(
      request.history.slice(-20),
      this.actorNameResolver(request.trip),
    )
      .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
      .join("\n");

    const { object } = await generateObject({
      model: this.model,
      schema: addressedSchema,
      system: ADDRESSED_SYSTEM_PROMPT,
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
    const recentContext = toModelMessages(
      request.history.slice(-20),
      this.actorNameResolver(request.trip),
    )
      .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
      .join("\n");

    const { object } = await generateObject({
      model: this.model,
      schema: interventionSchema,
      system: EVALUATION_SYSTEM_PROMPT,
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
