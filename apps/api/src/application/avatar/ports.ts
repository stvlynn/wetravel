/** Request-bound port for updating the current authenticated user. */
export interface CurrentUserProfile {
  updateImage(image: string | null): Promise<void>;
}

export type { FileStorage, StoredFile } from "../storage";
