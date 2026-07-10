import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { containsAgentMention, type Defer } from "../../application";
import type { OperationEvent } from "../../domain/agent";
import { MAX_AVATAR_BYTES } from "../../application/avatar";
import { MAX_TRIP_MEDIA_BYTES } from "../../application/media";
import { isManagedUploadPath } from "../../application/storage";
import {
  dayNumberParamSchema,
  expenseDraftSchema,
  insertStopSchema,
  moveStopBodySchema,
  renameTripSchema,
  reorderDaysSchema,
  updateDaySchema,
  updateStopChangesSchema,
} from "../../application/trip/ops";
import { BetterAuthCurrentUserProfile } from "../../infrastructure/auth/current-user-profile";
import type { Container } from "../../infrastructure/composition/container";
import { handleError } from "./errors";
import { ok, fail } from "./response";

type Session = Container["auth"]["$Infer"]["Session"];

interface Env {
  Variables: {
    user: Session["user"] | null;
    session: Session["session"] | null;
  };
}

/** Trip-scoped mutation schemas come from the trip ops registry. */
const moveStopSchema = moveStopBodySchema;
const updateStopSchema = updateStopChangesSchema;
const expenseSchema = expenseDraftSchema;
const dayNumberSchema = dayNumberParamSchema;

const commentSchema = z.object({ text: z.string().min(1) });

const mobileOAuthStartQuerySchema = z.object({
  provider: z.literal("google"),
});

const mobileOAuthExchangeSchema = z.object({
  code: z.string().min(16).max(512),
});

const createTripSchema = z.object({
  title: z.string().trim().min(1).max(120),
  currency: z.string().trim().min(1).max(8).optional(),
});

const createInviteSchema = z
  .object({
    accessScope: z.enum(["anyone", "restricted_emails"]),
    allowedEmails: z.array(z.string().trim().email()).max(50).optional().default([]),
    role: z.enum(["editor", "viewer"]),
    canInvite: z.boolean().optional().default(false),
    expiresAt: z.string().datetime().nullable().optional().default(null),
    /** When present, the link with this token is revoked once the new one is issued. */
    previousToken: z.string().min(1).optional(),
  })
  .refine(
    (v) => v.accessScope !== "restricted_emails" || v.allowedEmails.length > 0,
    { message: "At least one email is required for a restricted invite" },
  );

const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_AVATAR_REQUEST_BYTES = MAX_AVATAR_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
const MAX_TRIP_MEDIA_REQUEST_BYTES =
  MAX_TRIP_MEDIA_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;

/** Build the Hono app for a wired container. Shared by the Node and Workers
 * entry points. */
const preferenceSchema = z.object({
  plannerSidebarWidth: z.number().min(0).max(100),
  plannerSidebarCollapsed: z.boolean(),
});

const agentPanelPreferenceSchema = z.object({
  collapsed: z.boolean(),
});

const agentPostMessageSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
});

const agentUiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.string(),
  parts: z.array(
    z.object({ type: z.string(), text: z.string().optional() }).passthrough(),
  ),
});

const agentChatSchema = z.object({
  /**
   * Full UI message list for the current turn (AI SDK useChat). Required for
   * tool-approval continuation; also used to extract the latest user text.
   */
  messages: z.array(agentUiMessageSchema).optional(),
  /** Legacy single-message body; still accepted for simple text turns. */
  message: agentUiMessageSchema.nullable().optional(),
});

/** Aligns with AI SDK `addToolApprovalResponse({ id, approved, reason? })`. */
const agentApprovalSchema = z.object({
  id: z.string().min(1).optional(),
  approved: z.boolean(),
  reason: z.string().max(500).optional(),
});

const agentEventsQuerySchema = z.coerce.number().int().min(0).default(0);

