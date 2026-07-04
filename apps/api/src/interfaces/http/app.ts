import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
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

const stopCategorySchema = z.enum([
  "Sight",
  "Food",
  "Stay",
  "Shopping",
  "Activity",
  "Walk",
  "Park",
  "Transit",
  "Plan",
]);

const insertStopSchema = z.object({
  day: z.number().int().positive(),
  index: z.number().int().min(0),
  name: z.string().min(1),
  time: z.string(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  area: z.string().max(120).optional(),
  category: stopCategorySchema.optional(),
  cost: z.number().min(0).max(100_000_000).optional(),
  costCurrency: z.string().trim().min(1).max(8).optional(),
  note: z.string().max(20_000).optional(),
});

const commentSchema = z.object({ text: z.string().min(1) });

const createTripSchema = z.object({
  title: z.string().trim().min(1).max(120),
  currency: z.string().trim().min(1).max(8).optional(),
});

const renameTripSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const expenseSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().trim().min(1).max(8).optional(),
  payer: z.string().min(1),
  participants: z.array(z.string().min(1)).min(1),
});

/** Build the Hono app for a wired container. Shared by the Node and Workers
 * entry points. */
export function createApp(container: Container) {
  const { auth, tripService, config } = container;
  const app = new Hono<Env>();

  app.use(
    "*",
    cors({
      origin: config.trustedOrigins,
      credentials: true,
    }),
  );

  // Resolve session for every request.
  app.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  });

  // Better Auth handler.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/health", (c) => ok(c, { status: "ok" }));

  // Everything below requires a session.
  const guard = new Hono<Env>();
  guard.use("*", async (c, next) => {
    if (!c.get("session")) return fail(c, "unauthenticated", "Sign in required", 401);
    await next();
  });

  guard.get("/trips", async (c) => ok(c, await tripService.listTrips()));

  guard.post("/trips", async (c) => {
    const user = c.get("user")!;
    const input = createTripSchema.parse(await c.req.json());
    const dto = await tripService.createTrip(input, {
      id: user.id,
      name: user.name || user.email,
    });
    return ok(c, dto, 201);
  });

  guard.get("/trips/:id", async (c) =>
    ok(c, await tripService.getTrip(c.req.param("id"))),
  );

  guard.patch("/trips/:id", async (c) => {
    const { title } = renameTripSchema.parse(await c.req.json());
    return ok(c, await tripService.renameTrip(c.req.param("id"), title));
  });

  guard.post("/trips/:id/days", async (c) =>
    ok(c, await tripService.addDay(c.req.param("id")), 201),
  );

  guard.post("/trips/:id/stops", async (c) => {
    const input = insertStopSchema.parse(await c.req.json());
    return ok(c, await tripService.insertStop(c.req.param("id"), input));
  });

  guard.post("/trips/:id/stops/:stopId/vote", async (c) =>
    ok(
      c,
      await tripService.toggleVote(c.req.param("id"), c.req.param("stopId")),
    ),
  );

  guard.post("/trips/:id/stops/:stopId/comments", async (c) => {
    const { text } = commentSchema.parse(await c.req.json());
    return ok(
      c,
      await tripService.addComment(c.req.param("id"), c.req.param("stopId"), text),
    );
  });

  guard.post("/trips/:id/expenses", async (c) => {
    const input = expenseSchema.parse(await c.req.json());
    return ok(c, await tripService.addExpense(c.req.param("id"), input));
  });

  app.route("/api", guard);

  app.onError(handleError);
  return app;
}
