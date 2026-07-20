import Taro from "@tarojs/taro";
import {
  captureAuthToken,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "@/shared/auth";
import { copy } from "@/shared/config";
import { ApiError, apiUrl, rawRequest } from "./client";
import { parseUploadBody } from "./upload-response";

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

export async function signInWithWechat(): Promise<string> {
  let login: Awaited<ReturnType<typeof Taro.login>>;
  try {
    login = await Taro.login({ timeout: 10_000 });
  } catch {
    throw new ApiError("wechat_code_missing", copy.auth.wechatCodeMissing, 0);
  }
  if (!login.code) {
    throw new ApiError("wechat_code_missing", copy.auth.wechatCodeMissing, 401);
  }

  const response = await rawRequest<AuthErrorBody>(
    "/api/auth/wechat-mini-program/sign-in",
    { method: "POST", data: { code: login.code }, auth: false },
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    // A 404 means the Better Auth endpoint is not mounted, i.e. the API has no
    // WECHAT_MINI_PROGRAM_APP_ID/SECRET configured. Surface that distinctly so
    // testers do not read it as a rejected credential.
    const message =
      response.statusCode === 404
        ? copy.auth.wechatNotConfigured
        : copy.auth.wechatError;
    throw new ApiError(
      response.data.code ?? "wechat_sign_in_failed",
      message,
      response.statusCode,
    );
  }
  const token =
    captureAuthToken(response.header, false) ?? response.data.token ?? null;
  if (!token) {
    throw new ApiError("missing_auth_token", copy.common.unknownError, 500);
  }
  return token;
}

export async function updateUserName(name: string, token: string): Promise<void> {
  const response = await rawRequest<AuthErrorBody>(
    "/api/auth/update-user",
    { method: "POST", data: { name }, token },
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(
      response.data.code ?? "profile_update_failed",
      response.data.message ?? copy.auth.profileUpdateError,
      response.statusCode,
    );
  }
}

export async function uploadUserAvatar(
  filePath: string,
  bearerToken?: string,
): Promise<string> {
  const token = bearerToken ?? getAuthToken();
  if (!token) {
    throw new ApiError("missing_auth_token", copy.common.unknownError, 401);
  }

  const response = await Taro.uploadFile({
    url: apiUrl("/api/users/avatar"),
    filePath,
    name: "avatar",
    header: {
      Authorization: `Bearer ${token}`,
      "x-opentrip-lang": "zh",
    },
  });

  const body = parseUploadBody(response.data);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401) clearAuthToken();
    throw new ApiError(
      body.error?.code ?? body.code ?? "avatar_upload_failed",
      body.error?.message ?? body.message ?? copy.auth.avatarUploadError,
      response.statusCode,
    );
  }

  const url = body.data?.url;
  if (!url) {
    throw new ApiError(
      "avatar_upload_invalid_response",
      copy.auth.avatarUploadError,
      response.statusCode,
    );
  }
  return url;
}

export async function signOut(): Promise<void> {
  try {
    await rawRequest("/api/auth/sign-out", { method: "POST" });
  } finally {
    clearAuthToken();
  }
}
