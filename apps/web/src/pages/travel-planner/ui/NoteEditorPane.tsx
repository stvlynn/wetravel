import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError, uploadTripMedia } from "@/shared/api";
import { cn, interactive } from "@/shared/lib";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import {
  MarkdownEditor,
  NoteImageUploadError,
  type MarkdownEditorApi,
} from "@/shared/ui/markdown-editor";
import { toastManager } from "@/shared/ui/toast";

export interface NoteEditorPaneProps {
  tripId: string;
  /** Stored Markdown for the stop being edited. */
  value: string;
  placeholder: string;
  /** Remount key — typically the stop id so switching stops resets the editor. */
  editorKey: string;
  onCommit: (next: string) => void;
  onClose: () => void;
}

/** Full main-pane Crepe editor that replaces map/schedule/budget while open. */
export function NoteEditorPane({
  tripId,
  value,
  placeholder,
  editorKey,
  onCommit,
  onClose,
}: NoteEditorPaneProps) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const editorApiRef = useRef<MarkdownEditorApi | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value, editorKey]);

  const readMarkdown = () =>
    (editorApiRef.current?.getMarkdown() ?? draft).trim();

  const isDirty = () => readMarkdown() !== value.trim();

  const discardAndClose = () => {
    setConfirmOpen(false);
    onClose();
  };

  const saveAndClose = () => {
    const next = readMarkdown();
    setConfirmOpen(false);
    if (next !== value) onCommit(next);
    onClose();
  };

  const requestClose = () => {
    if (isDirty()) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  };

  const toastImageError = (error: unknown) => {
    const code =
      error instanceof NoteImageUploadError
        ? error.code
        : error instanceof ApiError
          ? error.code
          : "media_upload_failed";
    const title =
      code === "note_image_unsupported" || code === "media_unsupported_mime"
        ? t("detail.noteImageUnsupported")
        : code === "note_image_too_large" || code === "media_too_large"
          ? t("detail.noteImageTooLarge")
          : t("detail.noteImageUploadFailed");
    toastManager.add({ title, type: "error" });
  };

  return (
    <div className="relative flex size-full min-h-0 flex-col bg-background">
      <h2 className="sr-only">{t("detail.noteEditorTitle")}</h2>
      <p className="sr-only">{t("detail.noteEditorDescription")}</p>

      <button
        type="button"
        onClick={requestClose}
        className={cn(
          "absolute right-1.5 top-1.5 z-20 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground",
          interactive,
        )}
      >
        <X aria-hidden="true" className="size-5" />
        <span className="sr-only">{tc("actions.close")}</span>
      </button>

      <MarkdownEditor
        key={editorKey}
        defaultValue={value}
        placeholder={placeholder}
        className="min-h-0 flex-1"
        onChange={setDraft}
        onReady={(api) => {
          editorApiRef.current = api;
        }}
        onUploadImage={(file) => uploadTripMedia(tripId, file)}
        onImageError={toastImageError}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance font-heading text-xl font-semibold text-foreground">
              {t("detail.noteCloseConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty text-sm text-muted-foreground">
              {t("detail.noteCloseConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button type="button" variant="ghost" size="sm" />}
              onClick={discardAndClose}
            >
              {t("detail.noteCloseDiscard")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button type="button" variant="primary" size="sm" />}
              onClick={saveAndClose}
            >
              {t("detail.noteCloseSave")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
