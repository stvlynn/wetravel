export type JournalVisibility = "private" | "trip";
export type JournalStatus = "draft" | "published";

export interface JournalAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface LocalJournalEntry {
  id: string;
  title: string;
  body: string;
  occurredAt: string;
  updatedAt: string;
  publishedAt: string | null;
  tripId: string | null;
  visibility: JournalVisibility;
  status: JournalStatus;
  attachments: JournalAttachment[];
}

interface LocalJournalDocument {
  version: 1;
  entries: LocalJournalEntry[];
}

const STORAGE_PREFIX = "opentrip.journal-preview.v1";

export function journalStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function parseLocalJournalEntries(
  value: string | null,
): LocalJournalEntry[] {
  if (!value) return [];

  try {
    const document = JSON.parse(value) as Partial<LocalJournalDocument>;
    if (document.version !== 1 || !Array.isArray(document.entries)) return [];

    return document.entries
      .filter(isLegacyJournalEntry)
      .map(normalizeJournalEntry)
      .sort(
        (left, right) =>
          Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
      );
  } catch {
    return [];
  }
}

export function serializeLocalJournalEntries(
  entries: LocalJournalEntry[],
): string {
  const document: LocalJournalDocument = { version: 1, entries };
  return JSON.stringify(document);
}

type LegacyJournalEntry = Omit<
  LocalJournalEntry,
  "status" | "publishedAt" | "attachments"
> &
  Partial<Pick<LocalJournalEntry, "status" | "publishedAt" | "attachments">>;

function isLegacyJournalEntry(value: unknown): value is LegacyJournalEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;

  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.body === "string" &&
    typeof entry.occurredAt === "string" &&
    typeof entry.updatedAt === "string" &&
    (entry.tripId === null || typeof entry.tripId === "string") &&
    (entry.visibility === "private" || entry.visibility === "trip") &&
    (entry.status === undefined ||
      entry.status === "draft" ||
      entry.status === "published") &&
    (entry.attachments === undefined || Array.isArray(entry.attachments))
  );
}

function normalizeJournalEntry(entry: LegacyJournalEntry): LocalJournalEntry {
  return {
    ...entry,
    status: entry.status ?? "draft",
    publishedAt: entry.publishedAt ?? null,
    attachments: (entry.attachments ?? []).filter(isJournalAttachment),
  };
}

function isJournalAttachment(value: unknown): value is JournalAttachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Record<string, unknown>;
  return (
    typeof attachment.id === "string" &&
    typeof attachment.name === "string" &&
    typeof attachment.url === "string" &&
    typeof attachment.mimeType === "string" &&
    typeof attachment.size === "number"
  );
}
