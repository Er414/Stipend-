import { isAddress, getAddress } from "viem";
import { amountsEqual, toAusdUnits } from "./money";

export type FrozenQuote = {
  recipient: string;
  amount: string;
  assetHash: string;
};

export type PolicyInput = {
  remaining: string;
  perPaymentCap: string;
  dailyCap: string;
  dailySpent: string;
  maxPaymentsPerHour: number;
  paymentsLastHour: number;
  allowlist: string[];
  expiresAt: Date;
  agentRevoked: boolean;
  frozenQuote: FrozenQuote | null;
  now?: Date;
};

export type PaymentAttempt = {
  recipient: string;
  amount: string;
  asset: string;
  assetHash: string;
};

export type PolicyDecision =
  | { ok: true; reason: "paid, inside the stipend"; code: "ALLOW" }
  | { ok: false; reason: string; code: string };

function checksumOrRaw(value: string): string {
  if (isAddress(value)) return getAddress(value);
  return value.trim();
}

function onAllowlist(recipient: string, allowlist: string[]): boolean {
  if (!isAddress(recipient)) return false;
  const needle = getAddress(recipient);
  return allowlist.some((item) => isAddress(item) && getAddress(item) === needle);
}

export function evaluatePolicy(
  policy: PolicyInput,
  attempt: PaymentAttempt,
): PolicyDecision {
  const now = policy.now ?? new Date();

  if (policy.agentRevoked) {
    return { ok: false, reason: "refused, agent key revoked", code: "REVOKED" };
  }

  if (now.getTime() > policy.expiresAt.getTime()) {
    return { ok: false, reason: "refused, stipend expired", code: "EXPIRED" };
  }

  const recipient = checksumOrRaw(attempt.recipient);

  if (!onAllowlist(recipient, policy.allowlist)) {
    return {
      ok: false,
      reason: "refused, recipient not on the allowlist",
      code: "ALLOWLIST",
    };
  }

  if (policy.frozenQuote) {
    const lockedRecipient = checksumOrRaw(policy.frozenQuote.recipient);
    if (recipient !== lockedRecipient) {
      return {
        ok: false,
        reason: "refused, recipient does not match the frozen quote",
        code: "QUOTE_LOCK_RECIPIENT",
      };
    }
    if (!amountsEqual(attempt.amount, policy.frozenQuote.amount)) {
      return {
        ok: false,
        reason: "refused, amount does not match the frozen quote",
        code: "QUOTE_LOCK_AMOUNT",
      };
    }
    if (attempt.assetHash !== policy.frozenQuote.assetHash) {
      return {
        ok: false,
        reason: "refused, asset does not match the frozen quote",
        code: "QUOTE_LOCK_ASSET",
      };
    }
  }

  let amount: bigint;
  try {
    amount = toAusdUnits(attempt.amount);
  } catch {
    return { ok: false, reason: "refused, invalid amount", code: "INVALID_AMOUNT" };
  }
  if (amount <= BigInt(0) || attempt.asset !== "AUSD") {
    return { ok: false, reason: "refused, invalid amount or asset", code: "INVALID_PAYMENT" };
  }

  if (amount > toAusdUnits(policy.perPaymentCap)) {
    return {
      ok: false,
      reason: "refused, amount exceeds the per-payment cap",
      code: "PER_PAYMENT_CAP",
    };
  }

  if (amount + toAusdUnits(policy.dailySpent) > toAusdUnits(policy.dailyCap)) {
    return {
      ok: false,
      reason: "refused, amount exceeds the daily cap",
      code: "DAILY_CAP",
    };
  }

  if (policy.paymentsLastHour >= policy.maxPaymentsPerHour) {
    return {
      ok: false,
      reason: "refused, payment-count cap reached for this hour",
      code: "RATE_CAP",
    };
  }

  if (amount > toAusdUnits(policy.remaining)) {
    return {
      ok: false,
      reason: "refused, amount exceeds remaining stipend",
      code: "STIPEND",
    };
  }

  return { ok: true, reason: "paid, inside the stipend", code: "ALLOW" };
}
