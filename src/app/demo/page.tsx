import type { Metadata } from "next";
import { DemoClient } from "./DemoClient";

export const metadata: Metadata = {
  title: "FlowFi — Live demo",
  description: "Try FlowFi with Northstar Studio, a fictional freelance studio. Forecasts, copilot, approvals and fault lab — all live.",
};

export default function DemoPage() {
  return <DemoClient />;
}
