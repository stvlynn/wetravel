import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { exchangeMiniappWebviewCode } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

const initialCode = readAndClearBridgeCode();
let exchangeAttempt:
  | { code: string; promise: Promise<void> }
  | undefined;

export function MiniappBootstrap({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("common");
  const [failed, setFailed] = useState(!initialCode);

  const connect = useCallback(async () => {
    if (!initialCode) {
      setFailed(true);
      return;
    }
    setFailed(false);
    try {
      await exchangeOnce(initialCode);
      onComplete();
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

function readAndClearBridgeCode(): string | null {
  if (typeof window === "undefined" || window.location.pathname !== "/miniapp") {
    return null;
  }
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code")?.trim() || null;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  return code;
}
