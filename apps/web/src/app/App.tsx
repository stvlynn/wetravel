import { useCallback, useEffect, useState } from "react";
import { AppProviders } from "./providers";
import { RouterProvider, useRouter, matchTripId, matchInviteToken } from "./router";
import { detectMiniappContainer, useIsMiniappEmbedded } from "./embedded-environment";
import { MiniappBootstrap } from "./MiniappBootstrap";
import { resolveInitialSession } from "./auth-session-state";
import { useSession } from "@/shared/auth";
import { Spinner } from "@/shared/ui/spinner";
import { AuthPage } from "@/pages/auth";
import { LandingPage } from "@/pages/landing";
import { InvitePage } from "@/pages/invite";
import { TripsPage } from "@/pages/trips";
import { TravelPlannerPage } from "@/pages/travel-planner";
import { SettingsDialog } from "@/widgets/settings-dialog";

function Routes() {
  const { path } = useRouter();
  const tripId = matchTripId(path);
  if (tripId) return <TravelPlannerPage tripId={tripId} />;
  return <TripsPage />;
}

function Gate({
  isAuthenticated,
  initialSessionResolved,
}: {
  isAuthenticated: boolean;
  initialSessionResolved: boolean;
}) {
  const { path } = useRouter();
  const embedded = useIsMiniappEmbedded();
  const inviteToken = matchInviteToken(path);

  if (!initialSessionResolved) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  // The invite route handles both authenticated and unauthenticated visitors,
  // preserving `/invite/:token` through sign-in so the accept step can continue.
  if (inviteToken) {
    return <InvitePage token={inviteToken} isAuthenticated={isAuthenticated} />;
  }

  if (!isAuthenticated) {
    // Web visitors land on the marketing page at the root; the auth form lives
    // at `/signin`. Deep links (e.g. a shared trip) still route straight to
    // sign-in so the target path survives login, and embedded WeChat sessions
    // skip the landing entirely.
    if (!embedded && path === "/") return <LandingPage />;
    return <AuthPage />;
  }

  return (
    <>
      <Routes />
      <SettingsDialog />
    </>
  );
}

function AppContent({ startsInBootstrap }: { startsInBootstrap: boolean }) {
  const { replace } = useRouter();
  const {
    data: session,
    isPending,
    isRefetching,
    refetch,
  } = useSession();
  const [initialSessionResolved, setInitialSessionResolved] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(startsInBootstrap);
  const isAuthenticated = Boolean(session);
  const sessionBusy = isPending || isRefetching;

  useEffect(() => {
    // Latch after the first definitive result. Later logged-out refetches must
    // not remount AuthForm and erase an in-progress OTP or two-factor step.
    setInitialSessionResolved((current) =>
      resolveInitialSession(current, { isAuthenticated, sessionBusy }),
    );
  }, [isAuthenticated, sessionBusy]);

  const completeBootstrap = useCallback(
    (path: string) => {
      // Internal redirect only: the current WebView must render the target
      // route itself instead of pushing a new native page.
      replace(path);
      setIsBootstrapping(false);
    },
    [replace],
  );

  if (isBootstrapping) {
    return (
      <MiniappBootstrap
        isAuthenticated={isAuthenticated}
        sessionBusy={sessionBusy}
        initialSessionResolved={initialSessionResolved}
        refreshSession={refetch}
        onComplete={completeBootstrap}
      />
    );
  }

  return (
    <Gate
      isAuthenticated={isAuthenticated}
      initialSessionResolved={initialSessionResolved}
    />
  );
}

export function App() {
  const embedded = detectMiniappContainer();

  return (
    <AppProviders embedded={embedded}>
      <RouterProvider>
        <AppContent startsInBootstrap={window.location.pathname === "/miniapp"} />
      </RouterProvider>
    </AppProviders>
  );
}
