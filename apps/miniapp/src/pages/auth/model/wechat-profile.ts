export type NicknameReviewState =
  | "unsupported"
  | "pending"
  | "passed"
  | "failed";

export function normalizeWechatNickname(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function canStartWechatLogin(input: {
  nickname: string | null;
  avatarPath: string | null;
  review: NicknameReviewState;
}): boolean {
  return Boolean(
    input.nickname &&
      input.avatarPath &&
      (input.review === "unsupported" || input.review === "passed"),
  );
}
