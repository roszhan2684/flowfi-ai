import { json } from "@/lib/api";
import { MODEL_VERSION } from "@/lib/core/forecast";
import { AGENT_MODEL } from "@/lib/agent/agent";

export function GET() {
  return json({ status: "ok", mode: "demo", forecastModel: MODEL_VERSION, agent: AGENT_MODEL, data: "Northstar Studio (fictional)" });
}
