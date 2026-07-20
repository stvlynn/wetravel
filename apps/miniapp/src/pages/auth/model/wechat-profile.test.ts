import { describe, expect, it } from "vitest";
import {
  canStartWechatLogin,
  normalizeWechatNickname,
} from "./wechat-profile";

describe("WeChat profile login readiness", () => {
  it("normalizes the submitted nickname", () => {
    expect(normalizeWechatNickname("  小旅  ")).toBe("小旅");
    expect(normalizeWechatNickname(undefined)).toBe("");
  });

  it("waits for nickname, avatar, and supported nickname review", () => {
    expect(
      canStartWechatLogin({
        nickname: "小旅",
        avatarPath: "wxfile://avatar.jpg",
        review: "passed",
      }),
    ).toBe(true);
    expect(
      canStartWechatLogin({
        nickname: "小旅",
        avatarPath: "wxfile://avatar.jpg",
        review: "pending",
      }),
    ).toBe(false);
    expect(
      canStartWechatLogin({
        nickname: "",
        avatarPath: "wxfile://avatar.jpg",
        review: "passed",
      }),
    ).toBe(false);
  });

  it("allows form submission when nickname review is unavailable", () => {
    expect(
      canStartWechatLogin({
        nickname: "小旅",
        avatarPath: "wxfile://avatar.jpg",
        review: "unsupported",
      }),
    ).toBe(true);
  });
});
