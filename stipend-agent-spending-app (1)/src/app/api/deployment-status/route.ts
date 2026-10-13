import { createPublicClient, formatUnits, http, isAddress, parseAbi } from "viem";
import { monadTestnet } from "viem/chains";

export const dynamic = "force-dynamic";

const EXPECTED_RPC = "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadexplorer.com";
const stipendAbi = parseAbi([
  "function owner() view returns (address)",
  "function agent() view returns (address)",
  "function ausd() view returns (address)",
  "function totalCap() view returns (uint256)",
  "function perPaymentCap() view returns (uint256)",
  "function dailyCap() view returns (uint256)",
  "function maxPerHour() view returns (uint256)",
  "function spent() view returns (uint256)",
  "function daySpent() view returns (uint256)",
  "function hourCount() view returns (uint256)",
  "function revoked() view returns (bool)",
  "function payeeA() view returns (address)",
  "function payeeB() view returns (address)",
]);
const ausdAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

type Check = { ok: boolean | null; detail: string };
const check = (ok: boolean | null, detail: string): Check => ({ ok, detail });
const errorText = (e: unknown) => e instanceof Error ? ("shortMessage" in e && typeof e.shortMessage === "string" ? e.shortMessage : e.message.split("\n")[0]) : "Unknown read error";

