import type {
  AgentLanguage,
  AgentMessage,
  AgentStreetViewGrounding,
  AgentStreetViewRequest,
} from "../../domain/agent";
import type { GeoService } from "../geo/geo-service";
import {
  noopObservability,
  type Observability,
} from "../observability";
import { StreetViewError, type StreetViewService } from "../street-view";

const STREET_VIEW_RADIUS_METERS = 100;
const STREET_VIEW_RESULT_LIMIT = 5;
const PLACE_SEARCH_LIMIT = 1;
const MAX_REQUEST_TEXT_LENGTH = 240;
const GROUNDING_PART_TYPE = "data-agent-grounding";

const STREET_VIEW_INTENT_PATTERN =
  /(?:街景|道路影像|实景图|全景(?:图|影像)?|street\s*view|streetview|streetscape|roadside\s+imagery|panorama)/iu;
const COORDINATE_PAIR_PATTERN =
  /(?:^|[^\d.-])(-?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?))\s*[,，]\s*(-?(?:1[0-7]\d(?:\.\d+)?|(?:\d?\d)(?:\.\d+)?|180(?:\.0+)?))(?:$|[^\d.])/u;
const COORDINATE_LIKE_PATTERN =
  /(?:^|[^\d.-])-?\d{1,3}(?:\.\d+)?\s*[,，]\s*-?\d{1,3}(?:\.\d+)?(?:$|[^\d.])/u;
const CHINESE_ORDINAL_PATTERN =
  /^(?:@agent\s*)?(?:第?\s*二\s*(?:个|张)?|第?\s*2\s*(?:个|张)?|2号)(?:\s*(?:看看|看一下|看下|图片|街景))?[。.!！?？]?$/iu;
const ENGLISH_ORDINAL_PATTERN =
  /^(?:@agent\s*)?(?:the\s+)?(?:second|2nd)(?:\s+(?:one|image|view|result))?(?:\s+please)?[.!?]?$/iu;

type ParsedStreetViewRequest =
  | { kind: "not_street_view" }
  | { kind: "invalid"; language: AgentLanguage }
  | { kind: "request"; request: AgentStreetViewRequest };

function textFromParts(parts: AgentMessage["parts"]): string {
  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function languageOf(text: string): AgentLanguage {
  return /\p{Script=Han}/u.test(text) ? "zh" : "en";
}

function normalizedPlaceQuery(text: string): string {
  return text
    .replace(/@agent\b/giu, " ")
    .replace(STREET_VIEW_INTENT_PATTERN, " ")
    .replace(/(?:附近|周边|旁边|周围|一带)/gu, " ")
    .replace(/\b(?:near|nearby|around|at|of)\b/giu, " ")
    .replace(
      /^\s*(?:请|麻烦|帮我|可以|能否|能不能|想要|我要|看看|看一下|看下|看|查找|搜索|找找|显示|展示|打开)+/u,
      " ",
    )
    .replace(
      /^\s*(?:please\s+)?(?:show|find|search|check|open|display|look\s+up)(?:\s+me)?\s+/iu,
      " ",
    )
    .replace(/(?:看看|看一下|看下|可以吗|好吗|谢谢)$/u, " ")
    .replace(/[，,。.!！?？:：;；]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGroundingRequest(value: unknown): value is AgentStreetViewRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  if (
    (request.language !== "en" && request.language !== "zh") ||
    !Number.isInteger(request.selectionIndex) ||
    (request.selectionIndex as number) < 0 ||
    (request.selectionIndex as number) > 4
  ) {
    return false;
  }
  if (request.kind === "place") {
    return (
      typeof request.query === "string" &&
      request.query.length >= 2 &&
      request.query.length <= 160
    );
  }
  return (
    request.kind === "coordinate" &&
    typeof request.lat === "number" &&
    typeof request.lng === "number" &&
    Number.isFinite(request.lat) &&
    Number.isFinite(request.lng) &&
    request.lat >= -90 &&
    request.lat <= 90 &&
    request.lng >= -180 &&
    request.lng <= 180
  );
}

function previousGroundingRequest(
  history: readonly AgentMessage[],
  latestUserIndex: number,
): AgentStreetViewRequest | null {
  for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message || message.role === "user") return null;
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== GROUNDING_PART_TYPE) continue;
      const data = (part as { data?: unknown }).data;
      if (typeof data !== "object" || data === null) continue;
      const candidate = data as Record<string, unknown>;
      if (
        candidate.kind === "street-view" &&
        candidate.outcome === "found" &&
        isGroundingRequest(candidate.request)
      ) {
        return candidate.request;
      }
    }
    return null;
  }
  return null;
}

