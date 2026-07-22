import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { initiatingAgentTurnId, type Defer } from "../../application";
import type { OperationEvent } from "../../domain/agent";
import { MAX_AVATAR_BYTES } from "../../application/avatar";
import { MAX_TRIP_MEDIA_BYTES } from "../../application/media";
import { isManagedUploadPath } from "../../application/storage";
import { deliverableEmail } from "../../application/user/email-address";
import {
  dayNumberParamSchema,
  expenseDraftSchema,
  insertStopSchema,
  moveStopBodySchema,
  reorderDaysSchema,
  updateDaySchema,
  updateStopChangesSchema,
} from "../../application/trip/ops";
import { BetterAuthCurrentUserProfile } from "../../infrastructure/auth/current-user-profile";
import type { Container } from "../../infrastructure/composition/container";
import { handleError } from "./errors";
import { ok, fail } from "./response";
import {
  captureException,
  getTraceIds,
  logger,
  setActiveSpanAttributes,
} from "../../infrastructure/observability";
import type { RuntimeName } from "../../application/observability";

type Session = Container["auth"]["$Infer"]["Session"];

export interface AppEnv {
  Variables: {
    user: Session["user"] | null;
    session: Session["session"] | null;
    requestId: string;
    agentContext?: { tripId: string; turnId: string };
  };
}

interface CreateAppOptions {
  runtime: RuntimeName;
  instrument?: (app: Hono<AppEnv>) => void;
  setRequestContext?: (fields: { requestId: string }) => void;
}

/** Trip-scoped mutation schemas come from the trip ops registry. */
const moveStopSchema = moveStopBodySchema;
const updateStopSchema = updateStopChangesSchema;
const expenseSchema = expenseDraftSchema;
const dayNumberSchema = dayNumberParamSchema;

const commentSchema = z.object({ text: z.string().min(1) });

const reservationTypeSchema = z.enum([
  "flight",
  "accommodation",
  "restaurant",
  "rail",
  "ground_transport",
  "activity",
  "other",
]);
const reservationStatusSchema = z.enum([
  "tentative",
  "confirmed",
  "cancelled",
  "completed",
]);
const reservationDraftSchema = z.object({
  type: reservationTypeSchema,
  status: reservationStatusSchema.optional(),
  title: z.string().trim().min(1).max(160),
  provider: z.string().max(160).optional(),
  confirmationNumber: z.string().max(160).optional(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().trim().min(1).max(100),
  locationName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  dayNumber: z.number().int().min(1).nullable().optional(),
  stopId: z.string().max(120).nullable().optional(),
  expenseId: z.string().max(120).nullable().optional(),
  amountMinor: z.number().int().min(0).nullable().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
  notes: z.string().max(10_000).optional(),
});
const updateReservationSchema = reservationDraftSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one reservation field is required",
  });

const mobileOAuthStartQuerySchema = z.object({
  provider: z.literal("google"),
});

const mobileOAuthExchangeSchema = z.object({
  code: z.string().min(16).max(512),
});

const webviewExchangeSchema = mobileOAuthExchangeSchema;

const createTripSchema = z.object({
  title: z.string().trim().min(1).max(120),
  currency: z.string().trim().min(1).max(8).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dayCount: z.number().int().min(1).max(60).optional(),
  destination: z.string().trim().min(1).max(120).optional(),
  budgetAmount: z.number().positive().max(1_000_000_000).optional(),
  partySize: z.number().int().min(1).max(100).optional(),
});

const patchTripSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    clearAgentSeedPending: z.literal(true).optional(),
  })
  .refine((v) => v.title != null || v.clearAgentSeedPending === true, {
    message: "title or clearAgentSeedPending is required",
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

const agentFilePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().min(1).max(100),
  url: z.string().min(1).max(2_000),
  filename: z.string().max(255).optional(),
});

const agentPostMessageSchema = z
  .object({
    text: z.string().trim().max(4_000).optional(),
    files: z.array(agentFilePartSchema).max(8).optional(),
  })
  .refine(
    (v) => Boolean(v.text?.trim()) || (v.files?.length ?? 0) > 0,
    { message: "Message text or attachment is required" },
  );

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
const streetViewSearchQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(1).max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const streetViewImageIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);

