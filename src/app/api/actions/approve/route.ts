import { executeAction, type Approval } from "@/lib/agent/actions";
import type { ProposedAction } from "@/lib/agent/tools";
import { bad, json, readJson } from "@/lib/api";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (typeof body === "symbol") return bad("invalid JSON body");
  const { action, approval } = body as { action?: ProposedAction; approval?: Approval };
  const result = executeAction(action as ProposedAction, approval ?? null);
  return json(result, { status: result.ok ? 200 : 422 });
}
