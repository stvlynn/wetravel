import type { AgentMessagePart } from "../../domain/agent";
import type { Trip } from "../../domain/trip";

export const AGENT_MENTION_TOKEN = "agent";

/** Escape a member display name for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve `@MemberName` tokens in free text to Better Auth user ids for trip
 * members other than the author. Names are matched longest-first so
 * `@Steven Smith` wins over `@Steven` when both exist.
 */
export function parseMemberMentions(
  text: string,
  trip: Trip,
  actorUserId: string,
): string[] {
  const members = trip
    .toSnapshot()
    .members.filter(
      (m) => m.userId && m.userId !== actorUserId && m.name.trim().length > 0,
    )
    .sort((a, b) => b.name.length - a.name.length);

  const mentioned = new Set<string>();
  for (const member of members) {
    const pattern = new RegExp(
      `@${escapeRegExp(member.name)}(?=\\s|$|[.,!?;:])`,
      "i",
    );
    if (pattern.test(text) && member.userId) {
      mentioned.add(member.userId);
    }
  }
  return [...mentioned];
}

export function containsAgentMention(text: string): boolean {
  return new RegExp(`@${AGENT_MENTION_TOKEN}\\b`, "i").test(text);
}

/** Build persisted parts for a user-authored chat line (text + optional mentions). */
export function buildUserMessageParts(
  text: string,
  trip: Trip,
  actorUserId: string,
): AgentMessagePart[] {
  const parts: AgentMessagePart[] = [{ type: "text", text }];
  const userIds = parseMemberMentions(text, trip, actorUserId);
  if (userIds.length > 0) {
    parts.push({ type: "mentions", userIds });
  }
  return parts;
}

export function mentionedUserIdsFromParts(
  parts: AgentMessagePart[],
): string[] {
  const block = parts.find(
    (p): p is { type: "mentions"; userIds: string[] } =>
      p.type === "mentions" && Array.isArray((p as { userIds?: unknown }).userIds),
  );
  return block?.userIds ?? [];
}
