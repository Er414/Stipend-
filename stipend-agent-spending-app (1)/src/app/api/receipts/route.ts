import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { toEnvioReceipt } from "@/lib/envio";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");

  const rows = accountId
    ? await db
        .select()
        .from(receipts)
        .where(eq(receipts.accountId, accountId))
        .orderBy(desc(receipts.createdAt))
    : await db.select().from(receipts).orderBy(desc(receipts.createdAt));

  return Response.json({
    entity: "StipendAttempt",
    receipts: rows.map(toEnvioReceipt),
  });
}
