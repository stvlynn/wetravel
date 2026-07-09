import { useEffect, useRef } from "react";
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
}

export interface MarkdownEditorApi {
  getMarkdown: () => string;
}

function MarkdownEditorInner({
  defaultValue = "",
  placeholder,
  className,
  onChange,
  onReady,
  onUploadImage,
  onImageError,
}: MarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const onUploadImageRef = useRef(onUploadImage);
  const onImageErrorRef = useRef(onImageError);
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
    <div className={cn("wf-markdown-editor flex min-h-0 flex-col", className)}>
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