export async function GET() {
  const rawStipend = process.env.VITE_STIPEND_ADDRESS;
  const rawAusd = process.env.VITE_AUSD_ADDRESS;
  const stipend = rawStipend && isAddress(rawStipend) ? rawStipend as `0x${string}` : null;
  const ausd = rawAusd && isAddress(rawAusd) ? rawAusd as `0x${string}` : null;
  const rpc = process.env.VITE_RPC_URL || EXPECTED_RPC;
  const configuredChainId = process.env.VITE_CHAIN_ID ? Number(process.env.VITE_CHAIN_ID) : null;
  const status: Record<string, Check> = {
    rpc: check(null, "Checking Monad Testnet RPC."),
    chain: check(null, "Expected 10143; not yet detected."),
    addresses: check(stipend && ausd ? null : false, stipend && ausd ? "Addresses are syntactically valid; awaiting bytecode and token-reference checks." : "Set VITE_STIPEND_ADDRESS and VITE_AUSD_ADDRESS to deployed testnet contracts."),
    stipendCode: check(null, stipend ? "Checking bytecode." : "No Stipend address configured."),
    ausdCode: check(null, ausd ? "Checking bytecode." : "No AUSD address configured."),
    state: check(null, "No deployed contract state read."),
    agentBalance: check(null, "Agent balance requires deployed contract state."),
    allowance: check(null, "Allowance requires deployed contract state."),
    verification: check(null, "Cannot check source verification without a deployed address."),
    audit: check(false, "V1 has no escrow and cannot enforce spending on agent-held tokens; V2 is local only."),
    signing: check(false, "No safe on-chain agent transaction signer is configured. Demo attempts are simulated."),
  };
  const result: {
    expectedChainId: number;
    detectedChainId: number | null;
    configuredChainId: number | null;
    rpcUrl: string;
    explorer: string;
    addresses: { stipend: string | null; ausd: string | null };
    status: Record<string, Check>;
    contract: Record<string, string | number | boolean> | null;
    token: Record<string, string | number> | null;
    mismatches: string[];
  } = {
    expectedChainId: 10143, detectedChainId: null, configuredChainId,
    rpcUrl: rpc, explorer: EXPLORER,
    addresses: { stipend, ausd }, status, contract: null, token: null, mismatches: [],
  };
  if (monadTestnet.id !== 10143) {
    status.chain = check(false, "Installed viem monadTestnet chain ID is not 10143; stopped.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  if (configuredChainId !== null && configuredChainId !== 10143) {
    status.chain = check(false, `Configured chain ID ${configuredChainId} is not 10143; stopped.`);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  if (rpc !== EXPECTED_RPC) {
    status.rpc = check(false, "Configured RPC differs from the required Monad Testnet RPC; stopped without connecting.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  const client = createPublicClient({ chain: monadTestnet, transport: http(rpc, { timeout: 8000, retryCount: 0 }) });
  try {
    const id = await client.getChainId();
    result.detectedChainId = id;
    status.rpc = check(true, "RPC responded to eth_chainId.");
    status.chain = check(id === 10143, `Detected ${id}; expected 10143.`);
    if (id !== 10143) return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    status.rpc = check(false, `Network error: ${errorText(e)}`);
    status.chain = check(null, "Chain ID unavailable due to network error.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }

  for (const [key, address] of [["stipendCode", stipend], ["ausdCode", ausd]] as const) {
    if (!address) { status[key] = check(false, "Address missing; bytecode not checked."); continue; }
    try {
      const code = await client.getCode({ address });
      status[key] = check(Boolean(code && code !== "0x"), code && code !== "0x" ? `Deployed bytecode detected (${(code.length - 2) / 2} bytes).` : "No bytecode at this address (eth_getCode returned 0x).");
    } catch (e) { status[key] = check(null, `Network/read error: ${errorText(e)}`); }
  }
  if (status.stipendCode.ok !== true || status.ausdCode.ok !== true || !stipend || !ausd) {
    status.state = check(false, "State unavailable until both contracts have confirmed bytecode.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const readS = async (functionName: (typeof stipendAbi)[number]["name"]) => client.readContract({ address: stipend, abi: stipendAbi, functionName });
    const [owner, agent, tokenAddress, totalCap, perPaymentCap, dailyCap, maxPerHour, spent, daySpent, hourCount, revoked, payeeA, payeeB] = await Promise.all([
      readS("owner"), readS("agent"), readS("ausd"), readS("totalCap"), readS("perPaymentCap"), readS("dailyCap"), readS("maxPerHour"), readS("spent"), readS("daySpent"), readS("hourCount"), readS("revoked"), readS("payeeA"), readS("payeeB"),
    ]);
    const [name, symbol, decimals, totalSupply, balance, allowance] = await Promise.all([
      client.readContract({ address: ausd, abi: ausdAbi, functionName: "name" }),
      client.readContract({ address: ausd, abi: ausdAbi, functionName: "symbol" }),
      client.readContract({ address: ausd, abi: ausdAbi, functionName: "decimals" }),
      client.readContract({ address: ausd, abi: ausdAbi, functionName: "totalSupply" }),
      client.readContract({ address: ausd, abi: ausdAbi, functionName: "balanceOf", args: [agent as `0x${string}`] }),
      client.readContract({ address: ausd, abi: ausdAbi, functionName: "allowance", args: [agent as `0x${string}`, stipend] }),
    ]);
    const d = Number(decimals);
    result.contract = { owner: String(owner), agent: String(agent), ausd: String(tokenAddress), totalCap: formatUnits(BigInt(totalCap as bigint), d), perPaymentCap: formatUnits(BigInt(perPaymentCap as bigint), d), dailyCap: formatUnits(BigInt(dailyCap as bigint), d), maxPerHour: String(maxPerHour), spent: formatUnits(BigInt(spent as bigint), d), daySpent: formatUnits(BigInt(daySpent as bigint), d), hourCount: String(hourCount), revoked: Boolean(revoked), payeeA: String(payeeA), payeeB: String(payeeB) };
    result.token = { name: String(name), symbol: String(symbol), decimals: d, totalSupply: formatUnits(totalSupply, d), agentBalance: formatUnits(balance, d), stipendAllowance: formatUnits(allowance, d) };
    if (String(tokenAddress).toLowerCase() !== ausd.toLowerCase()) result.mismatches.push("Stipend token does not match configured AUSD address.");
    if (BigInt(totalCap as bigint) !== BigInt(20_000_000)) result.mismatches.push("Total cap is not 20 AUSD.");
    if (BigInt(perPaymentCap as bigint) !== BigInt(2_000_000)) result.mismatches.push("Per-payment cap is not 2 AUSD.");
    if (BigInt(dailyCap as bigint) !== BigInt(20_000_000)) result.mismatches.push("Daily cap is not 20 AUSD.");
    if (BigInt(maxPerHour as bigint) !== BigInt(3)) result.mismatches.push("Hourly limit is not 3.");
    if (d !== 6) result.mismatches.push("Token decimals are not 6.");
    status.addresses = check(String(tokenAddress).toLowerCase() === ausd.toLowerCase(), String(tokenAddress).toLowerCase() === ausd.toLowerCase() ? "Both addresses have bytecode and the Stipend token matches configured mock AUSD." : "Stipend token reference does not match configured AUSD address.");
    status.state = check(result.mismatches.length === 0, result.mismatches.length ? result.mismatches.join(" ") : "All V1 state fields read; expected caps, decimals and token match.");
    status.agentBalance = check(balance >= BigInt(20_000_000), `${formatUnits(balance, d)} mock AUSD in the agent wallet; not contract escrow.`);
    status.allowance = check(allowance >= BigInt(20_000_000), `${formatUnits(allowance, d)} mock AUSD approved for Stipend.`);
  } catch (e) {
    status.state = check(false, `Contract read failed (ABI mismatch or RPC error): ${errorText(e)}`);
  }
  // No verification claim without a reliable Sourcify artifact match.
  status.verification = check(null, "Source verification not confirmed; check the explorer or Sourcify using the deployed address.");
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
