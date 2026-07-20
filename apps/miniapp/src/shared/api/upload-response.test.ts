import { describe, expect, it } from "vitest";
import { parseUploadBody } from "./upload-response";

describe("parseUploadBody", () => {
  it("reads successful avatar responses", () => {
    expect(
      parseUploadBody('{"data":{"url":"https://api.test/avatar.png"}}'),
    ).toEqual({ data: { url: "https://api.test/avatar.png" } });
  });

  it("preserves API errors and tolerates malformed responses", () => {
    expect(
      parseUploadBody(
        '{"error":{"code":"avatar_too_large","message":"too large"}}',
      ),
    ).toEqual({
      error: { code: "avatar_too_large", message: "too large" },
    });
    expect(parseUploadBody("<html>gateway error</html>")).toEqual({});
    expect(parseUploadBody("[]")).toEqual({});
  });
});
