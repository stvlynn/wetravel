import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/shared/lib";
import { Button } from "@/shared/ui/button";
import {
    clearInstallPrompt,
    getInstallPrompt,
    subscribeInstallPrompt,
} from "../model/install-prompt";
import {
    isIos,
    isStandaloneDisplay,
    markStep,
    requestNotificationPermission,
    requestPreciseLocation,
    type OnboardingStep,
} from "../model/onboarding";

type PermissionUiState = "prompt" | "granted" | "denied" | "unsupported";

function fromNotificationPermission(
    permission: NotificationPermission,
): PermissionUiState {
    return permission === "default" ? "prompt" : permission;
}

/**
 * Watches a Permissions API entry, reporting the initial state and every
 * change. No-op where the API or the queried name is unsupported.
 */
function watchPermission(
    name: PermissionName,
    onState: (state: PermissionState) => void,
): () => void {
    let status: PermissionStatus | null = null;
    let disposed = false;
    const handleChange = () => {
        if (status) onState(status.state);
    };
    navigator.permissions
        ?.query({ name })
        .then((result) => {
            if (disposed) return;
            status = result;
            onState(result.state);
            result.addEventListener("change", handleChange);
        })
        .catch(() => {});
    return () => {
        disposed = true;
        status?.removeEventListener("change", handleChange);
    };
}

/**
 * Device-permission rows for the settings preferences pane, mobile only.
 * Re-offers what the first-visit onboarding asked (install, notifications,
 * precise location) so a declined prompt is never a dead end.
 */
export function PermissionSettings(): React.ReactElement | null {
    const isMobile = useIsMobile();
    const { t } = useTranslation("common");
    const [installed, setInstalled] = useState(false);
    const [installAvailable, setInstallAvailable] = useState(false);
    const [notifications, setNotifications] = useState<PermissionUiState>(
        "unsupported",
    );
    const [location, setLocation] = useState<PermissionUiState>("unsupported");
    const [busy, setBusy] = useState<OnboardingStep | null>(null);

    useEffect(() => {
        setInstalled(isStandaloneDisplay());
        setInstallAvailable(getInstallPrompt() !== null);
        if ("Notification" in window) {
            setNotifications(fromNotificationPermission(Notification.permission));
        }
        if ("geolocation" in navigator) {
            // Assume undecided until the Permissions API reports otherwise.
            setLocation("prompt");
        }

        const unsubscribers = [
            subscribeInstallPrompt(() => {
                setInstalled(isStandaloneDisplay());
                setInstallAvailable(getInstallPrompt() !== null);
            }),
            watchPermission("notifications", setNotifications),
            watchPermission("geolocation", setLocation),
        ];
        return () => {
            for (const unsubscribe of unsubscribers) unsubscribe();
        };
    }, []);

    if (!isMobile) return null;

    const install = async () => {
        const prompt = getInstallPrompt();
        if (!prompt) return;
        setBusy("install");
        try {
            clearInstallPrompt();
            await prompt.prompt();
            const choice = await prompt.userChoice;
            if (choice.outcome === "accepted") {
                markStep("install", "accepted");
            }
        } finally {
            setBusy(null);
        }
    };

    const allowNotifications = async () => {
        setBusy("notifications");
        try {
            await requestNotificationPermission();
            setNotifications(fromNotificationPermission(Notification.permission));
            markStep("notifications", "accepted");
        } finally {
            setBusy(null);
        }
    };

    const allowLocation = async () => {
        setBusy("location");
        try {
            await requestPreciseLocation();
            markStep("location", "accepted");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-col gap-5 border-t border-border pt-5">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("settings.permissions.label")}
            </p>
            <PermissionRow label={t("settings.permissions.install.label")}>
                {installed ? (
                    <StatusText>
                        {t("settings.permissions.install.installed")}
                    </StatusText>
                ) : installAvailable ? (
                    <Button
                        size="xs"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void install()}
                    >
                        {t("settings.permissions.install.action")}
                    </Button>
                ) : isIos() ? (
                    <StatusText>
                        {t("settings.permissions.install.iosHint")}
                    </StatusText>
                ) : (
                    <StatusText>
                        {t("settings.permissions.unsupported")}
                    </StatusText>
                )}
            </PermissionRow>
            <PermissionRow label={t("settings.permissions.notifications.label")}>
                <PermissionControl
                    state={notifications}
                    busy={busy !== null}
                    onAllow={() => void allowNotifications()}
                />
            </PermissionRow>
            <PermissionRow label={t("settings.permissions.location.label")}>
                <PermissionControl
                    state={location}
                    busy={busy !== null}
                    onAllow={() => void allowLocation()}
                />
            </PermissionRow>
        </div>
    );
}

function PermissionControl({
    state,
    busy,
    onAllow,
}: {
    state: PermissionUiState;
    busy: boolean;
    onAllow: () => void;
}): React.ReactElement {
    const { t } = useTranslation("common");
    if (state === "prompt") {
        return (
            <Button size="xs" variant="outline" disabled={busy} onClick={onAllow}>
                {t("settings.permissions.allow")}
            </Button>
        );
    }
    return <StatusText>{t(`settings.permissions.${state}`)}</StatusText>;
}

function PermissionRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}): React.ReactElement {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium text-foreground">{label}</span>
            {children}
        </div>
    );
}

function StatusText({ children }: { children: ReactNode }): React.ReactElement {
    return (
        <span className="text-right text-xs text-muted-foreground">
            {children}
        </span>
    );
}
