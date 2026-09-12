import RelatorioView from "@/components/RelatorioView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Prestação de contas — Apartamento GB",
  robots: { index: false, follow: false },
};

export default function RelatorioPage() {
  return <RelatorioView />;
}
