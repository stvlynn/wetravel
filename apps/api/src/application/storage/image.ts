/** Shared image validation for avatars and trip media. */

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Maximum decoded image payload accepted by managed uploads. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function extensionOf(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

export function detectImageMimeType(content: Uint8Array): string | null {
  if (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return "image/png";
  }
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    content.length >= 12 &&
    ascii(content, 0, 4) === "RIFF" &&
    ascii(content, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Hex-encode an opaque id so it is safe as a single storage path segment. */
export function storageNamespaceOf(id: string): string {
  return [...new TextEncoder().encode(id)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const UUID_V4_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/i;

/** Avatar objects live at `avatars/{hexUserId}/{uuid}.{ext}`. */
export function isAvatarStoragePath(path: string): boolean {
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== "avatars" || !/^[0-9a-f]+$/i.test(parts[1]!)) {
    return false;
  }
  return UUID_V4_FILE.test(parts[2]!);
}

/** Trip note images live at `trips/{hexTripId}/{uuid}.{ext}`. */
export function isTripMediaStoragePath(path: string): boolean {
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== "trips" || !/^[0-9a-f]+$/i.test(parts[1]!)) {
    return false;
  }
  return UUID_V4_FILE.test(parts[2]!);
}

export function isManagedUploadPath(path: string): boolean {
  return isAvatarStoragePath(path) || isTripMediaStoragePath(path);
}

function ascii(content: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...content.subarray(start, end));
}
