import { Hero } from "@/components/landing/Hero";
import { Nav } from "@/components/landing/Nav";
import { PhoneStory } from "@/components/landing/PhoneStory";
import { Receipts } from "@/components/landing/Receipts";
import { Approve, FinalCTA, Footer, Marquee, Reliability, Score, Stack } from "@/components/landing/Sections";

export default function Home() {
  return (
    <main className="overflow-x-clip">
      <Nav />
      <Hero />
      <Marquee />
      <PhoneStory />
      <Receipts />
      <Approve />
      <Score />
      <Reliability />
      <Stack />
      <FinalCTA />
      <Footer />
    </main>
  );
}
