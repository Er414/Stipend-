import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { STARTING_BALANCE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const humanAddress = searchParams.get("humanAddress");

  if (id) {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    if (!row) return Response.json({ error: "Account not found" }, { status: 404 });
    return Response.json({ account: publicAccount(row) });
  }

  if (humanAddress) {
    const [row] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.humanAddress, humanAddress))
      .limit(1);
    if (!row) return Response.json({ error: "Account not found" }, { status: 404 });
    return Response.json({ account: publicAccount(row) });
  }

  const rows = await db.select().from(accounts);
  return Response.json({ accounts: rows.map(publicAccount) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    credentialId?: string;
    humanAddress?: string;
    agentAddress?: string;
  };

  if (!body.credentialId || !body.humanAddress || !body.agentAddress) {
    return Response.json({ error: "Missing account fields" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.humanAddress, body.humanAddress))
    .limit(1);

  if (existing) {
    return Response.json({ account: publicAccount(existing) });
  }

  const [created] = await db
    .insert(accounts)
    .values({
      credentialId: body.credentialId,
      humanAddress: body.humanAddress,
      agentAddress: body.agentAddress,
      agentPrivateKeyHex: null,
      ausdBalance: STARTING_BALANCE,
    })
    .returning();

  return Response.json({ account: publicAccount(created) });
}

function publicAccount(row: typeof accounts.$inferSelect) {
  return {
    id: row.id,
    credentialId: row.credentialId,
    humanAddress: row.humanAddress,
    agentAddress: row.agentAddress,
    ausdBalance: row.ausdBalance,
    agentRevoked: Boolean(row.agentRevokedAt),
    hasAgentKey: Boolean(row.agentPrivateKeyHex) && !row.agentRevokedAt,
    createdAt: row.createdAt,
  };
}
