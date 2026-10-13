import { eq } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { db } from "@/db";
import { quotes } from "@/db/schema";
import { assetHashForAusd } from "@/lib/monad";
import { formatAusd } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    stipendId?: string;
    recipient?: string;
    recipientLabel?: string;
    amount?: string;
    purpose?: string;
    freeze?: boolean;
  };

  if (!body.stipendId || !body.recipient || !body.amount) {
    return Response.json({ error: "Missing quote fields" }, { status: 400 });
  }

  const recipient = isAddress(body.recipient)
    ? getAddress(body.recipient)
    : body.recipient;

  const [created] = await db
    .insert(quotes)
    .values({
      stipendId: body.stipendId,
      recipient,
      recipientLabel: body.recipientLabel ?? recipient,
      amount: formatAusd(body.amount),
      asset: "AUSD",
      assetHash: assetHashForAusd(),
      purpose: body.purpose ?? "payment",
      frozen: Boolean(body.freeze),
    })
    .returning();

  return Response.json({ quote: created });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { quoteId?: string };
  if (!body.quoteId) {
    return Response.json({ error: "quoteId required" }, { status: 400 });
  }

  const [updated] = await db
    .update(quotes)
    .set({ frozen: true })
    .where(eq(quotes.id, body.quoteId))
    .returning();

  if (!updated) return Response.json({ error: "Quote not found" }, { status: 404 });
  return Response.json({ quote: updated });
}
