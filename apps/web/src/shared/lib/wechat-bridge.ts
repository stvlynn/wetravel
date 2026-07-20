/**
 * WeChat Mini Program WebView bridge.
 *
 * Inside a Mini Program `<web-view>` the page may load the official JSSDK and
 * use the `wx.miniProgram.*` API family (no `wx.config` signature required) to
 * drive the native page stack and to queue share payloads. WeChat delivers
 * `postMessage` data to the shell only at specific lifecycle moments (back
 * navigation, component destroy, share, copy link), so the bridge is never a
 * real-time state transport — critical state stays on the API.
 */

const JSSDK_URL = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";

export interface WechatMiniProgramBridge {
  navigateTo(options: { url: string }): void;
  redirectTo(options: { url: string }): void;
  reLaunch(options: { url: string }): void;
  switchTab(options: { url: string }): void;
  navigateBack(options?: { delta?: number }): void;
  postMessage(options: { data: unknown }): void;
  getEnv(callback: (env: { miniprogram?: boolean }) => void): void;
}

interface WechatJsSdk {
  miniProgram?: WechatMiniProgramBridge;
}

declare global {
  interface Window {
    wx?: WechatJsSdk;
    __wxjs_environment?: string;
  }
}

let loadPromise: Promise<WechatMiniProgramBridge | null> | undefined;
let loadedBridge: WechatMiniProgramBridge | null = null;

/**
 * Loads the JSSDK once and memoizes the `wx.miniProgram` handle. Resolves to
 * null outside WeChat or when the script cannot be fetched, so callers can
 * fall back to regular SPA behavior.
 */
export function loadWechatMiniProgramBridge(): Promise<WechatMiniProgramBridge | null> {
  if (loadPromise) return loadPromise;
  loadPromise = injectJsSdk()
    .then((bridge) => {
      loadedBridge = bridge;
      return bridge;
    })
    .catch(() => {
      loadedBridge = null;
      return null;
    });
  return loadPromise;
}

/**
 * Synchronous handle for event handlers (e.g. navigation clicks). Returns
 * null until `loadWechatMiniProgramBridge` has resolved.
 */
export function getWechatMiniProgramBridge(): WechatMiniProgramBridge | null {
  return loadedBridge;
}

export interface MiniappShareContext {
  title: string;
  /** PWA path (e.g. `/trips/abc`) the share card should reopen. */
  path: string;
  imageUrl?: string;
}

/**
 * Queues the current share context for the native shell. The shell reads the
 * latest payload from `bindmessage` when the user shares the page.
 */
export function postMiniappShareContext(context: MiniappShareContext): void {
  loadedBridge?.postMessage({ data: { type: "share", ...context } });
}

function injectJsSdk(): Promise<WechatMiniProgramBridge | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const existing = window.wx?.miniProgram;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = JSSDK_URL;
    script.async = true;
    script.onload = () => resolve(window.wx?.miniProgram ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}
