import { runFaultLab } from "@/lib/core/faultlab";
import { json } from "@/lib/api";

export async function POST() {
  return json(await runFaultLab());
}
