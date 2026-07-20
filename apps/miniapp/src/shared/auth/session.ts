import Taro from "@tarojs/taro";

const TOKEN_STORAGE_KEY = "opentrip.bearer-token";

export function getAuthToken(): string | null {
  const value: unknown = Taro.getStorageSync(TOKEN_STORAGE_KEY);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function setAuthToken(token: string): void {
  Taro.setStorageSync(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  Taro.removeStorageSync(TOKEN_STORAGE_KEY);
}

export function captureAuthToken(
  headers: Record<string, string>,
  persist = true,
): string | null {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "set-auth-token",
  );
  const token = entry?.[1];
  if (token && persist) setAuthToken(token);
  return token ?? null;
}
