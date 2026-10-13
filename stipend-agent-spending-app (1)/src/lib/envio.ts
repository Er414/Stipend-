export type EnvioReceipt = {
  id: string;
  entity: "StipendAttempt";
  chainId: number;
  blockNumber: string | null;
  logIndex: number;
  srcAddress: string | null;
  transaction: { id: string | null };
  timestamp: string;
  params: {
    status: "paid" | "refused";
    reason: string;
    recipient: string;
    amount: string;
    asset: string;
    purpose: string;
    injected: boolean;
    constructed: boolean;
  };
};

export function toEnvioReceipt(row: {
  id: string;
  status: string;
  reason: string;
  recipient: string;
  amount: string;
  asset: string;
  purpose: string;
  injected: boolean;
  constructed: boolean;
  chainId: number;
  blockNumber: string | null;
  txHash: string | null;
  srcAddress: string | null;
  logIndex: number;
  createdAt: Date;
}): EnvioReceipt {
  return {
    id: row.id,
    entity: "StipendAttempt",
    chainId: row.chainId,
    blockNumber: row.blockNumber,
    logIndex: row.logIndex,
    srcAddress: row.srcAddress,
    transaction: { id: row.txHash },
    timestamp: row.createdAt.toISOString(),
    params: {
      status: row.status === "paid" ? "paid" : "refused",
      reason: row.reason,
      recipient: row.recipient,
      amount: row.amount,
      asset: row.asset,
      purpose: row.purpose,
      injected: row.injected,
      constructed: row.constructed,
    },
  };
}
