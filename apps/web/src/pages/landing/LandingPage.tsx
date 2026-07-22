import { useRouter } from "@/app/router";
import { LandingHeader } from "./ui/LandingHeader";
import { Hero } from "./ui/Hero";
import { FactsStrip } from "./ui/FactsStrip";
import { FeatureShowcase } from "./ui/FeatureShowcase";
import { MobileShowcase } from "./ui/MobileShowcase";
import { CallToAction } from "./ui/CallToAction";
import { LandingFooter } from "./ui/LandingFooter";

/** Public marketing surface for signed-out web visitors. Every CTA routes to
 * the sign-in page, where the seeded demo trip is waiting. */
export function LandingPage() {
  const { navigate } = useRouter();
  const goToSignIn = () => navigate("/signin");

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      <LandingHeader onSignIn={goToSignIn} />
      <main>
        <Hero onGetStarted={goToSignIn} />
        <FactsStrip />
        <div className="mt-24 sm:mt-32">
          <FeatureShowcase />
        </div>
        <div className="mt-24 sm:mt-32">
          <MobileShowcase />
        </div>
        <div className="mt-24 sm:mt-32">
          <CallToAction onGetStarted={goToSignIn} />
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