export function createApp(container: Container) {
  const {
    auth,
    tripService,
    tripInviteService,
    preferenceService,
    avatarService,
    tripMediaService,
    fileStorage,
    config,
    weatherService,
    fxService,
    agentService,
  } = container;

  /** Schedule work past the response: waitUntil on Workers, floating on Node. */
  const deferOf = (c: Context<Env>): Defer => (task) => {
    const guarded = task.catch((err) =>
      console.error("Deferred agent task failed:", err),
    );
    try {
      c.executionCtx.waitUntil(guarded);
    } catch {
      // Node runtime has no execution context; the floating promise is enough.
    }
  };

  /** Record a whitelisted write operation in the agent session without
   * blocking or failing the originating request. */
  const notifyAgent = (
    c: Context<Env>,
    event: Omit<OperationEvent, "actorUserId" | "actorName">,
  ) => {
    if (!agentService) return;
    const user = c.get("user");
    if (!user) return;
    const defer = deferOf(c);
    defer(
      agentService.recordOperation(
        { ...event, actorUserId: user.id, actorName: user.name || user.email },
        defer,
      ),
    );
  };

  const inviteActor = (u: Session["user"]) => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    image: u.image ?? null,
  });
  const app = new Hono<Env>();

  app.use(
    "*",
    cors({
      origin: config.trustedOrigins,
      credentials: true,
    }),
  );

  // Resolve session for app routes. Skip Better Auth's own `/api/auth/*`
  // surface: it manages cookies/session itself, and an extra getSession
  // before every OAuth/sign-in call doubles DB load (and can hang the
  // Worker isolate when the pool is contended).
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  });

  // Better Auth handler.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Native clients authenticate in ASWebAuthenticationSession. The start
  // endpoint must be opened inside that session so Better Auth's OAuth state
  // cookie lands in the same jar as Google's callback. This bridge only turns
  // the resulting cookie session into a short-lived, single-use code for the app.
  app.get("/api/mobile-auth/oauth/start", async (c) => {
    const { provider } = mobileOAuthStartQuerySchema.parse(c.req.query());
    if (!config.googleOAuth) {
      return c.redirect("opentrip://auth/callback?error=oauth_unavailable");
    }
    const callbackURL = new URL(
      "/api/mobile-auth/oauth/complete",
      config.betterAuthUrl,
    ).toString();
    const { headers, response } = await auth.api.signInSocial({
      headers: c.req.raw.headers,
      body: { provider, callbackURL, disableRedirect: true },
      returnHeaders: true,
    });
    if (!response.url) {
      return fail(c, "oauth_start_failed", "Unable to start Google sign-in", 502);
    }
    const redirect = c.redirect(response.url);
    for (const cookie of headers.getSetCookie()) {
      redirect.headers.append("Set-Cookie", cookie);
    }
    return redirect;
  });

  app.get("/api/mobile-auth/oauth/complete", async (c) => {
    try {
      const { token } = await auth.api.generateOneTimeToken({
        headers: c.req.raw.headers,
      });
      const callback = new URL("opentrip://auth/callback");
      callback.searchParams.set("code", token);
      return c.redirect(callback.toString());
    } catch {
      return c.redirect("opentrip://auth/callback?error=oauth_session_missing");
    }
  });

  app.post("/api/mobile-auth/oauth/exchange", async (c) => {
    const { code } = mobileOAuthExchangeSchema.parse(await c.req.json());
    const session = await auth.api.verifyOneTimeToken({ body: { token: code } });
    return c.json({ token: session.session.token, session });
  });

  app.get("/api/health", (c) => ok(c, { status: "ok" }));

  // Invite preview is public so unauthenticated users can see what they were
  // invited to before signing in. Membership/email checks apply on accept.
  app.get("/api/trip-invites/:token", async (c) => {
    const user = c.get("user");
    return ok(
      c,
      await tripInviteService.previewInvite(
        c.req.param("token"),
        user ? inviteActor(user) : null,
      ),
    );
  });

  // Serve uploaded files publicly (avatars, trip note images, etc.).
  app.get("/api/uploads/*", async (c) => {
    const encodedPath = c.req.path.replace(/^\/api\/uploads\//, "");
    const storagePath = decodeStoragePath(encodedPath);
    if (!storagePath || !isManagedUploadPath(storagePath)) {
      return fail(c, "invalid_path", "Invalid path", 400);
    }
    const file = await fileStorage.read(storagePath);
    if (!file) return fail(c, "not_found", "File not found", 404);
    return new Response(file.content, {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  // Everything below requires a session.
  const guard = new Hono<Env>();
  guard.use("*", async (c, next) => {
    if (!c.get("session")) return fail(c, "unauthenticated", "Sign in required", 401);
    await next();
  });

  guard.get("/trips", async (c) =>
    ok(c, await tripService.listTrips(c.get("user")!.id)),
  );

  // Weather proxy: UI and agent both use WeatherService (never a vendor client).
  guard.get("/weather", async (c) => {
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    const date = c.req.query("date")?.trim();
    const time = c.req.query("time")?.trim();
    const lang = c.req.query("lang")?.trim() || "en";
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return fail(c, "invalid_coordinates", "lat and lon are required", 400);
    }
    return ok(c, await weatherService.getWeather(lat, lon, date, time, lang));
  });

  // FX proxy: budget settle-up uses FxService (never a vendor client).
  guard.get("/fx/rates", async (c) => {
    const base = c.req.query("base")?.trim() ?? "";
    const quotesRaw = c.req.query("quotes")?.trim() ?? "";
    const date = c.req.query("date")?.trim();
    const quotes = quotesRaw
      ? quotesRaw.split(",").map((q) => q.trim()).filter(Boolean)
      : undefined;
    return ok(c, await fxService.getRates(base, quotes, date));
  });

  guard.post("/trips", async (c) => {
    const user = c.get("user")!;
    const input = createTripSchema.parse(await c.req.json());
    const dto = await tripService.createTrip(input, {
      id: user.id,
      name: user.name || user.email,
      image: user.image ?? null,
    });
    return ok(c, dto, 201);
  });

  guard.get("/trips/:id", async (c) =>
    ok(c, await tripService.getTrip(c.req.param("id"), c.get("user")!.id)),
  );

  guard.patch("/trips/:id", async (c) => {
    const { title } = renameTripSchema.parse(await c.req.json());
    return ok(
      c,
      await tripService.renameTrip(c.req.param("id"), title, c.get("user")!.id),
    );
  });

  guard.post("/trips/:id/days", async (c) =>
    ok(c, await tripService.addDay(c.req.param("id"), c.get("user")!.id), 201),
  );

  guard.put("/trips/:id/days/order", async (c) => {
    const { order } = reorderDaysSchema.parse(await c.req.json());
    const dto = await tripService.reorderDays(
      c.req.param("id"),
      order,
      c.get("user")!.id,
    );
    notifyAgent(c, {
      tripId: dto.id,
      operation: "reorder_days",
      summary: `reordered the itinerary days to [${order.join(", ")}]`,
      details: { order },
    });
    return ok(c, dto);
  });

  guard.delete("/trips/:id/days/:day", async (c) => {
    const dayNumber = dayNumberSchema.parse(c.req.param("day"));
    const dto = await tripService.deleteDay(
      c.req.param("id"),
      dayNumber,
      c.get("user")!.id,
    );
    notifyAgent(c, {
      tripId: dto.id,
      operation: "delete_day",
      summary: `deleted day ${dayNumber}`,
      details: { dayNumber },
    });
    return ok(c, dto);
  });

  guard.patch("/trips/:id/days/:day", async (c) => {
    const dayNumber = dayNumberSchema.parse(c.req.param("day"));
    const input = updateDaySchema.parse(await c.req.json());
    const dto = await tripService.updateDay(
      c.req.param("id"),
      dayNumber,
      input,
      c.get("user")!.id,
    );
    notifyAgent(c, {
      tripId: dto.id,
      operation: "update_day",
      summary: `updated day ${dayNumber}`,
      details: { dayNumber, changes: input },
    });
    return ok(c, dto);
  });

  guard.post("/trips/:id/stops", async (c) => {
    const input = insertStopSchema.parse(await c.req.json());
    const dto = await tripService.insertStop(
      c.req.param("id"),
      input,
      c.get("user")!.id,
    );
    notifyAgent(c, {
      tripId: dto.id,
      operation: "insert_stop",
      summary: `added stop "${input.name}" to day ${input.day}`,
      details: { input },
    });
    return ok(c, dto);
  });

  guard.post(
    "/trips/:id/media",
    bodyLimit({
      maxSize: MAX_TRIP_MEDIA_REQUEST_BYTES,
      onError: (c) => fail(c, "media_too_large", "Image request is too large", 413),
    }),
    async (c) => {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) {
        return fail(c, "media_missing", "Image file is required", 400);
      }
      const url = await tripMediaService.upload(
        c.req.param("id"),
        c.get("user")!.id,
        {
          content: new Uint8Array(await file.arrayBuffer()),
          claimedMimeType: file.type,
        },
      );
      return ok(c, { url }, 201);
    },
  );

  guard.patch("/trips/:id/stops/:stopId", async (c) => {
    const input = updateStopSchema.parse(await c.req.json());
    const stopId = c.req.param("stopId");
    const dto = await tripService.updateStop(
      c.req.param("id"),
      stopId,
      input,
      c.get("user")!.id,
    );
    const stopName = dto.stops.find((s) => s.id === stopId)?.name ?? stopId;
    notifyAgent(c, {
      tripId: dto.id,
      operation: "update_stop",
      summary: `updated stop "${stopName}"`,
      details: { stopId, changes: input },
    });
    return ok(c, dto);
  });

  guard.put("/trips/:id/stops/:stopId/position", async (c) => {
    const input = moveStopSchema.parse(await c.req.json());
    const stopId = c.req.param("stopId");
    const dto = await tripService.moveStop(
      c.req.param("id"),
      { stopId, ...input },
      c.get("user")!.id,
    );
    const stopName = dto.stops.find((s) => s.id === stopId)?.name ?? stopId;
    notifyAgent(c, {
      tripId: dto.id,
      operation: "move_stop",
      summary: `moved stop "${stopName}" to day ${input.day}`,
      details: { stopId, ...input },
    });
    return ok(c, dto);
  });

  guard.post("/trips/:id/stops/:stopId/vote", async (c) =>
    ok(
      c,
      await tripService.toggleVote(
        c.req.param("id"),
        c.req.param("stopId"),
        c.get("user")!.id,
      ),
    ),
  );

  guard.post("/trips/:id/stops/:stopId/comments", async (c) => {
    const { text } = commentSchema.parse(await c.req.json());
    const user = c.get("user")!;
    const stopId = c.req.param("stopId");
    const dto = await tripService.addComment(
      c.req.param("id"),
      stopId,
      text,
      user.id,
    );
    // An @agent mention in a stop comment enters the shared session as a
    // question with the stop as context.
    if (agentService && containsAgentMention(text)) {
      const stopName = dto.stops.find((s) => s.id === stopId)?.name ?? stopId;
      const defer = deferOf(c);
      defer(
        agentService.recordMention(
          dto.id,
          user.id,
          `(commenting on stop "${stopName}") ${text}`,
          defer,
        ),
      );
    }
    return ok(c, dto);
  });

  guard.post("/trips/:id/expenses", async (c) => {
    const input = expenseSchema.parse(await c.req.json());
    const dto = await tripService.addExpense(
      c.req.param("id"),
      input,
      c.get("user")!.id,
    );
    notifyAgent(c, {
      tripId: dto.id,
      operation: "add_expense",
      summary: `added expense "${input.description}" (${input.amount})`,
      details: { input },
    });
    return ok(c, dto);
  });

  guard.patch("/trips/:id/expenses/:expenseId", async (c) => {
    const input = expenseSchema.parse(await c.req.json());
    const expenseId = c.req.param("expenseId");
    const dto = await tripService.updateExpense(
      c.req.param("id"),
      expenseId,
      input,
      c.get("user")!.id,
    );
    notifyAgent(c, {
      tripId: dto.id,
      operation: "update_expense",
      summary: `updated expense "${input.description}"`,
      details: { expenseId, changes: input },
    });
    return ok(c, dto);
  });

  guard.post("/trips/:id/invites", async (c) => {
    const user = c.get("user")!;
    const { previousToken, ...input } = createInviteSchema.parse(
      await c.req.json(),
    );
    const tripId = c.req.param("id");
    const created = previousToken
      ? await tripInviteService.regenerateInvite(
          tripId,
          inviteActor(user),
          previousToken,
          input,
        )
      : await tripInviteService.createInvite(tripId, inviteActor(user), input);
    const origin = c.req.header("origin") ?? config.trustedOrigins[0] ?? "";
    const url = `${origin.replace(/\/$/, "")}/invite/${created.token}`;
    return ok(c, { url, token: created.token, expiresAt: created.expiresAt }, 201);
  });

  guard.post("/trip-invites/:token/accept", async (c) => {
    const user = c.get("user")!;
    const result = await tripInviteService.acceptInvite(
      c.req.param("token"),
      inviteActor(user),
    );
    return ok(c, result);
  });

  guard.post(
    "/users/avatar",
    bodyLimit({
      maxSize: MAX_AVATAR_REQUEST_BYTES,
      onError: (c) => fail(c, "avatar_too_large", "Avatar request is too large", 413),
    }),
    async (c) => {
      const user = c.get("user")!;
      const body = await c.req.parseBody();
      const file = body.avatar;
      if (!(file instanceof File)) {
        return fail(c, "avatar_missing", "Avatar file is required", 400);
      }
      const profile = new BetterAuthCurrentUserProfile(auth, c.req.raw.headers);
      const url = await avatarService.replace(
        user.id,
        user.image ?? null,
        {
          content: new Uint8Array(await file.arrayBuffer()),
          claimedMimeType: file.type,
        },
        profile,
      );
      return ok(c, { url }, 201);
    },
  );

  guard.delete("/users/avatar", async (c) => {
    const user = c.get("user")!;
    const profile = new BetterAuthCurrentUserProfile(auth, c.req.raw.headers);
    await avatarService.remove(user.image ?? null, profile);
    return ok(c, { image: null });
  });

  guard.get("/users/preferences", async (c) =>
    ok(c, await preferenceService.getPreferences(c.get("user")!.id)),
  );

  guard.put("/users/preferences", async (c) => {
    const user = c.get("user")!;
    const input = preferenceSchema.parse(await c.req.json());
    return ok(
      c,
      await preferenceService.updatePlannerSidebar(
        user.id,
        input.plannerSidebarWidth,
        input.plannerSidebarCollapsed,
      ),
    );
  });

  guard.put("/users/preferences/agent-panel", async (c) => {
    const user = c.get("user")!;
    const input = agentPanelPreferenceSchema.parse(await c.req.json());
    return ok(c, await preferenceService.updateAgentPanel(user.id, input.collapsed));
  });

  // Whether the trip agent is available in this deployment.
  guard.get("/agent/status", (c) => ok(c, { enabled: agentService !== null }));

  // Trip agent session routes. All 404 when AI is not configured.
  const agent = new Hono<Env>();
  agent.use("*", async (c, next) => {
    if (!agentService) return fail(c, "agent_disabled", "Agent is not enabled", 404);
    await next();
  });

  agent.get("/messages", async (c) =>
    ok(
      c,
      await agentService!.getHistory(c.req.param("tripId")!, c.get("user")!.id),
    ),
  );

  agent.post("/messages", async (c) => {
    const { text } = agentPostMessageSchema.parse(await c.req.json());
    return ok(
      c,
      await agentService!.postMessage(
        c.req.param("tripId")!,
        c.get("user")!.id,
        text,
        deferOf(c),
      ),
    );
  });

  agent.post("/chat", async (c) => {
    const input = agentChatSchema.parse(await c.req.json());
    const clientMessages =
      input.messages ?? (input.message ? [input.message] : undefined);

    const hasApprovalResponse = (clientMessages ?? []).some((m) =>
      m.parts.some((p) => {
        const state = (p as { state?: unknown }).state;
        const approval = (p as { approval?: { approved?: unknown } }).approval;
        return (
          state === "approval-responded" ||
          (typeof approval === "object" &&
            approval !== null &&
            typeof (approval as { approved?: unknown }).approved === "boolean" &&
            state !== "approval-requested")
        );
      }),
    );

    // Prefer the latest user text (and its client id) from the UI message list.
    let text: string | null = null;
    let clientMessageId: string | undefined;
    if (!hasApprovalResponse && clientMessages?.length) {
      for (let i = clientMessages.length - 1; i >= 0; i--) {
        const m = clientMessages[i]!;
        if (m.role !== "user") continue;
        const joined = m.parts
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text as string)
          .join("\n")
          .trim();
        if (joined) {
          text = joined;
          clientMessageId = m.id;
          break;
        }
      }
    }

    // Streaming response: returned as-is, outside the { data } envelope.
    return agentService!.streamChat(c.req.param("tripId")!, c.get("user")!.id, {
      text,
      clientMessageId,
      clientMessages,
      approvalContinue: hasApprovalResponse,
    });
  });

  agent.get("/events", async (c) => {
    const afterSeq = agentEventsQuerySchema.parse(c.req.query("after"));
    return ok(
      c,
      await agentService!.listEvents(
        c.req.param("tripId")!,
        c.get("user")!.id,
        afterSeq,
      ),
    );
  });

  /** Approve or deny a proactive suggestion (AI SDK approval DTO shape). */
  agent.post("/suggestions/:suggestionId/approve", async (c) => {
    const body = agentApprovalSchema.parse(await c.req.json().catch(() => ({})));
    const suggestionId = c.req.param("suggestionId");
    return ok(
      c,
      await agentService!.respondToSuggestion(
        c.req.param("tripId")!,
        c.get("user")!.id,
        {
          id: body.id ?? suggestionId,
          approved: body.approved,
          reason: body.reason,
        },
      ),
    );
  });

  // Backward-compatible alias: apply === approve with approved: true.
  agent.post("/suggestions/:suggestionId/apply", async (c) => {
    const body = agentApprovalSchema
      .partial()
      .parse(await c.req.json().catch(() => ({})));
    return ok(
      c,
      await agentService!.respondToSuggestion(
        c.req.param("tripId")!,
        c.get("user")!.id,
        {
          id: body.id ?? c.req.param("suggestionId"),
          approved: body.approved ?? true,
          reason: body.reason,
        },
      ),
    );
  });

  agent.post("/suggestions/:suggestionId/dismiss", async (c) => {
    const body = agentApprovalSchema
      .partial()
      .parse(await c.req.json().catch(() => ({})));
    return ok(
      c,
      await agentService!.respondToSuggestion(
        c.req.param("tripId")!,
        c.get("user")!.id,
        {
          id: body.id ?? c.req.param("suggestionId"),
          approved: false,
          reason: body.reason,
        },
      ),
    );
  });

  guard.route("/trips/:tripId/agent", agent);

  app.route("/api", guard);

  app.onError(handleError);
  return app;
}

function decodeStoragePath(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}
