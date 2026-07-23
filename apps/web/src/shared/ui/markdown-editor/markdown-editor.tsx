import { useEffect, useRef, type ClipboardEvent } from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { cn } from "@/shared/lib";
import {
  NoteImageUploadError,
  assertNoteImageFile,
} from "./image-upload";
import "./markdown-editor.css";

export interface MarkdownEditorProps {
  /** Initial Markdown; the editor owns subsequent edits until remount. */
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  onChange?: (markdown: string) => void;
  onReady?: (api: MarkdownEditorApi) => void;
  /** Upload handler that returns a public image URL for Markdown embedding. */
  onUploadImage: (file: File) => Promise<string>;
  /** Called when an image cannot be uploaded. */
  onImageError?: (error: unknown) => void;
  /** Receives non-image files pasted into the editor as article attachments. */
  onPasteFiles?: (files: File[]) => void;
  /** Enables a travel-map slash command with localized editor copy. */
  mapMenuLabel?: string;
  mapBlockLabel?: string;
}

export interface MarkdownEditorApi {
  getMarkdown: () => string;
}

interface TextInsertionTransaction {
  insertText: (text: string, from?: number, to?: number) => TextInsertionTransaction;
  scrollIntoView: () => TextInsertionTransaction;
}

interface TextInsertionView {
  state: {
    selection: { from: number };
    tr: TextInsertionTransaction;
  };
  dispatch: (transaction: TextInsertionTransaction) => void;
  focus: () => void;
}

function MarkdownEditorInner({
  defaultValue = "",
  placeholder,
  className,
  onChange,
  onReady,
  onUploadImage,
  onImageError,
  onPasteFiles,
  mapMenuLabel,
  mapBlockLabel,
}: MarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const onUploadImageRef = useRef(onUploadImage);
  const onImageErrorRef = useRef(onImageError);
  const onPasteFilesRef = useRef(onPasteFiles);
  const crepeRef = useRef<Crepe | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onUploadImageRef.current = onUploadImage;
  }, [onUploadImage]);

  useEffect(() => {
    onImageErrorRef.current = onImageError;
  }, [onImageError]);

  useEffect(() => {
    onPasteFilesRef.current = onPasteFiles;
  }, [onPasteFiles]);

  const handlePasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files).filter(
      (file) => !file.type.startsWith("image/"),
    );
    if (!files.length || !onPasteFilesRef.current) return;
    event.preventDefault();
    onPasteFilesRef.current(files);
  };

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue,
      features: {
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.CodeMirror]: false,
        [Crepe.Feature.Table]: false,
        [Crepe.Feature.AI]: false,
        // Fixed chrome instead of the selection-floating toolbar.
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.TopBar]: true,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: placeholder ?? "",
          mode: "block",
        },
        [Crepe.Feature.TopBar]: {
          headingOptions: [
            { label: "Paragraph", level: null },
            { label: "Heading 1", level: 1 },
            { label: "Heading 2", level: 2 },
            { label: "Heading 3", level: 3 },
            { label: "Heading 4", level: 4 },
            { label: "Heading 5", level: 5 },
          ],
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: { h6: null },
          buildMenu: (builder) => {
            if (!mapMenuLabel || !mapBlockLabel) return;
            const quoteAction = builder
              .getGroup("text")
              .group.items.find((item) => item.key === "quote")?.onRun;
            builder.addGroup("travel", mapMenuLabel).addItem("map", {
              label: mapMenuLabel,
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></svg>',
              onRun: (ctx) => {
                quoteAction?.(ctx);
                const view = ctx.get<TextInsertionView, "editorView">(
                  "editorView",
                );
                const { from } = view.state.selection;
                view.dispatch(
                  view.state.tr
                    .insertText(`[!map] ${mapBlockLabel}`, from)
                    .scrollIntoView(),
                );
                view.focus();
              },
            });
          },
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file) => {
            try {
              assertNoteImageFile(file);
              return await onUploadImageRef.current(file);
            } catch (error) {
              onImageErrorRef.current?.(error);
              throw error instanceof NoteImageUploadError
                ? error
                : new NoteImageUploadError("note_image_too_large");
            }
          },
        },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current?.(markdown);
      });
    });

    crepeRef.current = crepe;
    onReadyRef.current?.({
      getMarkdown: () => crepe.getMarkdown(),
    });

    return crepe;
  }, []);

  useEffect(() => {
    return () => {
      crepeRef.current = null;
    };
  }, []);

  return (
    <div
      className={cn("wf-markdown-editor flex min-h-0 flex-col", className)}
      onPasteCapture={handlePasteCapture}
    >
      <Milkdown />
    </div>
  );
}

/** Milkdown Crepe WYSIWYG editor scoped for stop notes. */
export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MarkdownEditorInner {...props} />
    </MilkdownProvider>
  );
}
