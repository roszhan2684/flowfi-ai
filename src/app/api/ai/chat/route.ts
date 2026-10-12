import { runAgent } from "@/lib/agent/agent";
import { bad, json, parseOptions, readJson } from "@/lib/api";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (typeof body === "symbol") return bad("invalid JSON body");
  const { message, options } = body as { message?: unknown; options?: unknown };
  if (typeof message !== "string" || !message.trim()) return bad("message is required");
  if (message.length > 500) return bad("message too long (max 500 chars)");
  const opts = parseOptions(options);
  if (typeof opts === "string") return bad(opts);
  return json(runAgent(message.trim(), opts));
}
