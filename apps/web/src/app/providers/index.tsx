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
import { loadWechatMiniProgramBridge } from "@/shared/lib";
import { MobileOnboarding } from "@/features/mobile-onboarding";
import { SettingsProvider } from "@/features/settings";
import { subscribeToThemeChanges } from "@/features/toggle-theme";
import { EmbeddedEnvironmentProvider } from "../embedded-environment";
import { PwaLifecycle } from "./PwaLifecycle";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
});

export function AppProviders({
    embedded,
    children,
}: {
    embedded: boolean;
    children: ReactNode;
}) {
    useEffect(() => {
        if (embedded) {
            // Preload the JSSDK so navigation clicks can use wx.miniProgram
            // synchronously once it resolves.
            void loadWechatMiniProgramBridge();
        } else {
            installSystemNotificationBridge();
        }
        return subscribeToThemeChanges();
    }, [embedded]);

    return (
        <EmbeddedEnvironmentProvider embedded={embedded}>
            <I18nextProvider i18n={i18n}>
                <QueryClientProvider client={queryClient}>
                    <TooltipProvider delay={400}>
                        <ToastProvider>
                            {!embedded ? <PwaLifecycle /> : null}
                            {!embedded ? <MobileOnboarding /> : null}
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
        </EmbeddedEnvironmentProvider>
    );
}
