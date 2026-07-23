import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  FileTextIcon,
  LoaderCircleIcon,
  LockIcon,
  PaperclipIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import type { TripSummary } from "@/entities/trip";
import { ApiError, uploadTripMedia } from "@/shared/api";
import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPortal,
  DialogSheetPopup,
  DialogSheetViewport,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  MarkdownEditor,
  NoteImageUploadError,
  type MarkdownEditorApi,
} from "@/shared/ui/markdown-editor";
import { toastManager } from "@/shared/ui/toast";
import type {
  JournalAttachment,
  JournalStatus,
  JournalVisibility,
  LocalJournalEntry,
} from "../model/local-journal";
import type { NewLocalJournalEntry } from "../model/use-local-journal";

interface JournalComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trips: TripSummary[];
  preferredTripId?: string;
  initialTitle?: string;
  entry?: LocalJournalEntry | null;
  onSave: (input: NewLocalJournalEntry) => LocalJournalEntry;
  onUpdate: (input: NewLocalJournalEntry & { id: string }) => void;
}

const ATTACHMENT_ACCEPT =
  "application/pdf,text/plain,text/markdown,text/csv,.md,.csv,.txt,.pdf";

export function JournalComposerDialog({
  open,
  onOpenChange,
  trips,
  preferredTripId,
  initialTitle,
  entry,
  onSave,
  onUpdate,
}: JournalComposerDialogProps) {
  const { t } = useTranslation("trips");
  const { t: tc } = useTranslation("common");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tripId, setTripId] = useState("");
  const [visibility, setVisibility] = useState<JournalVisibility>("private");
  const [attachments, setAttachments] = useState<JournalAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const editorApiRef = useRef<MarkdownEditorApi | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(entry?.title ?? initialTitle ?? "");
    setBody(entry?.body ?? "");
    setTripId(entry?.tripId ?? preferredTripId ?? "");
    setVisibility(entry?.visibility ?? "private");
    setAttachments(entry?.attachments ?? []);
  }, [entry, initialTitle, open, preferredTripId]);

  const readMarkdown = () =>
    (editorApiRef.current?.getMarkdown() ?? body).trim();

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const markdown = readMarkdown();
    if (!markdown || uploading) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const status =
      submitter instanceof HTMLButtonElement
        ? (submitter.dataset.status as JournalStatus | undefined)
        : undefined;
    const nextStatus = status ?? entry?.status ?? "draft";
    const input: NewLocalJournalEntry = {
      title,
      body: markdown,
      tripId: tripId || null,
      visibility,
      status: nextStatus,
      attachments,
    };
    if (entry) onUpdate({ ...input, id: entry.id });
    else onSave(input);
    onOpenChange(false);
  }

  const requireTrip = () => {
    if (tripId) return tripId;
    toastManager.add({
      title: t("journal.composer.mediaNeedsTrip"),
      type: "error",
    });
    throw new Error("journal_media_requires_trip");
  };

  const reportUploadError = (error: unknown) => {
    if (error instanceof Error && error.message === "journal_media_requires_trip") {
      return;
    }
    const code =
      error instanceof NoteImageUploadError || error instanceof ApiError
        ? error.code
        : "media_upload_failed";
    toastManager.add({
      title:
        code === "media_too_large" || code === "note_image_too_large"
          ? t("journal.composer.mediaTooLarge")
          : code === "media_unsupported_mime" ||
              code === "note_image_unsupported"
            ? t("journal.composer.mediaUnsupported")
            : t("journal.composer.mediaUploadFailed"),
      type: "error",
    });
  };

  async function uploadAttachments(files: File[]) {
    if (!files.length) return;
    let ownerTripId: string;
    try {
      ownerTripId = requireTrip();
    } catch {
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        files.map(async (file): Promise<JournalAttachment> => ({
          id: crypto.randomUUID(),
          name: file.name,
          url: await uploadTripMedia(ownerTripId, file),
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        })),
      );
      setAttachments((current) => [...current, ...uploaded]);
      toastManager.add({
        title: t("journal.composer.filesAttached", { count: uploaded.length }),
        type: "success",
      });
    } catch (error) {
      reportUploadError(error);
    } finally {
      setUploading(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm transition-[opacity] duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogSheetViewport>
          <DialogSheetPopup
            size="lg"
            className="max-md:h-dvh max-md:max-h-dvh max-md:rounded-none"
          >
            <DialogHeader className="pt-[max(1rem,env(safe-area-inset-top))] md:pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-xl font-semibold tracking-tight text-balance">
                    {t(entry ? "journal.composer.editTitle" : "journal.composer.title")}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-pretty text-muted-foreground">
                    {t("journal.composer.description")}
                  </DialogDescription>
                </div>
                <DialogClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-2 flex-none"
                      aria-label={tc("actions.close")}
                    />
                  }
                >
                  <XIcon className="size-5" aria-hidden="true" />
                </DialogClose>
              </div>
            </DialogHeader>

            <form className="contents" onSubmit={handleSave}>
              <DialogPanel className="flex min-h-0 flex-col px-5 py-0 md:px-7">
                <div className="flex min-h-[25rem] flex-1 flex-col py-3 md:min-h-[30rem] md:py-5">
                  <Field className="gap-0">
                    <FieldLabel htmlFor="journal-title" className="sr-only">
                      {t("journal.composer.titleLabel")}
                    </FieldLabel>
                    <Input
                      id="journal-title"
                      name="title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={t("journal.composer.titlePlaceholder")}
                      className="h-auto border-0 bg-transparent px-1 py-2 font-heading text-2xl font-semibold leading-tight tracking-tight shadow-none placeholder:font-normal hover:bg-transparent focus:bg-transparent md:text-3xl"
                    />
                  </Field>

                  <div className="mt-3 min-h-72 flex-1 overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-border)]">
                    <MarkdownEditor
                      key={`${entry?.id ?? "new"}:${open ? "open" : "closed"}`}
                      defaultValue={entry?.body ?? ""}
                      placeholder={t("journal.composer.bodyPlaceholder")}
                      className="h-full min-h-72"
                      onChange={setBody}
                      onReady={(api) => {
                        editorApiRef.current = api;
                      }}
                      onUploadImage={(file) =>
                        uploadTripMedia(requireTrip(), file)
                      }
                      onImageError={reportUploadError}
                      onPasteFiles={(files) => void uploadAttachments(files)}
                      mapMenuLabel={t("journal.composer.mapMenuLabel")}
                      mapBlockLabel={t("journal.composer.mapBlockLabel")}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      accept={ATTACHMENT_ACCEPT}
                      className="sr-only"
                      onChange={(event) =>
                        void uploadAttachments(Array.from(event.target.files ?? []))
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      {uploading ? (
                        <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                      ) : (
                        <PaperclipIcon aria-hidden="true" />
                      )}
                      {t("journal.composer.attachFile")}
                    </Button>
                    <span className="text-xs leading-5 text-muted-foreground">
                      {t("journal.composer.pasteHint")}
                    </span>
                  </div>

                  {attachments.length ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {attachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex min-w-0 items-center gap-2 rounded-xl bg-secondary px-3 py-2"
                        >
                          <FileTextIcon className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {attachment.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 flex-none"
                            onClick={() =>
                              setAttachments((current) =>
                                current.filter((item) => item.id !== attachment.id),
                              )
                            }
                            aria-label={t("journal.composer.removeAttachment", {
                              name: attachment.name,
                            })}
                          >
                            <Trash2Icon className="size-4" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="mb-5 grid gap-5 rounded-2xl bg-muted/35 p-4 shadow-[var(--shadow-border)] md:grid-cols-2 md:p-5">
                  <Field className="gap-2">
                    <FieldLabel htmlFor="journal-trip" className="text-xs text-muted-foreground">
                      {t("journal.composer.tripLabel")}
                    </FieldLabel>
                    <Select
                      value={tripId}
                      onValueChange={(value) => {
                        const nextTripId = value ? String(value) : "";
                        setTripId(nextTripId);
                        if (!nextTripId) setVisibility("private");
                      }}
                    >
                      <SelectTrigger id="journal-trip" className="h-11">
                        <SelectValue>
                          {(selected: string | null) =>
                            selected
                              ? (trips.find((trip) => trip.id === selected)
                                  ?.title ?? t("journal.composer.noTrip"))
                              : t("journal.composer.noTrip")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="">
                          {t("journal.composer.noTrip")}
                        </SelectItem>
                        {trips.map((trip) => (
                          <SelectItem key={trip.id} value={trip.id}>
                            {trip.title}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </Field>

                  <fieldset className="flex min-w-0 flex-col gap-2">
                    <legend className="text-xs font-medium text-muted-foreground">
                      {t("journal.composer.visibilityLabel")}
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(["private", "trip"] as const).map((value) => {
                        const Icon = value === "private" ? LockIcon : UsersIcon;
                        const selected = visibility === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            disabled={value === "trip" && !tripId}
                            onClick={() => setVisibility(value)}
                            className={cn(
                              "wf-interactive wf-pressable flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl text-sm font-medium shadow-[var(--shadow-border)] disabled:cursor-not-allowed disabled:opacity-45",
                              selected
                                ? "bg-brand-muted text-corn-700"
                                : "bg-card text-muted-foreground hover:bg-accent",
                            )}
                          >
                            <Icon className="size-4 flex-none" aria-hidden="true" />
                            <span className="truncate">{t(`journal.visibility.${value}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <p className="text-pretty text-xs leading-5 text-muted-foreground md:col-span-2 md:max-w-2xl">
                    {t("journal.composer.statusNotice")}
                  </p>
                </div>
              </DialogPanel>

              <DialogFooter className="pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6">
                <DialogClose render={<Button type="button" variant="ghost" />}>
                  {tc("actions.cancel")}
                </DialogClose>
                <Button
                  type="submit"
                  variant="outline"
                  data-status="draft"
                  disabled={!body.trim() || uploading}
                >
                  {entry?.status === "published"
                    ? t("journal.composer.unpublish")
                    : t("journal.composer.saveDraft")}
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  data-status="published"
                  disabled={!body.trim() || uploading}
                >
                  {entry?.status === "published"
                    ? t("journal.composer.updatePublished")
                    : t("journal.composer.publish")}
                </Button>
              </DialogFooter>
            </form>
          </DialogSheetPopup>
        </DialogSheetViewport>
      </DialogPortal>
    </Dialog>
  );
}
