import { AppProviders } from "./providers";
import { RouterProvider, useRouter, matchTripId } from "./router";
import { useSession } from "@/shared/auth";
import { Spinner } from "@/shared/ui/spinner";
import { AuthPage } from "@/pages/auth";
import { TripsPage } from "@/pages/trips";
import { TravelPlannerPage } from "@/pages/travel-planner";
import { cn, useEnterOnUpdate } from "@/shared/lib";

function Routes() {
  const { path } = useRouter();
  const tripId = matchTripId(path);
  const routeKey = tripId ?? "trips";
  const routeEnter = useEnterOnUpdate(routeKey);

  return (
    <div className={cn("h-dvh", routeEnter && "wf-enter")} key={routeKey}>
      {tripId ? <TravelPlannerPage tripId={tripId} /> : <TripsPage />}
    </div>
  );
}

function Gate() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!session) return <AuthPage />;

  return (
    <RouterProvider>
      <Routes />
    </RouterProvider>
  );
}

export function App() {
  return (
    <AppProviders>
      <Gate />
    </AppProviders>
  );
}