export function parseStreetViewRequest(
  history: readonly AgentMessage[],
): ParsedStreetViewRequest {
  let latestUserIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex < 0) return { kind: "not_street_view" };

  const text = textFromParts(history[latestUserIndex]!.parts)
    .normalize("NFKC")
    .trim();
  const language = languageOf(text);
  if (CHINESE_ORDINAL_PATTERN.test(text) || ENGLISH_ORDINAL_PATTERN.test(text)) {
    const previous = previousGroundingRequest(history, latestUserIndex);
    if (!previous) return { kind: "not_street_view" };
    return {
      kind: "request",
      request: { ...previous, language, selectionIndex: 1 },
    };
  }

  if (!STREET_VIEW_INTENT_PATTERN.test(text)) {
    return { kind: "not_street_view" };
  }
  if (!text || text.length > MAX_REQUEST_TEXT_LENGTH) {
    return { kind: "invalid", language };
  }

  const coordinate = text.match(COORDINATE_PAIR_PATTERN);
  if (coordinate) {
    const lat = Number(coordinate[1]);
    const lng = Number(coordinate[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        kind: "request",
        request: {
          kind: "coordinate",
          lat,
          lng,
          language,
          selectionIndex: 0,
        },
      };
    }
  }
  if (COORDINATE_LIKE_PATTERN.test(text)) {
    return { kind: "invalid", language };
  }

  const query = normalizedPlaceQuery(text);
  if (query.length < 2 || query.length > 160) {
    return { kind: "invalid", language };
  }
  return {
    kind: "request",
    request: {
      kind: "place",
      query,
      language,
      selectionIndex: 0,
    },
  };
}

