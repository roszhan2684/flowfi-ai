import { buildSnapshot } from "@/lib/core/engine";
import { explainDate, SCENARIOS, type Scenario } from "@/lib/core/forecast";
import { bad, json, parseOptions, readJson } from "@/lib/api";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (typeof body === "symbol") return bad("invalid JSON body");
  const { scenario = "base", options, explain } = body as { scenario?: Scenario; options?: unknown; explain?: string };
  if (!SCENARIOS.includes(scenario)) return bad(`unknown scenario "${scenario}"`);
  const opts = parseOptions(options);
  if (typeof opts === "string") return bad(opts);
  const f = buildSnapshot(opts).forecasts[scenario];
  return json(explain ? explainDate(f, explain) ?? { error: "date outside horizon" } : f);
}
