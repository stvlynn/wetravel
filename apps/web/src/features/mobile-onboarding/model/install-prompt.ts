/**
 * Chromium fires `beforeinstallprompt` once, early in the page lifecycle.
 * The listener must live at module scope (this module is imported statically
 * through the app providers) or the event is gone before React mounts.
 */
export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{
        outcome: "accepted" | "dismissed";
        platform: string;
    }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
    for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        notifyListeners();
    });
    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        notifyListeners();
    });
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
    return deferredPrompt;
}

/** The event is single-use; drop it once `prompt()` has been called. */
export function clearInstallPrompt(): void {
    deferredPrompt = null;
    notifyListeners();
}

/** Notifies when the deferred prompt appears, is consumed, or installs. */
export function subscribeInstallPrompt(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
