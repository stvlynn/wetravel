/** Client-side gate before uploading a note image (mirrors server 2 MiB). */
export const MAX_NOTE_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class NoteImageUploadError extends Error {
  constructor(public readonly code: "note_image_too_large" | "note_image_unsupported") {
    super(code);
    this.name = "NoteImageUploadError";
  }
}

/** Validate a local file before POSTing it as trip media. */
export function assertNoteImageFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new NoteImageUploadError("note_image_unsupported");
  }
  if (file.size > MAX_NOTE_IMAGE_BYTES) {
    throw new NoteImageUploadError("note_image_too_large");
  }
}
