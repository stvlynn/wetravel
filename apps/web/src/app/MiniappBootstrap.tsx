import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { exchangeMiniappWebviewCode } from "@/shared/api";
import { authClient } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

const initialBridgeState = readAndClearBridgeState();
let exchangeAttempt:
  | { code: string; promise: Promise<void> }
  | undefined;

export function MiniappBootstrap({
  onComplete,
}: {
  onComplete: (path: string) => void;
}) {
  const { t } = useTranslation("common");
  const [failed, setFailed] = useState(false);

  const connect = useCallback(async () => {
    setFailed(false);
    try {
      // Each native shell page mints its own single-use code, but the WebView
      // may already hold a session cookie (shared storage across pages or a
      // reload after the code was consumed). Prefer the existing session.
      if (await hasSession()) {
        onComplete(initialBridgeState.path);
        return;
      }
      if (!initialBridgeState.code) {
        setFailed(true);
        return;
      }
      await exchangeOnce(initialBridgeState.code);
      if (!(await hasSession())) {
        throw new Error("WebView session cookie was not established");
      }
      onComplete(initialBridgeState.path);
    } catch {
      setFailed(true);
    }
  }, [onComplete]);

  useEffect(() => {
    void connect();
  }, [connect]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
      {failed ? (
        <div className="flex max-w-sm flex-col items-center gap-4">
          <h1 className="text-xl font-semibold">
            {t("miniappBridge.errorTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("miniappBridge.errorDescription")}
          </p>
          <Button variant="brand" onClick={() => void connect()}>
            {t("state.retry")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">
            {t("miniappBridge.connecting")}
          </p>
        </div>
      )}
    </main>
  );
}

async function hasSession(): Promise<boolean> {
  const session = await authClient.getSession({
    query: { disableCookieCache: true },
  });
  return !session.error && Boolean(session.data);
}

function exchangeOnce(code: string): Promise<void> {
  if (!exchangeAttempt || exchangeAttempt.code !== code) {
    const promise = exchangeMiniappWebviewCode(code).catch((error) => {
      exchangeAttempt = undefined;
      throw error;
    });
    exchangeAttempt = { code, promise };
  }
  return exchangeAttempt.promise;
}

/**
 * Reads the one-time bridge code and the target PWA path from the fragment
 * the native shell composed, then strips the fragment before any further
 * request can leak it.
 */
function readAndClearBridgeState(): { code: string | null; path: string } {
  if (typeof window === "undefined" || window.location.pathname !== "/miniapp") {
    return { code: null, path: "/" };
  }
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code")?.trim() || null;
  const path = sanitizeInternalPath(params.get("path"));
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  return { code, path };
}

function sanitizeInternalPath(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}
