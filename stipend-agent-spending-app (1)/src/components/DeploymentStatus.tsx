"use client";

import { useCallback, useEffect, useState } from "react";

type Check = { ok: boolean | null; detail: string };
type Status = {
  expectedChainId: number;
  detectedChainId: number | null;
  configuredChainId: number | null;
  addresses: { stipend: string | null; ausd: string | null };
  explorer: string;
  status: Record<string, Check>;
  contract: Record<string, string | boolean | number> | null;
  token: Record<string, string | number> | null;
  mismatches: string[];
};

export function DeploymentStatus({ humanAddress, agentAddress, passkeySource }: {
  humanAddress?: string;
  agentAddress?: string;
  passkeySource?: "webauthn" | "demo";
}) {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/deployment-status", { cache: "no-store" });
      if (!response.ok) throw new Error(`Diagnostics backend returned ${response.status}`);
      setData(await response.json() as Status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostics backend unavailable");
      setData(null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const detected = Boolean(humanAddress && passkeySource === "webauthn");
  const ownerMatches = detected && Boolean(data?.contract?.owner) && String(data?.contract?.owner).toLowerCase() === humanAddress!.toLowerCase();
  const agentMatches = Boolean(agentAddress && data?.contract?.agent) && String(data?.contract?.agent).toLowerCase() === agentAddress!.toLowerCase();
  const rows: Array<[string, Check]> = [
    ["RPC connectivity", data?.status.rpc ?? { ok: null, detail: "Waiting for backend." }],
    ["Chain ID", data?.status.chain ?? { ok: null, detail: "Expected 10143; not yet detected." }],
    ["Addresses configured", data?.status.addresses ?? { ok: null, detail: "Waiting for backend." }],
    ["Stipend bytecode", data?.status.stipendCode ?? { ok: null, detail: "Waiting for backend." }],
    ["Mock AUSD bytecode", data?.status.ausdCode ?? { ok: null, detail: "Waiting for backend." }],
    ["Contract state", data?.status.state ?? { ok: null, detail: "Waiting for backend." }],
    ["Passkey account", { ok: detected, detail: detected ? `Mera WebAuthn address ${humanAddress}; account derivation seen in this session.` : passkeySource === "demo" ? "Local demo account is not a WebAuthn passkey." : "Create or resume with Mera WebAuthn to detect an account." }],
    ["Passkey ownership", { ok: ownerMatches, detail: !data?.contract?.owner ? "Cannot verify owner without a deployed readable Stipend contract." : ownerMatches ? "Contract owner matches this session’s Mera-derived human address; no on-chain signature challenge performed." : "Contract owner does not match the current Mera passkey address, or no real passkey session exists." }],
    ["Agent signing", { ok: false, detail: agentMatches ? "Agent address matches, but no secure on-chain transaction signer is configured." : "No secure on-chain transaction signer is configured; agent identity on contract not verified." }],
    ["Agent token balance", data?.status.agentBalance ?? { ok: null, detail: "Waiting for backend." }],
    ["Stipend allowance", data?.status.allowance ?? { ok: null, detail: "Waiting for backend." }],
    ["Source verification", data?.status.verification ?? { ok: null, detail: "Waiting for backend." }],
    ["Security audit", data?.status.audit ?? { ok: null, detail: "Waiting for backend." }],
  ];
  return (
    <section aria-label="Network and deployment status" className="deployment-panel">
      <div className="deployment-panel-head"><strong>Network &amp; Deployment Status</strong><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Checking…" : "Refresh"}</button></div>
      <p>Monad Testnet · detected {data?.detectedChainId ?? "unknown"} / expected 10143. Read-only checks.</p>
      {error && <p role="alert" className="err">Backend error: {error}</p>}
      {data && <div className="deployment-addresses">
        {(["stipend", "ausd"] as const).map((key) => <div key={key}><span>{key === "ausd" ? "Mock AUSD" : "Stipend"}: </span>{data.addresses[key] ? <a target="_blank" rel="noreferrer" href={`${data.explorer}/address/${data.addresses[key]}`}>{data.addresses[key]}</a> : <span>not configured</span>}</div>)}
      </div>}
      <div className="deployment-checks">{rows.map(([label, item]) => <div className="deployment-check" key={label}>
        <span className={`deployment-indicator ${item.ok === true ? "yes" : item.ok === false ? "no" : "unknown"}`} aria-label={item.ok === true ? "confirmed" : item.ok === false ? "not confirmed" : "unknown"} />
        <div><strong>{label}</strong><small>{item.detail}</small></div>
      </div>)}</div>
      {data?.contract && <p>On-chain: {String(data.contract.spent)} / {String(data.contract.totalCap)} mock AUSD spent · per payment {String(data.contract.perPaymentCap)} · daily {String(data.contract.dailyCap)} · {String(data.contract.hourCount)} / {String(data.contract.maxPerHour)} this hour · revoked {String(data.contract.revoked)}. Payees: {String(data.contract.payeeA)}, {String(data.contract.payeeB)}.</p>}
      <p>Receipts in this demo are local simulations, not blockchain receipts. No deployment or source verification is established without addresses and bytecode.</p>
    </section>
  );
}
