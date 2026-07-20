const config = require("../../config");

const COPY = Object.freeze({
  connectionFailed: "请检查网络后重试。",
  webviewFailed: "页面加载失败，请稍后重试。",
});

Page({
  data: {
    loading: true,
    errorMessage: "",
    webviewUrl: "",
    webviewLoaded: false,
  },

  onLoad() {
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
      const login = await wechatLogin();
      if (!login.code) throw new Error("WeChat login returned no code");

      const signIn = await requestApi("/api/auth/wechat-mini-program/sign-in", {
        data: { code: login.code },
      });
      const bearer = signIn.data && signIn.data.token;
      if (!bearer) throw new Error("Mini Program sign-in returned no token");

      const mint = await requestApi("/api/mobile-auth/webview/mint", {
        header: { Authorization: `Bearer ${bearer}` },
      });
      const code = mint.data && mint.data.data && mint.data.data.code;
      if (!code) throw new Error("WebView bridge returned no code");

      const webviewUrl =
        `${config.webBaseUrl}/miniapp#code=${encodeURIComponent(code)}`;
      this.setData({ loading: false, webviewUrl });
    } catch (error) {
      console.error("OpenTrip WebView connection failed", error);
      this.setData({
        loading: false,
        errorMessage: COPY.connectionFailed,
      });
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
      errorMessage: COPY.webviewFailed,
    });
  },
});

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
