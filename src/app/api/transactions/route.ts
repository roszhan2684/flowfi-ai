import { transactions } from "@/lib/core/dataset";
import { json } from "@/lib/api";

export function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.toLowerCase().slice(0, 80);
  const account = url.searchParams.get("account");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const rows = transactions.filter(
    (t) => (!q || t.merchantName.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) && (!account || t.accountId === account),
  );
  return json({ total: rows.length, items: rows.slice(0, limit) });
}