export function createApp(
  container: Container,
  options: CreateAppOptions = { runtime: "node" },
) {
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
    reservationService,
    streetViewService,
  } = container;

  /** Schedule work past the response: waitUntil on Workers, floating on Node.
   * Also track on the container so Workers disposeAfterDeferred waits for it
   * before pool.end(). */
  const deferOf = (c: Context<AppEnv>): Defer => (task) => {
    const guarded = task.catch((err) =>
      {
        logger.error("agent.deferred_task_failed", {
          runtime: options.runtime,
          requestId: c.get("requestId"),
          error: err,
        });
        captureException(err, {
          runtime: options.runtime,
          requestId: c.get("requestId"),
        });
      },
    );
    container.trackDeferred(guarded);
    try {
      c.executionCtx.waitUntil(guarded);
    } catch {
      // Node runtime has no execution context; the floating promise is enough.
    }
  };

  /** Record a whitelisted write operation in the agent session without
   * blocking or failing the originating request. */
  const notifyAgent = (
    c: Context<AppEnv>,
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
        { requestId: c.get("requestId"), runtime: options.runtime },
      ),
    );
  };

  const inviteActor = (u: Session["user"]) => ({
    id: u.id,
    name: u.name || u.email,
    email: deliverableEmail(u),
    image: u.image ?? null,
  });
  const app = new Hono<AppEnv>();
  options.instrument?.(app);

  app.use("*", async (c, next) => {
    const incoming = c.req.header("x-request-id")?.trim();
    const requestId =
      incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();
    const startedAt = Date.now();
    c.set("requestId", requestId);
    setActiveSpanAttributes({ requestId, runtime: options.runtime });
    options.setRequestContext?.({ requestId });
    try {
      await next();
    } finally {
      // Dynamic API responses are private by default. This is a second safety
      // boundary behind the disabled Worker entrypoint cache and also protects
      // browsers and intermediary proxies. Routes serving intentionally public
      // immutable bytes set their own Cache-Control header explicitly.
      if (!c.res.headers.has("Cache-Control")) {
        c.header("Cache-Control", "private, no-store");
      }
      c.header("x-request-id", requestId);
      logger.info("http.request.completed", {
        runtime: options.runtime,
        requestId,
        method: c.req.method,
        route: c.req.routePath || c.req.path,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
        ...c.get("agentContext"),
        ...getTraceIds(),
      });
      if (c.res.status >= 400 && c.res.status < 500) {
        logger.warn("http.request.rejected", {
          runtime: options.runtime,
          requestId,
          method: c.req.method,
          route: c.req.routePath || c.req.path,
          status: c.res.status,
        });
      }
    }
  });

  app.use(
    "*",
    cors({
      origin: config.trustedOrigins,
      credentials: true,
      exposeHeaders: ["x-request-id", "x-agent-turn-id"],
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

  // Better Auth handler. Surface driver errors as JSON (Better Auth sometimes
  // returns empty 500s when the pool times out).
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    try {
      return await auth.handler(c.req.raw);
    } catch (err) {
      console.error("Better Auth handler error:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  });

  // Safety net: browsers that land on the API origin after OAuth (missing
  // callbackURL) hit `/` and used to see plain 404. Send them to the SPA.
  app.get("/", (c) => {
    const webOrigin =
      config.trustedOrigins.find(
        (origin) =>
          origin.startsWith("https://") &&
          origin !== config.betterAuthUrl &&
          !origin.includes("pages.dev"),
      ) ??
      config.trustedOrigins.find((origin) => origin.startsWith("https://"));
    if (webOrigin) return c.redirect(webOrigin.endsWith("/") ? webOrigin : `${webOrigin}/`);
    return c.text("OpenTrip API", 200);
  });

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

  app.post("/api/mobile-auth/webview/mint", async (c) => {
    const authorization = c.req.header("authorization");
    if (!authorization?.startsWith("Bearer ") || !c.get("session")) {
      return fail(c, "unauthorized", "Authentication required", 401);
    }
    const { token } = await auth.api.generateOneTimeToken({
      headers: c.req.raw.headers,
    });
    return ok(c, { code: token });
  });

  app.post("/api/mobile-auth/webview/exchange", async (c) => {
    const { code } = webviewExchangeSchema.parse(await c.req.json());
    const verified = await auth.api.verifyOneTimeToken({
      body: { token: code },
      asResponse: true,
    });
    if (!verified.ok) {
      return fail(
        c,
        "webview_code_invalid",
        "WebView sign-in code is invalid or expired",
        401,
      );
    }
    const session = await verified.json();
    const result = ok(c, { session });
    for (const cookie of verified.headers.getSetCookie()) {
      result.headers.append("Set-Cookie", cookie);
    }
    return result;
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
  const guard = new Hono<AppEnv>();
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

  guard.get("/trips/:tripId/street-view/images", async (c) => {
    if (!streetViewService) {
      return fail(c, "street_view_not_configured", "Street view is not configured", 404);
    }
    const tripId = c.req.param("tripId");
    await tripService.assertReadable(tripId, c.get("user")!.id);
    const query = streetViewSearchQuerySchema.parse(c.req.query());
    return ok(
      c,
      await streetViewService.searchNearby({
        tripId,
        ...query,
        observability: {
          requestId: c.get("requestId"),
          runtime: options.runtime,
        },
      }),
    );
  });

  guard.get("/trips/:tripId/street-view/images/:imageId", async (c) => {
    if (!streetViewService) {
      return fail(c, "street_view_not_configured", "Street view is not configured", 404);
    }
    const tripId = c.req.param("tripId");
    await tripService.assertReadable(tripId, c.get("user")!.id);
    const imageId = streetViewImageIdSchema.parse(c.req.param("imageId"));
    return ok(
      c,
      await streetViewService.getImage(tripId, imageId, {
        requestId: c.get("requestId"),
        runtime: options.runtime,
      }),
    );
  });

  guard.get("/trips/:tripId/street-view/images/:imageId/preview", async (c) => {
    if (!streetViewService) {
      return fail(c, "street_view_not_configured", "Street view is not configured", 404);
    }
    const tripId = c.req.param("tripId");
    await tripService.assertReadable(tripId, c.get("user")!.id);
    const imageId = streetViewImageIdSchema.parse(c.req.param("imageId"));
    const preview = await streetViewService.readPreview(imageId, {
      requestId: c.get("requestId"),
      runtime: options.runtime,
    });
    return new Response(preview.bytes, {
      headers: {
        "Content-Type": preview.mediaType,
        "Cache-Control": "private, max-age=900",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  guard.get("/trips/:tripId/street-view/viewer-config", async (c) => {
    if (!streetViewService) {
      return fail(c, "street_view_not_configured", "Street view is not configured", 404);
    }
    await tripService.assertReadable(c.req.param("tripId"), c.get("user")!.id);
    return ok(c, streetViewService.getViewerConfig());
  });

  guard.patch("/trips/:id", async (c) => {
    const body = patchTripSchema.parse(await c.req.json());
    const userId = c.get("user")!.id;
    const tripId = c.req.param("id");
    if (body.clearAgentSeedPending) {
      return ok(c, await tripService.clearAgentSeedPending(tripId, userId));
    }
    return ok(c, await tripService.renameTrip(tripId, body.title!, userId));
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
      onError: (c) => fail(c, "media_too_large", "File request is too large", 413),
    }),
    async (c) => {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) {
        return fail(c, "media_missing", "File is required", 400);
      }
      const url = await tripMediaService.upload(
        c.req.param("id"),
        c.get("user")!.id,
        {
          content: new Uint8Array(await file.arrayBuffer()),
          claimedMimeType: file.type,
          filename: file.name,
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
    // Mirror @member / @agent mentions into the shared agent session so the
    // existing mention-toast poll path fires. Ambient reply only for @agent.
    if (agentService) {
      const stopName = dto.stops.find((s) => s.id === stopId)?.name ?? stopId;
      const defer = deferOf(c);
      defer(
        agentService.recordStopComment(
          dto.id,
          user.id,
          `(commenting on stop "${stopName}") ${text}`,
          stopId,
          defer,
          { requestId: c.get("requestId"), runtime: options.runtime },
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

  guard.get("/trips/:id/reservations", async (c) =>
    ok(
      c,
      await reservationService.list(
        c.req.param("id"),
        c.get("user")!.id,
      ),
    ),
  );

  guard.post("/trips/:id/reservations", async (c) => {
    const idempotencyKey = c.req.header("Idempotency-Key") ?? "";
    if (!idempotencyKey.trim()) {
      return fail(
        c,
        "idempotency_key_required",
        "Idempotency-Key header is required",
        400,
      );
    }
    const input = reservationDraftSchema.parse(await c.req.json());
    return ok(
      c,
      await reservationService.create(
        c.req.param("id"),
        c.get("user")!.id,
        input,
        idempotencyKey,
      ),
      201,
    );
  });

  guard.patch("/trips/:id/reservations/:reservationId", async (c) => {
    const revision = parseRevisionHeader(c.req.header("If-Match"));
    if (revision == null) {
      return fail(c, "revision_required", "A numeric If-Match header is required", 428);
    }
    const input = updateReservationSchema.parse(await c.req.json());
    return ok(
      c,
      await reservationService.update(
        c.req.param("id"),
        c.req.param("reservationId"),
        c.get("user")!.id,
        revision,
        input,
      ),
    );
  });

  guard.post("/trips/:id/reservations/:reservationId/cancel", async (c) => {
    const revision = parseRevisionHeader(c.req.header("If-Match"));
    if (revision == null) {
      return fail(c, "revision_required", "A numeric If-Match header is required", 428);
    }
    return ok(
      c,
      await reservationService.cancel(
        c.req.param("id"),
        c.req.param("reservationId"),
        c.get("user")!.id,
        revision,
      ),
    );
  });

  guard.delete("/trips/:id/reservations/:reservationId", async (c) => {
    const revision = parseRevisionHeader(c.req.header("If-Match"));
    if (revision == null) {
      return fail(c, "revision_required", "A numeric If-Match header is required", 428);
    }
    await reservationService.delete(
      c.req.param("id"),
      c.req.param("reservationId"),
      c.get("user")!.id,
      revision,
    );
    return ok(c, { deleted: true });
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
  const agent = new Hono<AppEnv>();
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
    const body = agentPostMessageSchema.parse(await c.req.json());
    return ok(
      c,
      await agentService!.postMessage(
        c.req.param("tripId")!,
        c.get("user")!.id,
        {
          text: body.text,
          files: body.files,
          observability: {
            requestId: c.get("requestId"),
            runtime: options.runtime,
          },
        },
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
    // Attachment-only turns still need the client id for history dedupe.
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
        const hasFile = m.parts.some((p) => p.type === "file");
        if (joined || hasFile) {
          text = joined || null;
          clientMessageId = m.id;
          break;
        }
      }
    }

    const tripId = c.req.param("tripId")!;
    const turnId = initiatingAgentTurnId(clientMessages, clientMessageId);
    c.set("agentContext", { tripId, turnId });
    c.header("x-agent-turn-id", turnId);

    // Streaming response: returned as-is, outside the { data } envelope.
    // Pass defer so onFinish persistence outlives the Response return and
    // Workers do not pool.end() before the assistant row is written.
    const response = await agentService!.streamChat(
      tripId,
      c.get("user")!.id,
      {
        text,
        clientMessageId,
        clientMessages,
        approvalContinue: hasApprovalResponse,
        requestId: c.get("requestId"),
        runtime: options.runtime,
        turnId,
      },
      deferOf(c),
    );
    response.headers.set("x-agent-turn-id", turnId);
    return response;
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

  app.onError((error, context) =>
    handleError(error, context, options.runtime),
  );
  return app;
}

function decodeStoragePath(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

function parseRevisionHeader(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const revision = Number(normalized);
  return Number.isSafeInteger(revision) ? revision : null;
}
