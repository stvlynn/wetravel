import { Suspense, useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/shared/i18n";
import { Spinner } from "@/shared/ui/spinner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import {
    AnchoredToastProvider,
    installSystemNotificationBridge,
    ToastProvider,
} from "@/shared/ui/toast";
import { MobileOnboarding } from "@/features/mobile-onboarding";
import { SettingsProvider } from "@/features/settings";
import { subscribeToThemeChanges } from "@/features/toggle-theme";
import { PwaLifecycle } from "./PwaLifecycle";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
});

export function AppProviders({ children }: { children: ReactNode }) {
    useEffect(() => {
        installSystemNotificationBridge();
        return subscribeToThemeChanges();
    }, []);

    return (
        <I18nextProvider i18n={i18n}>
            <QueryClientProvider client={queryClient}>
                <TooltipProvider delay={400}>
                    <ToastProvider>
                        <PwaLifecycle />
                        <MobileOnboarding />
                        <AnchoredToastProvider>
                            <SettingsProvider>
                                <Suspense
                                    fallback={
                                        <div className="flex min-h-dvh items-center justify-center">
                                            <Spinner className="size-6" />
                                        </div>
                                    }
                                >
                                    {children}
                                </Suspense>
                            </SettingsProvider>
                        </AnchoredToastProvider>
                    </ToastProvider>
                </TooltipProvider>
            </QueryClientProvider>
        </I18nextProvider>
    );
}
