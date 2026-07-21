/**
 * Visual Viewport → CSS custom properties for overlay surfaces.
 *
 * Mobile browsers default to `interactive-widget=resizes-visual`: the virtual
 * keyboard shrinks only the Visual Viewport while `position: fixed` overlays
 * stay anchored to the Layout Viewport and end up under the keyboard. Chromium
 * / Firefox honor `interactive-widget=resizes-content` (set in `index.html`)
 * so the Layout Viewport shrinks with the keyboard; WebKit (iOS Safari and
 * WeChat's WKWebView) still ignores that keyword. Syncing the Visual Viewport
 * box into CSS variables lets fixed dialogs/drawers track the visible area on
 * every engine without per-form scrollIntoView hacks.
 *
 * Spec / guidance:
 * - https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag#interactive-widget
 * - https://developer.chrome.com/blog/viewport-resize-behavior/
 * - https://www.htmhell.dev/adventcalendar/2024/4/
 */

export const VV_TOP = "--vv-top";
export const VV_LEFT = "--vv-left";
export const VV_WIDTH = "--vv-width";
export const VV_HEIGHT = "--vv-height";
export const KEYBOARD_INSET = "--keyboard-inset";

/** Tailwind classes that pin a fixed overlay to the Visual Viewport box. */
export const VISUAL_VIEWPORT_FIXED_CLASS =
  "fixed top-[var(--vv-top,0px)] left-[var(--vv-left,0px)] w-[var(--vv-width,100%)] h-[var(--vv-height,100%)]";

export interface VisualViewportBox {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Pixels of the layout viewport covered from the bottom by an interactive widget. */
  keyboardInset: number;
}

export interface LayoutViewportSize {
  innerWidth: number;
  innerHeight: number;
}

export interface VisualViewportMetrics {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
}

/**
 * Pure mapping from Visual Viewport + layout size → overlay box.
 * When `visual` is null (unsupported), fall back to the layout viewport.
 */
export function computeVisualViewportBox(
  visual: VisualViewportMetrics | null,
  layout: LayoutViewportSize,
): VisualViewportBox {
  if (!visual) {
    return {
      top: 0,
      left: 0,
      width: layout.innerWidth,
      height: layout.innerHeight,
      keyboardInset: 0,
    };
  }
  return {
    top: visual.offsetTop,
    left: visual.offsetLeft,
    width: visual.width,
    height: visual.height,
    keyboardInset: Math.max(
      0,
      layout.innerHeight - visual.height - visual.offsetTop,
    ),
  };
}

function readVisualViewportMetrics(): VisualViewportMetrics | null {
  const vv = window.visualViewport;
  if (!vv) return null;
  return {
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
  };
}

function applyVisualViewportBox(box: VisualViewportBox): void {
  const root = document.documentElement;
  root.style.setProperty(VV_TOP, `${box.top}px`);
  root.style.setProperty(VV_LEFT, `${box.left}px`);
  root.style.setProperty(VV_WIDTH, `${box.width}px`);
  root.style.setProperty(VV_HEIGHT, `${box.height}px`);
  root.style.setProperty(KEYBOARD_INSET, `${box.keyboardInset}px`);
}

/**
 * Keeps `:root` Visual Viewport CSS variables in sync. Call once at app boot;
 * returns an unsubscribe function.
 */
export function installVisualViewportCssVars(): () => void {
  let frame = 0;

  const publish = (): void => {
    applyVisualViewportBox(
      computeVisualViewportBox(readVisualViewportMetrics(), {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      }),
    );
  };

  const schedule = (): void => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      publish();
    });
  };

  publish();

  const vv = window.visualViewport;
  vv?.addEventListener("resize", schedule);
  vv?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  // iOS / WKWebView often settle keyboard geometry after orientation changes.
  window.addEventListener("orientationchange", schedule);

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    vv?.removeEventListener("resize", schedule);
    vv?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
  };
}
