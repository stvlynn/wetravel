export interface AvatarUploadBody {
  data?: { url?: string };
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
}

export function parseUploadBody(data: string): AvatarUploadBody {
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as AvatarUploadBody)
      : {};
  } catch {
    return {};
  }
}
