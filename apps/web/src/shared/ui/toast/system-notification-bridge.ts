import { MOBILE_MEDIA_QUERY, matchesMediaQuery } from "@/shared/lib";
import { toastManager } from "./toast";

const NOTIFICATION_ICON = "/pwa-192x192.png";

type ToastAddOptions = Parameters<typeof toastManager.add>[0];

let installed = false;

/**
 * Mirrors in-app toasts to system notifications on mobile, so they reach the
 * user as push-style banners while OpenTrip is in the background. Fires only
 * when the page is hidden — a visible page already renders the in-app toast
 * and a system banner would duplicate it — and only after the user granted
 * Notification permission (asked by `features/mobile-onboarding`).
 */
export function installSystemNotificationBridge(): void {
    if (installed) return;
    installed = true;
    const add = toastManager.add.bind(toastManager);
    toastManager.add = (options) => {
        mirrorToSystemNotification(options);
        return add(options);
    };
}

function mirrorToSystemNotification(options: ToastAddOptions): void {
    if (typeof options.title !== "string" || options.type === "loading") {
        return;
    }
    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }
    if (document.visibilityState !== "hidden") return;
    if (!matchesMediaQuery(MOBILE_MEDIA_QUERY)) return;

    const title = options.title;
    const body =
        typeof options.description === "string"
            ? options.description
            : undefined;

    void navigator.serviceWorker
        ?.getRegistration()
        .then((registration) => {
            if (registration) {
                // Android Chrome only allows notifications through the SW.
                return registration.showNotification(title, {
                    body,
                    icon: NOTIFICATION_ICON,
                });
            }
            new Notification(title, { body, icon: NOTIFICATION_ICON });
        })
        .catch(() => {
            // Best-effort delivery; the in-app toast still renders.
        });
}
