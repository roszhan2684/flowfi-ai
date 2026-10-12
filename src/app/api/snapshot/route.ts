import { buildSnapshot } from "@/lib/core/engine";
import { bad, json, parseOptions, readJson } from "@/lib/api";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (typeof body === "symbol") return bad("invalid JSON body");
  const opts = parseOptions((body as { options?: unknown }).options);
  if (typeof opts === "string") return bad(opts);
  const t0 = performance.now();
  const snapshot = buildSnapshot(opts);
  return json({ ...snapshot, computeMs: Math.round((performance.now() - t0) * 100) / 100 });
}
