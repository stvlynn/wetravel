import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  detectImageMimeType,
  extensionOf,
  storageNamespaceOf,
  type FileStorage,
  type StoredFile,
} from "../storage";
import type { CurrentUserProfile } from "./ports";

/** @deprecated Prefer MAX_IMAGE_BYTES — kept for existing avatar route wiring. */
export const MAX_AVATAR_BYTES = MAX_IMAGE_BYTES;

export interface AvatarUpload {
  content: Uint8Array;
  claimedMimeType: string;
}

export class AvatarService {
  constructor(private storage: FileStorage) {}

  async replace(
    userId: string,
    previousUrl: string | null,
    file: AvatarUpload,
    profile: CurrentUserProfile,
  ): Promise<string> {
    if (file.content.byteLength > MAX_IMAGE_BYTES) {
      throw new AvatarError("avatar_too_large", "Avatar exceeds the maximum size");
    }

    const mimeType = detectImageMimeType(file.content);
    if (
      !mimeType ||
      !ALLOWED_IMAGE_MIME_TYPES.has(mimeType) ||
      file.claimedMimeType !== mimeType
    ) {
      throw new AvatarError("avatar_unsupported_mime", "Only PNG, JPEG and WebP images are allowed");
    }

    const ext = extensionOf(mimeType);
    const id = crypto.randomUUID();
    const storagePath = `avatars/${storageNamespaceOf(userId)}/${id}.${ext}`;
    const storedFile: StoredFile = { content: file.content, contentType: mimeType };

    await this.storage.write(storagePath, storedFile);
    const url = this.storage.getPublicUrl(storagePath);

    try {
      await profile.updateImage(url);
    } catch (error) {
      await this.compensateNewFile(
        storagePath,
        previousUrl,
        profile,
        error,
      );
    }

    try {
      await this.removeManaged(previousUrl);
    } catch (error) {
      await this.rollbackReplacement(previousUrl, storagePath, profile, error);
    }

    return url;
  }

  async remove(previousUrl: string | null, profile: CurrentUserProfile): Promise<void> {
    await profile.updateImage(null);
    try {
      await this.removeManaged(previousUrl);
    } catch (error) {
      if (previousUrl) {
        try {
          await profile.updateImage(previousUrl);
        } catch (rollbackError) {
          throw new AvatarError(
            "avatar_transaction_failed",
            "Avatar removal and profile rollback both failed",
            new AggregateError([error, rollbackError]),
          );
        }
      }
      throw new AvatarError("avatar_cleanup_failed", "Could not remove the stored avatar", error);
    }
  }

  private async removeManaged(url: string | null): Promise<void> {
    const path = url ? this.pathFromUrl(url) : null;
    if (path) await this.storage.delete(path);
  }

  private async compensateNewFile(
    path: string,
    previousUrl: string | null,
    profile: CurrentUserProfile,
    cause: unknown,
  ): Promise<never> {
    const compensationErrors: unknown[] = [];
    try {
      // Better Auth update hooks run after the account write. If a projection
      // hook rejects, explicitly restore the previous image before deleting
      // the just-uploaded file.
      await profile.updateImage(previousUrl);
    } catch (rollbackError) {
      compensationErrors.push(rollbackError);
    }
    try {
      await this.storage.delete(path);
    } catch (cleanupError) {
      compensationErrors.push(cleanupError);
    }
    if (compensationErrors.length > 0) {
      throw new AvatarError(
        "avatar_transaction_failed",
        "Profile update compensation failed",
        new AggregateError([cause, ...compensationErrors]),
      );
    }
    throw new AvatarError("avatar_profile_update_failed", "Could not update the user profile", cause);
  }

  private async rollbackReplacement(
    previousUrl: string | null,
    newPath: string,
    profile: CurrentUserProfile,
    cause: unknown,
  ): Promise<never> {
    try {
      await profile.updateImage(previousUrl);
      await this.storage.delete(newPath);
    } catch (rollbackError) {
      throw new AvatarError(
        "avatar_transaction_failed",
        "Old-avatar cleanup and profile rollback both failed",
        new AggregateError([cause, rollbackError]),
      );
    }
    throw new AvatarError("avatar_cleanup_failed", "Could not remove the previous avatar", cause);
  }

  private pathFromUrl(url: string): string | null {
    const base = this.storage.getPublicUrl("").replace(/\/$/, "");
    if (!url.startsWith(`${base}/`)) return null;
    const encodedPath = url.slice(base.length + 1).split("?", 1)[0]!;
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return null;
    }
  }
}

export class AvatarError extends Error {
  constructor(
    public code: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "AvatarError";
  }
}
