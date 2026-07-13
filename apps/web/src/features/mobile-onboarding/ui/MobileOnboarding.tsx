import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    BellRingIcon,
    LocateFixedIcon,
    MonitorSmartphoneIcon,
} from "lucide-react";
import { cn, useIsMobile } from "@/shared/lib";
import { Button } from "@/shared/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/shared/ui/drawer";
import { getInstallPrompt, promptInstall } from "../model/install-prompt";
import {
    computePendingSteps,
    markStep,
    ONBOARDING_OPEN_DELAY_MS,
    requestNotificationPermission,
    requestPreciseLocation,
    type OnboardingStep,
} from "../model/onboarding";

const STEP_ICONS = {
    install: MonitorSmartphoneIcon,
    notifications: BellRingIcon,
    location: LocateFixedIcon,
} as const;

/**
 * First-visit sheet on mobile that walks through installing the PWA,
 * allowing system notifications, and allowing precise location for the map.
 * Each step is asked once; answers persist in localStorage.
 */
export function MobileOnboarding() {
    const isMobile = useIsMobile();
    const { t } = useTranslation("common");
    const [steps, setSteps] = useState<OnboardingStep[]>([]);
    const [index, setIndex] = useState(0);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    // Marks that the sheet opened once this page load. Set when it actually
    // opens — not when the timer is scheduled — so StrictMode's mount →
    // unmount → remount cycle (which cancels the first timer) reschedules.
    const openedRef = useRef(false);

    useEffect(() => {
        if (!isMobile || openedRef.current) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            void computePendingSteps().then((pending) => {
                if (cancelled || openedRef.current || pending.length === 0) {
                    return;
                }
                openedRef.current = true;
                setSteps(pending);
                setOpen(true);
            });
        }, ONBOARDING_OPEN_DELAY_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isMobile]);

    const step = steps[index];
    if (!step) return null;

    const advance = () => {
        if (index + 1 < steps.length) setIndex(index + 1);
        else setOpen(false);
    };

    const dismissRemaining = () => {
        for (const pending of steps.slice(index)) {
            markStep(pending, "dismissed");
        }
        setOpen(false);
    };

    const skip = () => {
        markStep(step, "dismissed");
        advance();
    };

    const accept = async () => {
        setBusy(true);
        try {
            if (step === "install") {
                // Installed only when the user also accepts the browser's own
                // dialog; recording a dismissal there as "accepted" would hide
                // the settings re-offer while nothing was installed.
                const outcome = await promptInstall();
                markStep(step, outcome === "accepted" ? "accepted" : "dismissed");
            } else if (step === "notifications") {
                await requestNotificationPermission();
                markStep(step, "accepted");
            } else {
                await requestPreciseLocation();
                markStep(step, "accepted");
            }
        } finally {
            setBusy(false);
        }
        advance();
    };

    // No install API on iOS — show share-menu instructions instead.
    const manualInstall = step === "install" && getInstallPrompt() === null;
    const Icon = STEP_ICONS[step];

    return (
        <Drawer
            open={open}
            onOpenChange={(next) => {
                if (!next) dismissRemaining();
            }}
        >
            <DrawerContent side="bottom">
                <DrawerHeader className="items-center pb-5 text-center">
                    <div className="mb-1.5 flex size-12 items-center justify-center rounded-full bg-accent">
                        <Icon className="size-6" />
                    </div>
                    <DrawerTitle className="text-base font-semibold">
                        {t(`mobileOnboarding.${step}.title`)}
                    </DrawerTitle>
                    <DrawerDescription className="text-sm text-muted-foreground">
                        {manualInstall
                            ? t("mobileOnboarding.install.iosHint")
                            : t(`mobileOnboarding.${step}.description`)}
                    </DrawerDescription>
                    {steps.length > 1 ? (
                        <div aria-hidden className="mt-2 flex justify-center gap-1.5">
                            {steps.map((dot, dotIndex) => (
                                <span
                                    key={dot}
                                    className={cn(
                                        "size-1.5 rounded-full",
                                        dotIndex === index
                                            ? "bg-foreground"
                                            : "bg-muted",
                                    )}
                                />
                            ))}
                        </div>
                    ) : null}
                </DrawerHeader>
                <DrawerFooter className="grid grid-cols-2 gap-2 border-t-0 pt-0">
                    {manualInstall ? (
                        <Button
                            className="col-span-2"
                            onClick={() => {
                                markStep(step, "accepted");
                                advance();
                            }}
                        >
                            {t("mobileOnboarding.install.iosAction")}
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" disabled={busy} onClick={skip}>
                                {t("mobileOnboarding.later")}
                            </Button>
                            <Button disabled={busy} onClick={() => void accept()}>
                                {t(`mobileOnboarding.${step}.action`)}
                            </Button>
                        </>
                    )}
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
