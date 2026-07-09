import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  detectImageMimeType,
  extensionOf,
  storageNamespaceOf,
  type FileStorage,
  type StoredFile,
} from "../storage";
import type { TripService } from "../use-cases";

export interface TripMediaUpload {
  content: Uint8Array;
  claimedMimeType: string;
}

/** Stores trip note images through the shared FileStorage port. */
export class TripMediaService {
  constructor(
    private storage: FileStorage,
    private trips: TripService,
  ) {}

  async upload(
    tripId: string,
    userId: string,
    file: TripMediaUpload,
  ): Promise<string> {
    // Editors only — viewers must not write objects into the trip namespace.
    await this.trips.assertEditable(tripId, userId);

    if (file.content.byteLength > MAX_IMAGE_BYTES) {
      throw new TripMediaError("media_too_large", "Image exceeds the maximum size");
    }

    const mimeType = detectImageMimeType(file.content);
    if (
      !mimeType ||
      !ALLOWED_IMAGE_MIME_TYPES.has(mimeType) ||
      file.claimedMimeType !== mimeType
    ) {
      throw new TripMediaError(
        "media_unsupported_mime",
        "Only PNG, JPEG and WebP images are allowed",
      );
    }

    const ext = extensionOf(mimeType);
    const id = crypto.randomUUID();
    const storagePath = `trips/${storageNamespaceOf(tripId)}/${id}.${ext}`;
    const storedFile: StoredFile = { content: file.content, contentType: mimeType };

    await this.storage.write(storagePath, storedFile);
    return this.storage.getPublicUrl(storagePath);
  }
}

export class TripMediaError extends Error {
  constructor(
    public code: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "TripMediaError";
  }
}

export const MAX_TRIP_MEDIA_BYTES = MAX_IMAGE_BYTES;
