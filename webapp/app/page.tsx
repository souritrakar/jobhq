import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { TrustStrip } from "@/components/landing/trust-strip";
import { ProductDemo } from "@/components/landing/product-demo";
import { Features } from "@/components/landing/features";
import { Comparison } from "@/components/landing/comparison";
import { WhoItsFor } from "@/components/landing/who-its-for";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <ProductDemo />
        <Features />
        <Comparison />
        <WhoItsFor />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
