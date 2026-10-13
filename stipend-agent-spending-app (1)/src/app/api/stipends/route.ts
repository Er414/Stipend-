import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stipends } from "@/db/schema";
import { PAYEES } from "@/lib/constants";
import { formatAusd } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  if (!accountId) {
    return Response.json({ error: "accountId required" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(stipends)
    .where(eq(stipends.accountId, accountId))
    .orderBy(desc(stipends.createdAt))
    .limit(1);

  if (!row) return Response.json({ stipend: null });
  return Response.json({ stipend: row });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    accountId?: string;
    amount?: string;
    perPaymentCap?: string;
    dailyCap?: string;
    maxPaymentsPerHour?: number;
    expiresAt?: string;
  };

  if (!body.accountId || !body.amount || !body.perPaymentCap || !body.dailyCap) {
    return Response.json({ error: "Missing stipend fields" }, { status: 400 });
  }

  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  const amount = formatAusd(body.amount);
  const [created] = await db
    .insert(stipends)
    .values({
      accountId: body.accountId,
      amount,
      remaining: amount,
      perPaymentCap: formatAusd(body.perPaymentCap),
      dailyCap: formatAusd(body.dailyCap),
      maxPaymentsPerHour: Number(body.maxPaymentsPerHour ?? 4),
      payeeDataApi: PAYEES.dataApi.address,
      payeeAgent: PAYEES.labeledAgent.address,
      expiresAt,
    })
    .returning();

  return Response.json({ stipend: created });
}
