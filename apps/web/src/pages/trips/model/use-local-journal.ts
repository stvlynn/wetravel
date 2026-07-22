import { useCallback, useEffect, useState } from "react";
import {
  journalStorageKey,
  parseLocalJournalEntries,
  serializeLocalJournalEntries,
  type JournalVisibility,
  type JournalAttachment,
  type JournalStatus,
  type LocalJournalEntry,
} from "./local-journal";

export interface NewLocalJournalEntry {
  title: string;
  body: string;
  tripId: string | null;
  visibility: JournalVisibility;
  status: JournalStatus;
  attachments: JournalAttachment[];
}

export interface UpdateLocalJournalEntry extends NewLocalJournalEntry {
  id: string;
}

export function useLocalJournal(userId: string | undefined) {
  const [entries, setEntries] = useState<LocalJournalEntry[]>([]);
  const [hydratedUserId, setHydratedUserId] = useState<string | undefined>();

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setHydratedUserId(undefined);
      return;
    }

    setEntries(
      parseLocalJournalEntries(
        localStorage.getItem(journalStorageKey(userId)),
      ),
    );
    setHydratedUserId(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || hydratedUserId !== userId) return;
    localStorage.setItem(
      journalStorageKey(userId),
      serializeLocalJournalEntries(entries),
    );
  }, [entries, hydratedUserId, userId]);

  const addEntry = useCallback((input: NewLocalJournalEntry) => {
    const now = new Date().toISOString();
    const entry: LocalJournalEntry = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      body: input.body.trim(),
      occurredAt: now,
      updatedAt: now,
      publishedAt: input.status === "published" ? now : null,
      tripId: input.tripId,
      visibility: input.visibility,
      status: input.status,
      attachments: input.attachments,
    };

    setEntries((current) => [entry, ...current]);
    return entry;
  }, []);

  const updateEntry = useCallback((input: UpdateLocalJournalEntry) => {
    const updatedAt = new Date().toISOString();
    setEntries((current) =>
      current.map((entry) =>
        entry.id === input.id
          ? {
              ...entry,
              title: input.title.trim(),
              body: input.body.trim(),
              tripId: input.tripId,
              visibility: input.visibility,
              status: input.status,
              publishedAt:
                input.status === "published"
                  ? entry.publishedAt ?? updatedAt
                  : null,
              attachments: input.attachments,
              updatedAt,
            }
          : entry,
      ),
    );
  }, []);

  const deleteEntry = useCallback((entryId: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  }, []);

  return { entries, addEntry, updateEntry, deleteEntry };
}
