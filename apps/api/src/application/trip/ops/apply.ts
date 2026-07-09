import type { PendingPatch } from "../../../domain/agent";
import { getTripOp, type TripOpContext } from "./catalog";

export type TripOpApplyResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

/**
 * Apply a PendingPatch through the trip ops catalog (domain + repository).
 * Used by agent tool execute and proactive suggestion approve.
 */
export async function applyTripOp(
  ctx: TripOpContext,
  patch: PendingPatch,
): Promise<TripOpApplyResult> {
  const op = getTripOp(patch.kind);
  if (!op) {
    return { ok: false, error: `Unknown trip operation: ${patch.kind}` };
  }
  try {
    // Catalog apply is typed per-kind; patch is the matching branch at runtime.
    const summary = await (op.apply as (
      c: TripOpContext,
      p: PendingPatch,
    ) => Promise<string>)(ctx, patch);
    return { ok: true, summary };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to apply trip change";
    return { ok: false, error: message };
  }
}
