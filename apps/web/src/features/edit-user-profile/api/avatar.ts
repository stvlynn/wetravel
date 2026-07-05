import { config } from "@/shared/config";

interface ApiErrorBody {
  error?: { code?: string };
}

interface AvatarUploadBody extends ApiErrorBody {
  data?: { url: string };
}

export class ProfileApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ProfileApiError";
  }
}

export async function uploadAvatarFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("avatar", file);
  const response = await fetch(`${config.baseUrl}/api/users/avatar`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  const result = await readJson<AvatarUploadBody>(response);
  if (!response.ok || !result.data?.url) {
    throw new ProfileApiError(result.error?.code ?? "avatar_upload_failed");
  }
  return result.data.url;
}

export async function deleteAvatarFile(): Promise<void> {
  const response = await fetch(`${config.baseUrl}/api/users/avatar`, {
    method: "DELETE",
    credentials: "include",
  });
  const result = await readJson<ApiErrorBody>(response);
  if (!response.ok) {
    throw new ProfileApiError(result.error?.code ?? "avatar_remove_failed");
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

