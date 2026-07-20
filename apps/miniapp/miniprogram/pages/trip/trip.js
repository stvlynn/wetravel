const { createWebviewPage } = require("../../lib/webview-page");

// Trip detail page pushed by the PWA via wx.miniProgram.navigateTo, or opened
// directly from a share card carrying the PWA path in its query.
Page(createWebviewPage({ fallbackPath: "/" }));
