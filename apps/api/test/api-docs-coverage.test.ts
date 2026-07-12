/**
 * Structural gate: every shipped HTTP route in createApp must appear in the
 * client-facing API docs under docs/backend/api/. Prevents route ↔ doc drift.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const appPath = resolve(root, "apps/api/src/interfaces/http/app.ts");
const apiDocsDir = resolve(root, "docs/backend/api");
const apiDocsIndex = resolve(apiDocsDir, "README.md");
const apiDocsStub = resolve(root, "docs/backend/api.md");
const dtoPath = resolve(root, "apps/api/src/application/dto.ts");
const opsSchemasPath = resolve(
  root,
  "apps/api/src/application/trip/ops/schemas.ts",
);

/** Concatenate all markdown under docs/backend/api/ for coverage checks. */
function loadApiDocsCorpus(): string {
  const files = readdirSync(apiDocsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files
    .map((f) => readFileSync(join(apiDocsDir, f), "utf8"))
    .join("\n\n");
}

/** Extract route registrations from app.ts (including agent sub-router). */
function extractShippedRoutes(source: string): string[] {
  const routes: string[] = [];

  if (/app\.on\(\s*\[["']GET["'],\s*["']POST["']\]\s*,\s*["']\/api\/auth\/\*["']/.test(source)) {
    routes.push("GET,POST /api/auth/*");
  }

  const appRouteRe =
    /app\.(get|post|put|patch|delete|on)\(\s*(?:\[\s*["']GET["']\s*,\s*["']POST["']\s*\]\s*,\s*)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = appRouteRe.exec(source)) !== null) {
    const method = m[1]!;
    const path = m[2]!;
    if (method === "on") continue;
    routes.push(`${method.toUpperCase()} ${path}`);
  }

  const guardRouteRe =
    /guard\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  while ((m = guardRouteRe.exec(source)) !== null) {
    routes.push(`${m[1]!.toUpperCase()} /api${m[2]}`);
  }

  const guardBodyLimitRe =
    /guard\.(get|post|put|patch|delete)\(\s*\n?\s*["']([^"']+)["']\s*,\s*bodyLimit/g;
  while ((m = guardBodyLimitRe.exec(source)) !== null) {
    const key = `${m[1]!.toUpperCase()} /api${m[2]}`;
    if (!routes.includes(key)) routes.push(key);
  }

  const agentRouteRe =
    /agent\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  while ((m = agentRouteRe.exec(source)) !== null) {
    routes.push(`${m[1]!.toUpperCase()} /api/trips/:tripId/agent${m[2]}`);
  }

  return [...new Set(routes)].sort();
}

const REQUIRED_DOC_PATHS = [
  "/api/auth/*",
  "/api/mobile-auth/oauth/start",
  "/api/mobile-auth/oauth/complete",
  "/api/mobile-auth/oauth/exchange",
  "/api/health",
  "/api/uploads/*",
  "/api/weather",
  "/api/fx/rates",
  "/api/agent/status",
  "/api/trips",
  "POST | `/api/trips`",
  "/api/trips/:id",
  "/api/trips/:id/days",
  "/api/trips/:id/days/:day",
  "/api/trips/:id/days/order",
  "DELETE | `/api/trips/:id/days/:day`",
  "/api/trips/:id/stops",
  "/api/trips/:id/stops/:stopId",
  "/api/trips/:id/stops/:stopId/position",
  "/api/trips/:id/stops/:stopId/vote",
  "/api/trips/:id/stops/:stopId/comments",
  "/api/trips/:id/media",
  "/api/trips/:id/expenses",
  "/api/trips/:id/expenses/:expenseId",
  "/api/trips/:id/reservations",
  "/api/trips/:id/reservations/:reservationId",
  "/api/trips/:id/reservations/:reservationId/cancel",
  "/api/trips/:id/invites",
  "/api/trip-invites/:token",
  "/api/trip-invites/:token/accept",
  "/api/users/preferences",
  "/api/users/preferences/agent-panel",
  "/api/users/avatar",
  "/api/trips/:tripId/agent/messages",
  "/api/trips/:tripId/agent/chat",
  "/api/trips/:tripId/agent/events",
  "/api/trips/:tripId/agent/suggestions/:suggestionId/approve",
  "/api/trips/:tripId/agent/suggestions/:suggestionId/apply",
  "/api/trips/:tripId/agent/suggestions/:suggestionId/dismiss",
] as const;

const REQUIRED_DTO_MARKERS = [
  "TripSummary",
  "TripDto",
  "TripPermissions",
  "Budget",
  "InvitePreview",
  "UserPreferenceDto",
  "WeatherData",
  "FxRatesData",
  "AgentHistoryDto",
  "AgentEventsDto",
  "AgentMessageDto",
  "AgentSuggestionDto",
  "PendingPatch",
  "ReservationDto",
  "StopCategory",
  '"data"',
  '"error"',
  "unauthenticated",
  "credentials",
] as const;

const REQUIRED_SPLIT_FILES = [
  "README.md",
  "conventions.md",
  "auth-session.md",
  "routes.md",
  "platform.md",
  "trips.md",
  "itinerary.md",
  "expenses.md",
  "invites.md",
  "user.md",
  "agent-endpoints.md",
  "dtos.md",
  "errors.md",
  "multi-client.md",
] as const;

describe("client API documentation coverage", () => {
  const appSource = readFileSync(appPath, "utf8");
  const docs = loadApiDocsCorpus();
  const dtoSource = readFileSync(dtoPath, "utf8");
  const opsSource = readFileSync(opsSchemasPath, "utf8");

  it("keeps a split docs tree under docs/backend/api/", () => {
    const present = readdirSync(apiDocsDir).filter((f) => f.endsWith(".md"));
    for (const f of REQUIRED_SPLIT_FILES) {
      expect(present, `missing ${f}`).toContain(f);
    }
    const stub = readFileSync(apiDocsStub, "utf8");
    expect(stub).toMatch(/api\/README\.md/);
    const index = readFileSync(apiDocsIndex, "utf8");
    expect(index).toMatch(/conventions\.md/);
    expect(index).toMatch(/dtos\.md/);
    expect(index).toMatch(/routes\.md/);
  });

  it("extracts the known shipped route set from app.ts", () => {
    const routes = extractShippedRoutes(appSource);

    expect(routes).toContain("DELETE /api/trips/:id/days/:day");
    expect(routes).toContain("PUT /api/trips/:id/stops/:stopId/position");
    expect(routes).toContain("GET /api/health");
    expect(routes).toContain("GET,POST /api/auth/*");
    expect(routes).toContain("POST /api/trips/:tripId/agent/chat");
    expect(routes).toContain("GET /api/weather");
    expect(routes).toContain("GET /api/fx/rates");

    expect(appSource).toContain('guard.route("/trips/:tripId/agent", agent)');
    expect(appSource).toContain('app.route("/api", guard)');
  });

  it("documents every required path across docs/backend/api/", () => {
    const missing = REQUIRED_DOC_PATHS.filter((p) => !docs.includes(p));
    expect(missing, `Missing from api docs: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents contract sections clients need", () => {
    for (const marker of REQUIRED_DTO_MARKERS) {
      expect(docs, `api docs should mention ${marker}`).toContain(marker);
    }
    expect(docs).toMatch(/# Conventions|# Authentication and session/);
    expect(docs).toMatch(/# DTO catalog/);
    expect(docs).toMatch(/# Route index/);
  });

  it("documents TripDto fields that exist on the application serializer", () => {
    expect(dtoSource).toContain("export interface TripDto");
    const fieldMatches = [
      ...dtoSource.matchAll(/^\s{2}(\w+)[?:]?:/gm),
    ].map((x) => x[1]!);
    const tripDtoFields = fieldMatches.slice(
      fieldMatches.indexOf("id"),
      fieldMatches.indexOf("budget") + 1,
    );
    for (const field of [
      "id",
      "title",
      "status",
      "currency",
      "startDate",
      "members",
      "permissions",
      "days",
      "stops",
      "expenses",
      "budget",
    ]) {
      expect(tripDtoFields, `TripDto has ${field}`).toContain(field);
      expect(docs, `api docs document TripDto.${field}`).toMatch(
        new RegExp(`\\\`${field}\\\``),
      );
    }
  });

  it("documents edge mutation schemas that ship in trip ops", () => {
    expect(opsSource).toContain("export const insertStopSchema");
    expect(opsSource).toContain("export const moveStopBodySchema");
    expect(opsSource).toContain("export const updateDaySchema");
    expect(opsSource).toContain("export const expenseDraftSchema");
    expect(opsSource).toContain("export const reorderDaysSchema");

    expect(docs).toContain("DELETE /api/trips/:id/days/:day");
    expect(docs).toContain("PUT /api/trips/:id/stops/:stopId/position");
    expect(docs).toMatch(/`color`/);
  });

  it("documents vote/comment as edit (loadEditable) and agent addressed semantics", () => {
    const useCases = readFileSync(
      resolve(root, "apps/api/src/application/use-cases.ts"),
      "utf8",
    );
    const voteBlock = useCases.slice(
      useCases.indexOf("async toggleVote"),
      useCases.indexOf("async addComment"),
    );
    const commentBlock = useCases.slice(
      useCases.indexOf("async addComment"),
      useCases.indexOf("async addExpense"),
    );
    expect(voteBlock).toContain("loadEditable");
    expect(commentBlock).toContain("loadEditable");
    expect(docs).toMatch(/stops\/:stopId\/vote[\s\S]*?session \+ edit/);
    expect(docs).toMatch(
      /stops\/:stopId\/comments[\s\S]*?session \+ \*\*edit\*\*|stops\/:stopId\/comments[\s\S]*?session \+ edit/,
    );

    const agentService = readFileSync(
      resolve(root, "apps/api/src/application/agent/agent-service.ts"),
      "utf8",
    );
    const postMsg = agentService.slice(
      agentService.indexOf("async postMessage"),
      agentService.indexOf("async streamChat"),
    );
    expect(postMsg).toContain("return { addressed: true, message: messageDto }");
    expect(postMsg).toContain(
      "return { addressed: false, message: messageDto }",
    );
    expect(postMsg).toContain("maybeReplyIfAddressed");
    expect(docs).toMatch(
      /addressed[\s\S]*?explicit `@agent`|addressed[\s\S]*?explicit @agent/,
    );
    expect(docs).toMatch(/maybeReplyIfAddressed|non-mention/);
    expect(docs).toMatch(/message:\s*AgentMessageDto|message` — the inserted/);
  });
});
