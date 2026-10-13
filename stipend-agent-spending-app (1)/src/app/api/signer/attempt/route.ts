import { and, eq, gte } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { db } from "@/db";
import { accounts, quotes, receipts, stipends } from "@/db/schema";
import { ATTACK_ADDRESS } from "@/lib/constants";
import { toEnvioReceipt } from "@/lib/envio";
import { fromAusdUnits, toAusdUnits } from "@/lib/money";
import { assetHashForAusd, latestBlockNumber } from "@/lib/monad";
import { evaluatePolicy } from "@/lib/policy";
import { constructAusdTransfer } from "@/lib/transaction";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    accountId?: string;
    stipendId?: string;
    quoteId?: string;
    recipient?: string;
    amount?: string;
    purpose?: string;
    injected?: boolean;
  };

  if (!body.accountId || !body.stipendId || !body.recipient || !body.amount) {
    return Response.json({ error: "Missing attempt fields" }, { status: 400 });
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, body.accountId))
    .limit(1);
  const [stipend] = await db
    .select()
    .from(stipends)
    .where(eq(stipends.id, body.stipendId))
    .limit(1);

  if (!account || !stipend || stipend.accountId !== account.id) {
    return Response.json({ error: "Account or stipend missing or mismatched" }, { status: 404 });
  }

  let frozenQuote: {
    recipient: string;
    amount: string;
    assetHash: string;
  } | null = null;

  if (body.quoteId) {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, body.quoteId))
      .limit(1);
    if (!quote || !quote.frozen || quote.stipendId !== stipend.id) {
      return Response.json({ error: "Quote is not frozen for this stipend" }, { status: 400 });
    }
    if (quote.frozen) {
      frozenQuote = {
        recipient: quote.recipient,
        amount: quote.amount,
        assetHash: quote.assetHash,
      };
    }
  }

  const recipient = normalizeRecipient(body.recipient);
  const amount = body.amount;
  const assetHash = assetHashForAusd();

  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const paidToday = await db
    .select()
    .from(receipts)
    .where(
      and(
        eq(receipts.stipendId, stipend.id),
        eq(receipts.status, "paid"),
        gte(receipts.createdAt, dayStart),
      ),
    );

  const paidLastHour = await db
    .select()
    .from(receipts)
    .where(
      and(
        eq(receipts.stipendId, stipend.id),
        eq(receipts.status, "paid"),
        gte(receipts.createdAt, hourAgo),
      ),
    );

  const dailySpent = paidToday.reduce(
    (sum, row) => sum + toAusdUnits(row.amount),
    BigInt(0),
  );

  const decision = evaluatePolicy(
    {
      remaining: stipend.remaining,
      perPaymentCap: stipend.perPaymentCap,
      dailyCap: stipend.dailyCap,
      dailySpent: fromAusdUnits(dailySpent),
      maxPaymentsPerHour: stipend.maxPaymentsPerHour,
      paymentsLastHour: paidLastHour.length,
      allowlist: [stipend.payeeDataApi, stipend.payeeAgent],
      expiresAt: stipend.expiresAt,
      agentRevoked: Boolean(account.agentRevokedAt),
      frozenQuote,
      now,
    },
    {
      recipient,
      amount,
      asset: "AUSD",
      assetHash,
    },
  );

  if (!decision.ok) {
    const receipt = await writeReceipt({
      account,
      stipendId: stipend.id,
      quoteId: body.quoteId ?? null,
      status: "refused",
      reason: decision.reason,
      recipient,
      amount,
      purpose: body.purpose ?? "payment",
      injected: Boolean(body.injected),
      constructed: false,
      txHash: null,
    });

    return Response.json({
      ok: false,
      constructed: false,
      transaction: null,
      decision,
      receipt: toEnvioReceipt(receipt),
    });
  }

  if (!isAddress(recipient)) {
    const receipt = await writeReceipt({
      account,
      stipendId: stipend.id,
      quoteId: body.quoteId ?? null,
      status: "refused",
      reason: "refused, recipient not on the allowlist",
      recipient,
      amount,
      purpose: body.purpose ?? "payment",
      injected: Boolean(body.injected),
      constructed: false,
      txHash: null,
    });
    return Response.json({
      ok: false,
      constructed: false,
      transaction: null,
      decision: {
        ok: false,
        reason: "refused, recipient not on the allowlist",
        code: "ALLOWLIST",
      },
      receipt: toEnvioReceipt(receipt),
    });
  }

  // No secure on-chain signer is configured. Do not sign, broadcast, or fabricate a hash.
  // Constructing calldata is only a local simulation after policy approval.
  const transaction = constructAusdTransfer(getAddress(recipient), amount);
  const txHash: string | null = null;

  const nextRemaining = fromAusdUnits(
    toAusdUnits(stipend.remaining) - toAusdUnits(amount),
  );
  const nextBalance = fromAusdUnits(
    toAusdUnits(account.ausdBalance) - toAusdUnits(amount),
  );

  await db
    .update(stipends)
    .set({ remaining: nextRemaining })
    .where(eq(stipends.id, stipend.id));
  await db
    .update(accounts)
    .set({ ausdBalance: nextBalance })
    .where(eq(accounts.id, account.id));

  const receipt = await writeReceipt({
    account,
    stipendId: stipend.id,
    quoteId: body.quoteId ?? null,
    status: "paid",
    reason: "simulated policy approval, no on-chain payment was sent",
    recipient,
    amount,
    purpose: body.purpose ?? "payment",
    injected: Boolean(body.injected),
    constructed: false,
    txHash,
  });

  return Response.json({
    ok: true,
    constructed: false,
    simulated: true,
    transaction,
    decision,
    remaining: nextRemaining,
    ausdBalance: nextBalance,
    receipt: toEnvioReceipt(receipt),
  });
}

function normalizeRecipient(value: string): string {
  if (/attack/i.test(value)) return ATTACK_ADDRESS;
  if (isAddress(value)) return getAddress(value);
  return value.trim();
}

async function writeReceipt(input: {
  account: typeof accounts.$inferSelect;
  stipendId: string;
  quoteId: string | null;
  status: "paid" | "refused";
  reason: string;
  recipient: string;
  amount: string;
  purpose: string;
  injected: boolean;
  constructed: boolean;
  txHash: string | null;
}) {
  const blockNumber = await latestBlockNumber();
  const [created] = await db
    .insert(receipts)
    .values({
      accountId: input.account.id,
      stipendId: input.stipendId,
      quoteId: input.quoteId,
      status: input.status,
      reason: input.reason,
      recipient: input.recipient,
      amount: input.amount,
      asset: "AUSD",
      purpose: input.purpose,
      injected: input.injected,
      constructed: input.constructed,
      chainId: 10143,
      blockNumber,
      txHash: input.txHash,
      srcAddress: input.account.agentAddress,
      logIndex: 0,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to persist receipt");
  }
  return created;
}
