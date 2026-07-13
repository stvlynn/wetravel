import { getInstallPrompt } from "./install-prompt";

export type OnboardingStep = "install" | "notifications" | "location";
export type StepOutcome = "accepted" | "dismissed";

const STORAGE_KEY = "opentrip.mobile-onboarding.v1";

/** Give `beforeinstallprompt` a moment to fire before opening the sheet. */
export const ONBOARDING_OPEN_DELAY_MS = 1_500;

type StoredState = Partial<Record<OnboardingStep, StepOutcome>>;

function readState(): StoredState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as StoredState) : {};
    } catch {
        return {};
    }
}

export function markStep(step: OnboardingStep, outcome: StepOutcome): void {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...readState(), [step]: outcome }),
        );
    } catch {
        // Storage unavailable (private mode): the flow re-asks next visit.
    }
}

export function isStandaloneDisplay(): boolean {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
            (navigator as { standalone?: boolean }).standalone === true)
    );
}

/** iOS never fires `beforeinstallprompt`; install goes via the share menu. */
export function isIos(): boolean {
    const ua = navigator.userAgent;
    return (
        /iphone|ipad|ipod/i.test(ua) ||
        // iPadOS reports a desktop Mac UA but is the only Mac with touch.
        (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
    );
}

/** Steps that are supported on this device and not yet asked or resolved. */
export async function computePendingSteps(): Promise<OnboardingStep[]> {
    const state = readState();
    const steps: OnboardingStep[] = [];

    if (
        !state.install &&
        !isStandaloneDisplay() &&
        (getInstallPrompt() !== null || isIos())
    ) {
        steps.push("install");
    }
    if (
        !state.notifications &&
        "Notification" in window &&
        Notification.permission === "default"
    ) {
        steps.push("notifications");
    }
    if (
        !state.location &&
        "geolocation" in navigator &&
        (await geolocationPermissionState()) === "prompt"
    ) {
        steps.push("location");
    }
    return steps;
}

async function geolocationPermissionState(): Promise<PermissionState> {
    try {
        const status = await navigator.permissions.query({
            name: "geolocation",
        });
        return status.state;
    } catch {
        // Permissions API unavailable — assume undecided and ask.
        return "prompt";
    }
}

export async function requestNotificationPermission(): Promise<void> {
    try {
        await Notification.requestPermission();
    } catch {
        // Older callback-only implementations reject the promise form.
    }
}

/** Triggers the browser's geolocation prompt with the accuracy the map uses. */
export function requestPreciseLocation(): Promise<void> {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), {
            enableHighAccuracy: true,
            maximumAge: 60_000,
            timeout: 10_000,
        });
    });
}
