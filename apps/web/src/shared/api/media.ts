import { config } from "@/shared/config";
import { ApiError } from "./client";

interface MediaUploadBody {
  data?: { url: string };
  error?: { code?: string; message?: string };
}

/** Upload a PNG/JPEG/WebP image for embedding in a stop note. */
export async function uploadTripMedia(
  tripId: string,
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    `${config.baseUrl}/api/trips/${encodeURIComponent(tripId)}/media`,
    {
      method: "POST",
      body: formData,
      credentials: "include",
    },
  );
  const result = await readJson<MediaUploadBody>(response);
  if (!response.ok || !result.data?.url) {
    throw new ApiError(
      result.error?.code ?? "media_upload_failed",
      result.error?.message ?? response.statusText,
      response.status,
    );
  }
  return result.data.url;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}
