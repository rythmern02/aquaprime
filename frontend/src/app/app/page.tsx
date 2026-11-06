import { SiteNav } from "@/components/SiteNav";
import { Playground } from "@/components/app/Playground";

export const metadata = { title: "AquaPrime · Playground" };

export default function AppPage() {
  return (
    <>
      <SiteNav />
      <main><Playground /></main>
    </>
  );
}
