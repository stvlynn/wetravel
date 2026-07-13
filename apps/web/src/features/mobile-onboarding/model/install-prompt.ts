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

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * Shows the browser install dialog and reports what the user chose there.
 * "accepted" is the only outcome where the app was actually installed:
 * dismissing the browser dialog or a `prompt()` rejection (e.g. the event
 * was already used or the gesture expired) must not be treated as success.
 */
export async function promptInstall(): Promise<InstallPromptOutcome> {
    const prompt = deferredPrompt;
    if (!prompt) return "unavailable";
    clearInstallPrompt();
    try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        return choice.outcome;
    } catch {
        return "unavailable";
    }
}

/** Notifies when the deferred prompt appears, is consumed, or installs. */
export function subscribeInstallPrompt(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
