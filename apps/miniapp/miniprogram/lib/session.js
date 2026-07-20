const config = require("../config");

/**
 * WeChat login and WebView session handoff.
 *
 * The bearer returned by the Mini Program sign-in is kept in App.globalData
 * (memory only — never persisted, never placed in a URL) so every native page
 * can mint its own single-use WebView bridge code without repeating wx.login.
 */

async function ensureBearer() {
  const app = getApp();
  if (app.globalData.bearer) return app.globalData.bearer;
  const login = await wechatLogin();
  if (!login.code) throw new Error("WeChat login returned no code");
  const signIn = await requestApi("/api/auth/wechat-mini-program/sign-in", {
    data: { code: login.code },
  });
  const bearer = signIn.data && signIn.data.token;
  if (!bearer) throw new Error("Mini Program sign-in returned no token");
  app.globalData.bearer = bearer;
  return bearer;
}

async function mintWebviewCode() {
  try {
    return await mintWithBearer(await ensureBearer());
  } catch (error) {
    // The in-memory bearer may have expired while the shell stayed warm;
    // retry once with a fresh WeChat login before surfacing the failure.
    console.warn("OpenTrip WebView mint retrying with fresh login", error);
    getApp().globalData.bearer = "";
    return mintWithBearer(await ensureBearer());
  }
}

async function mintWithBearer(bearer) {
  const mint = await requestApi("/api/mobile-auth/webview/mint", {
    header: { Authorization: `Bearer ${bearer}` },
  });
  const code = mint.data && mint.data.data && mint.data.data.code;
  if (!code) throw new Error("WebView bridge returned no code");
  return code;
}

/**
 * Builds the WebView src for a PWA path. The single-use code and the target
 * path travel in the URL fragment, which the PWA strips before any request.
 */
async function buildWebviewUrl(path) {
  const code = await mintWebviewCode();
  return (
    `${config.webBaseUrl}/miniapp` +
    `#code=${encodeURIComponent(code)}&path=${encodeURIComponent(path)}`
  );
}

function wechatLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10_000,
      success: resolve,
      fail: reject,
    });
  });
}

function requestApi(path, options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method: "POST",
      data: options.data,
      header: {
        "content-type": "application/json",
        "x-opentrip-lang": "zh",
        ...options.header,
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response);
          return;
        }
        reject(new Error(`OpenTrip API returned ${response.statusCode}`));
      },
      fail: reject,
    });
  });
}

module.exports = { buildWebviewUrl };
