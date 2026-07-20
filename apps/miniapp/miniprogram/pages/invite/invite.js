const { createWebviewPage } = require("../../lib/webview-page");

// Invite acceptance page; the invite token stays inside the PWA path.
Page(createWebviewPage({ fallbackPath: "/" }));
