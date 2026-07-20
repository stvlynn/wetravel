const { createWebviewPage } = require("../../lib/webview-page");

// Stack-bottom page hosting the PWA trips list.
Page(createWebviewPage({ fallbackPath: "/" }));
