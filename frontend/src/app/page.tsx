import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/landing/Hero";
import { Field } from "@/components/landing/Field";
import { Pillars } from "@/components/landing/Pillars";
import { CrashSimulator } from "@/components/landing/CrashSimulator";
import { VmPipeline, LiveNetwork, KeeperStory, Trust, FinalCta, Footer } from "@/components/landing/Sections";

export default function Landing() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Field />
        <Pillars />
        <CrashSimulator />
        <VmPipeline />
        <LiveNetwork />
        <KeeperStory />
        <Trust />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
