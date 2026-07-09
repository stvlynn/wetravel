export type { FileStorage, StoredFile } from "./ports";
export {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  detectImageMimeType,
  extensionOf,
  isAvatarStoragePath,
  isManagedUploadPath,
  isTripMediaStoragePath,
  storageNamespaceOf,
} from "./image";
