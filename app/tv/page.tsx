import type { Metadata, Viewport } from "next";
import TvDashboard from "./tv-dashboard";

export const metadata: Metadata = {
  title: "Rigtech | Operations display",
  description: "Live read-only operations dashboard for the Rigtech office display.",
};

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
};

export default function TvPage() {
  return <TvDashboard />;
}
