import { useCallback, useState } from "react";
import { AppProviders } from "./providers";
import { RouterProvider, useRouter, matchTripId, matchInviteToken } from "./router";
import { detectMiniappContainer } from "./embedded-environment";
import { MiniappBootstrap } from "./MiniappBootstrap";
import { useSession } from "@/shared/auth";
import { Spinner } from "@/shared/ui/spinner";
import { AuthPage } from "@/pages/auth";
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

function Gate() {
  const { path } = useRouter();
  const inviteToken = matchInviteToken(path);
  // Better Auth sets isPending during logged-out refetches (e.g. after
  // sign-up). Only block the tree on the initial resolve so AuthForm keeps
  // its OTP step instead of remounting back to credentials.
  const { data: session, isPending, isRefetching } = useSession();

  if (isPending && !isRefetching) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  // The invite route handles both authenticated and unauthenticated visitors,
  // preserving `/invite/:token` through sign-in so the accept step can continue.
  if (inviteToken) return <InvitePage token={inviteToken} />;

  if (!session) return <AuthPage />;

  return (
    <>
      <Routes />
      <SettingsDialog />
    </>
  );
}

function AppContent({ startsInBootstrap }: { startsInBootstrap: boolean }) {
  const { navigate } = useRouter();
  const [isBootstrapping, setIsBootstrapping] = useState(startsInBootstrap);
  const completeBootstrap = useCallback(() => {
    navigate("/");
    setIsBootstrapping(false);
  }, [navigate]);

  if (isBootstrapping) {
    return <MiniappBootstrap onComplete={completeBootstrap} />;
  }

  return <Gate />;
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
