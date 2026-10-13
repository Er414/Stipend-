import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { accountId?: string };
  if (!body.accountId) {
    return Response.json({ error: "accountId required" }, { status: 400 });
  }

  const [updated] = await db
    .update(accounts)
    .set({
      agentPrivateKeyHex: null,
      agentRevokedAt: new Date(),
    })
    .where(eq(accounts.id, body.accountId))
    .returning();

  if (!updated) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    account: {
      id: updated.id,
      agentAddress: updated.agentAddress,
      agentRevoked: true,
      hasAgentKey: false,
    },
  });
}
