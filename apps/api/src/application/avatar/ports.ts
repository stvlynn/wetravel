export interface StoredFile {
  content: Uint8Array;
  contentType: string;
}

/** Driven port implemented by runtime-specific storage adapters. */
export interface FileStorage {
  write(path: string, file: StoredFile): Promise<void>;
  read(path: string): Promise<StoredFile | null>;
  delete(path: string): Promise<void>;
  getPublicUrl(path: string): string;
}

/** Request-bound port for updating the current authenticated user. */
export interface CurrentUserProfile {
  updateImage(image: string | null): Promise<void>;
}

