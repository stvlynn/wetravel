import Taro from "@tarojs/taro";
import { clearAuthToken, getAuthToken } from "@/shared/auth";
import { config, copy } from "@/shared/config";

interface SuccessEnvelope<T> {
  data: T;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiUrl(path: string): string {
  if (!config.baseUrl) {
    throw new ApiError("api_base_url_missing", copy.common.apiBaseUrlMissing, 0);
  }
  return `${config.baseUrl}${path}`;
}

export async function rawRequest<T>(
  path: string,
  options: {
    method?: HttpMethod;
    data?: unknown;
    auth?: boolean;
    token?: string;
  } = {},
) {
  const token =
    options.auth === false ? null : (options.token ?? getAuthToken());
  return Taro.request<T>({
    url: apiUrl(path),
    method: options.method ?? "GET",
    data: options.data,
    header: {
      "content-type": "application/json",
      "x-opentrip-lang": "zh",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function apiFetch<T>(
  path: string,
  options: { method?: HttpMethod; data?: unknown } = {},
): Promise<T> {
  const response = await rawRequest<SuccessEnvelope<T> | ErrorEnvelope>(path, options);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = response.data as ErrorEnvelope;
    if (response.statusCode === 401) clearAuthToken();
    throw new ApiError(
      error.error?.code ?? error.code ?? "unknown",
      error.error?.message ?? error.message ?? copy.common.unknownError,
      response.statusCode,
    );
  }
  return (response.data as SuccessEnvelope<T>).data;
}