function coordinateLabel(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function groundingText(
  outcome: AgentStreetViewGrounding["outcome"],
  language: AgentLanguage,
  placeLabel?: string,
  selectionIndex = 0,
): string {
  if (language === "zh") {
    if (outcome === "found") {
      return `${placeLabel ?? "该位置"}附近找到了街景，已显示第${selectionIndex + 1}个结果。`;
    }
    if (outcome === "empty") {
      return selectionIndex > 0
        ? `${placeLabel ?? "该位置"}附近没有可用的第${selectionIndex + 1}个街景结果。`
        : `${placeLabel ?? "该位置"}附近暂未找到街景。`;
    }
    if (outcome === "place_not_found") {
      return "没有找到这个地点，请换一个更明确的地点。";
    }
    if (outcome === "invalid_request") {
      return "请提供明确的地点名称或有效坐标。";
    }
    return "街景服务暂时不可用，请稍后重试。";
  }
  if (outcome === "found") {
    return `Street view was found near ${placeLabel ?? "this location"}; showing result ${selectionIndex + 1}.`;
  }
  if (outcome === "empty") {
    return selectionIndex > 0
      ? `No street-view result ${selectionIndex + 1} is available near ${placeLabel ?? "this location"}.`
      : `No street view was found near ${placeLabel ?? "this location"}.`;
  }
  if (outcome === "place_not_found") {
    return "That place could not be found. Try a more specific place name.";
  }
  if (outcome === "invalid_request") {
    return "Provide a specific place name or valid coordinates.";
  }
  return "Street view is temporarily unavailable. Try again later.";
}

/** Deterministic application orchestration for every street-view agent entry. */
export class StreetViewGroundingService {
  constructor(
    private readonly geoService: GeoService,
    private readonly streetViewService: StreetViewService | null,
    private readonly observability: Observability = noopObservability,
  ) {}

  async resolve(input: {
    tripId: string;
    history: readonly AgentMessage[];
    observability?: {
      requestId?: string;
      turnId?: string;
      runtime?: "cloudflare" | "node";
    };
  }): Promise<AgentStreetViewGrounding | null> {
    const parsed = parseStreetViewRequest(input.history);
    if (parsed.kind === "not_street_view") return null;
    if (parsed.kind === "invalid") {
      return {
        outcome: "invalid_request",
        language: parsed.language,
        imageIds: [],
        text: groundingText("invalid_request", parsed.language),
      };
    }

    const { request } = parsed;
    if (!this.streetViewService) {
      return {
        outcome: "service_unavailable",
        request,
        retryable: false,
        imageIds: [],
        text: groundingText("service_unavailable", request.language),
      };
    }

    try {
      let lat: number;
      let lng: number;
      let placeLabel: string;
      if (request.kind === "place") {
        const places = await this.observability.startSpan(
          "opentrip.provider.geo.place_search",
          {
            provider: "geo",
            providerOperation: "place_search",
            tripId: input.tripId,
            requestId: input.observability?.requestId,
            turnId: input.observability?.turnId,
            requestedLimit: PLACE_SEARCH_LIMIT,
          },
          async (span) => {
            const startedAt = Date.now();
            const result = await this.geoService.placeSearch({
              query: request.query,
              limit: PLACE_SEARCH_LIMIT,
              lang: request.language,
            });
            span.setAttribute("opentrip.provider.result_count", result.length);
            span.setAttribute(
              "opentrip.provider.duration_ms",
              Date.now() - startedAt,
            );
            return result;
          },
        );
        const place = places[0];
        if (!place) {
          this.logOutcome(input, request, "place_not_found", 0, 0);
          return {
            outcome: "place_not_found",
            request,
            imageIds: [],
            text: groundingText("place_not_found", request.language),
          };
        }
        lat = place.lat;
        lng = place.lng;
        placeLabel = place.label || place.name;
      } else {
        lat = request.lat;
        lng = request.lng;
        placeLabel = coordinateLabel(lat, lng);
      }

      const startedAt = Date.now();
      const result = await this.observability.startSpan(
        "opentrip.provider.street_view.search",
        {
          provider: "street_view",
          providerOperation: "search",
          tripId: input.tripId,
          requestId: input.observability?.requestId,
          turnId: input.observability?.turnId,
          radiusMeters: STREET_VIEW_RADIUS_METERS,
          requestedLimit: STREET_VIEW_RESULT_LIMIT,
        },
        async (span) => {
          const providerStartedAt = Date.now();
          const value = await this.streetViewService!.searchNearby({
            tripId: input.tripId,
            lat,
            lng,
            radiusMeters: STREET_VIEW_RADIUS_METERS,
            limit: STREET_VIEW_RESULT_LIMIT,
            observability: input.observability,
          });
          span.setAttribute("opentrip.provider.outcome", value.outcome);
          span.setAttribute(
            "opentrip.provider.result_count",
            value.images.length,
          );
          span.setAttribute(
            "opentrip.provider.duration_ms",
            Date.now() - providerStartedAt,
          );
          return value;
        },
      );
      const imageIds = result.images.map((image) => image.id);
      const selectedImageId = imageIds[request.selectionIndex];
      const durationMs = Date.now() - startedAt;
      if (!selectedImageId) {
        this.logOutcome(input, request, "empty", imageIds.length, durationMs);
        return {
          outcome: "empty",
          request,
          placeLabel,
          imageIds,
          text: groundingText(
            "empty",
            request.language,
            placeLabel,
            request.selectionIndex,
          ),
        };
      }

      this.logOutcome(input, request, "found", imageIds.length, durationMs);
      return {
        outcome: "found",
        request,
        placeLabel,
        imageIds,
        selectedImageId,
        text: groundingText(
          "found",
          request.language,
          placeLabel,
          request.selectionIndex,
        ),
      };
    } catch (error) {
      this.observability.logger.error("agent.street_view_grounding.failed", {
        tripId: input.tripId,
        requestId: input.observability?.requestId,
        turnId: input.observability?.turnId,
        requestKind: request.kind,
        outcome: "service_unavailable",
        errorType: error instanceof Error ? error.name : typeof error,
      });
      this.observability.captureException(error, {
        tripId: input.tripId,
        requestId: input.observability?.requestId,
        turnId: input.observability?.turnId,
        outcome: "service_unavailable",
      });
      return {
        outcome: "service_unavailable",
        request,
        retryable: error instanceof StreetViewError ? error.retryable : true,
        imageIds: [],
        text: groundingText("service_unavailable", request.language),
      };
    }
  }

  private logOutcome(
    input: {
      tripId: string;
      observability?: { requestId?: string; turnId?: string };
    },
    request: AgentStreetViewRequest,
    outcome: AgentStreetViewGrounding["outcome"],
    resultCount: number,
    durationMs: number,
  ): void {
    this.observability.logger.info("agent.street_view_grounding.completed", {
      tripId: input.tripId,
      requestId: input.observability?.requestId,
      turnId: input.observability?.turnId,
      requestKind: request.kind,
      outcome,
      resultCount,
      durationMs,
    });
  }
}
