import { config } from "@/shared/config";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public current?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface SuccessEnvelope<T> {
  data: T;
}

interface ErrorEnvelope {
  error: { code: string; message: string; current?: unknown };
}

/** Typed fetch against the API. Sends cookies (Better Auth session), parses the
 * `{ data }` / `{ error }` envelope, and throws `ApiError` on failure. */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (body as ErrorEnvelope | null)?.error;
    throw new ApiError(
      err?.code ?? "unknown",
      err?.message ?? res.statusText,
      res.status,
      err?.current,
    );
  }

  return (body as SuccessEnvelope<T>).data;
}
