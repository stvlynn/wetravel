import { AppProviders } from "./providers";
import { RouterProvider, useRouter, matchTripId, matchInviteToken } from "./router";
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
  const { data: session, isPending } = useSession();

  if (isPending) {
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

export function App() {
  return (
    <AppProviders>
      <RouterProvider>
        <Gate />
      </RouterProvider>
    </AppProviders>
  );
}
