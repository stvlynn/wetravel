import { describe, expect, it } from "vitest";
import { computeVisualViewportBox } from "./visual-viewport";

describe("computeVisualViewportBox", () => {
  const layout = { innerWidth: 390, innerHeight: 844 };

  it("falls back to the layout viewport when Visual Viewport is unavailable", () => {
    expect(computeVisualViewportBox(null, layout)).toEqual({
      top: 0,
      left: 0,
      width: 390,
      height: 844,
      keyboardInset: 0,
    });
  });

  it("mirrors the Visual Viewport box when it matches the layout viewport", () => {
    expect(
      computeVisualViewportBox(
        { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 },
        layout,
      ),
    ).toEqual({
      top: 0,
      left: 0,
      width: 390,
      height: 844,
      keyboardInset: 0,
    });
  });

  it("reports keyboard inset when the Visual Viewport shrinks from the bottom", () => {
    // Typical iOS / WeChat WKWebView: layout stays 844, visual shrinks to 480.
    expect(
      computeVisualViewportBox(
        { offsetTop: 0, offsetLeft: 0, width: 390, height: 480 },
        layout,
      ),
    ).toEqual({
      top: 0,
      left: 0,
      width: 390,
      height: 480,
      keyboardInset: 364,
    });
  });

  it("accounts for Visual Viewport offset when the layout is panned", () => {
    expect(
      computeVisualViewportBox(
        { offsetTop: 120, offsetLeft: 0, width: 390, height: 480 },
        layout,
      ),
    ).toEqual({
      top: 120,
      left: 0,
      width: 390,
      height: 480,
      keyboardInset: 244,
    });
  });

  it("never reports a negative keyboard inset", () => {
    expect(
      computeVisualViewportBox(
        { offsetTop: 0, offsetLeft: 0, width: 390, height: 900 },
        layout,
      ).keyboardInset,
    ).toBe(0);
  });
});
