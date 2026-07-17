import type { TFunction } from "i18next";

const TOOL_NAME_KEYS = {
  checkWeather: "tool.names.checkWeather",
  placeSearch: "tool.names.placeSearch",
  placeNearby: "tool.names.placeNearby",
  placeDetail: "tool.names.placeDetail",
  routeCompute: "tool.names.routeCompute",
  routeMatrix: "tool.names.routeMatrix",
  reviewLookup: "tool.names.reviewLookup",
  readTripMedia: "tool.names.readTripMedia",
  appendStopNote: "tool.names.appendStopNote",
} as const;

type KnownToolName = keyof typeof TOOL_NAME_KEYS;

/** Resolve a localized display label for an agent tool id. */
export function toolDisplayName(t: TFunction<"agent">, toolName: string): string {
  if (toolName in TOOL_NAME_KEYS) {
    return t(TOOL_NAME_KEYS[toolName as KnownToolName]);
  }
  return toolName;
}
