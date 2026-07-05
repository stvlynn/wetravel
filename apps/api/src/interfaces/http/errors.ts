import type { Context } from "hono";
import { ZodError } from "zod";
import { DomainError, NotFoundError } from "../../domain/shared/errors";
import { AvatarError } from "../../application/avatar";
import { fail } from "./response";

/** Translate thrown errors into the error envelope. Registered via app.onError. */
export function handleError(err: Error, c: Context) {
  if (err instanceof ZodError) {
    return fail(c, "validation_error", err.issues[0]?.message ?? "Invalid input", 400);
  }
  if (err instanceof DomainError) {
    return fail(c, err.code, err.message, 400);
  }
  if (err instanceof AvatarError) {
    const status =
      err.code === "avatar_too_large"
        ? 413
        : err.code === "avatar_unsupported_mime"
          ? 400
          : 500;
    return fail(c, err.code, err.message, status);
  }
  if (err instanceof NotFoundError) {
    return fail(c, err.code, err.message, 404);
  }
  console.error("Unhandled error:", err);
  return fail(c, "internal_error", "Something went wrong", 500);
}
