import { copy } from "./copy";

const rawBaseUrl = process.env.TARO_APP_API_BASE_URL ?? "";

export const config = {
  baseUrl: rawBaseUrl.replace(/\/$/, ""),
} as const;

export { copy };
