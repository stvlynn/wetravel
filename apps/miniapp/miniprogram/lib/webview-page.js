const copy = require("./copy");
const session = require("./session");

/**
 * Shared behavior for the native WebView pages.
 *
 * Each native page hosts exactly one PWA route so the Mini Program keeps a
 * real native page stack: native navigation bar, back button, and swipe-back
 * come from WeChat while the PWA renders the product UI inside <web-view>.
 * The PWA drives stack transitions through wx.miniProgram.navigateTo/reLaunch
 * with the target PWA path in the page query.
 */
function createWebviewPage({ fallbackPath }) {
  return {
    data: {
      copy,
      loading: true,
      errorMessage: "",
      webviewUrl: "",
      webviewLoaded: false,
    },

    onLoad(options) {
      this.targetPath = readTargetPath(options, fallbackPath);
      this.sharePayload = null;
      const title = readQueryValue(options && options.title);
      // Initial native title before the WebView loads; once loaded, WeChat
      // mirrors the page's document.title onto the navigation bar.
      if (title) wx.setNavigationBarTitle({ title });
      this.connect();
    },

    async connect() {
      this.setData({
        loading: true,
        errorMessage: "",
        webviewUrl: "",
        webviewLoaded: false,
      });
      try {
        const webviewUrl = await session.buildWebviewUrl(this.targetPath);
        this.setData({ loading: false, webviewUrl });
      } catch (error) {
        console.error("OpenTrip WebView connection failed", error);
        this.setData({ loading: false, errorMessage: copy.connectionFailed });
      }
    },

    handleWebviewLoad() {
      this.setData({ webviewLoaded: true });
    },

    handleWebviewError(event) {
      console.error("OpenTrip WebView load failed", event.detail);
      if (this.data.webviewLoaded) return;
      this.setData({
        loading: false,
        webviewUrl: "",
        errorMessage: copy.webviewFailed,
      });
    },

    handleWebviewMessage(event) {
      // WeChat batches postMessage payloads and delivers them only at share,
      // back-navigation, or destroy time; the newest share context wins.
      const messages = (event.detail && event.detail.data) || [];
      for (const message of messages) {
        if (message && message.type === "share") this.sharePayload = message;
      }
    },

    onShareAppMessage() {
      const share = this.sharePayload || {};
      const path = typeof share.path === "string" ? share.path : this.targetPath;
      const result = {
        title: share.title || copy.appName,
        path: nativeSharePath(path, share.title),
      };
      if (share.imageUrl) result.imageUrl = share.imageUrl;
      return result;
    },
  };
}

function readTargetPath(options, fallbackPath) {
  const path = readQueryValue(options && options.path);
  if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  return fallbackPath;
}

function readQueryValue(raw) {
  if (typeof raw !== "string" || !raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    console.warn("OpenTrip shell received a malformed query value", error);
    return raw;
  }
}

/** Maps a PWA path to the native page hosting it, for share cards. */
function nativeSharePath(pwaPath, title) {
  const page = pwaPath.startsWith("/trips/")
    ? "/pages/trip/trip"
    : pwaPath.startsWith("/invite/")
      ? "/pages/invite/invite"
      : "/pages/home/home";
  const query = [`path=${encodeURIComponent(pwaPath)}`];
  if (title) query.push(`title=${encodeURIComponent(title)}`);
  return `${page}?${query.join("&")}`;
}

module.exports = { createWebviewPage };
