import { formatUnits, parseUnits } from "viem";
import { AUSD_DECIMALS } from "./constants";

export function toAusdUnits(amount: string | number): bigint {
  const normalized = typeof amount === "number" ? amount.toFixed(6) : amount.trim();
  return parseUnits(normalized, AUSD_DECIMALS);
}

export function fromAusdUnits(units: bigint): string {
  const raw = formatUnits(units, AUSD_DECIMALS);
  const [whole, fraction = ""] = raw.split(".");
  const cents = (fraction + "00").slice(0, 2);
  return `${whole}.${cents}`;
}

export function formatAusd(amount: string | number): string {
  const units = toAusdUnits(amount);
  return fromAusdUnits(units);
}

export function amountsEqual(a: string, b: string): boolean {
  return toAusdUnits(a) === toAusdUnits(b);
}
