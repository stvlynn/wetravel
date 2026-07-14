import Taro from "@tarojs/taro";
import { captureAuthToken, clearAuthToken, setAuthToken } from "@/shared/auth";
import { copy } from "@/shared/config";
import { ApiError, rawRequest } from "./client";

interface AuthErrorBody {
  code?: string;
  message?: string;
  token?: string;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const response = await rawRequest<AuthErrorBody>(
    "/api/auth/sign-in/email",
    { method: "POST", data: { email, password }, auth: false },
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(
      response.data.code ?? "sign_in_failed",
      response.data.message ?? copy.common.unknownError,
      response.statusCode,
    );
  }
  const token = captureAuthToken(response.header) ?? response.data.token ?? null;
  if (token) setAuthToken(token);
  if (!token) {
    throw new ApiError("missing_auth_token", copy.common.unknownError, 500);
  }
}

export async function signInWithWechat(): Promise<void> {
  const login = await Taro.login({ timeout: 10_000 });
  if (!login.code) {
    throw new ApiError("wechat_code_missing", copy.auth.wechatError, 401);
  }

  const response = await rawRequest<AuthErrorBody>(
    "/api/auth/wechat-mini-program/sign-in",
    { method: "POST", data: { code: login.code }, auth: false },
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(
      response.data.code ?? "wechat_sign_in_failed",
      copy.auth.wechatError,
      response.statusCode,
    );
  }
  const token = captureAuthToken(response.header) ?? response.data.token ?? null;
  if (token) setAuthToken(token);
  if (!token) {
    throw new ApiError("missing_auth_token", copy.common.unknownError, 500);
  }
}

export async function signOut(): Promise<void> {
  try {
    await rawRequest("/api/auth/sign-out", { method: "POST" });
  } finally {
    clearAuthToken();
  }
}
