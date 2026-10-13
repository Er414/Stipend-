"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_JOB,
  DEFAULT_STIPEND,
  HOSTILE_PAGE,
  PAYEES,
} from "@/lib/constants";
import { api, shortAddress } from "@/lib/api";
import {
  createPasskeyAccount,
  demoAuthenticatorAccount,
  resumePasskeyAccount,
  webAuthnAvailable,
} from "@/lib/passkey";
import type { EnvioReceipt } from "@/lib/envio";
import type { AgentProposal } from "@/lib/qwen";
import { LandingHero } from "@/components/LandingHero";
import { DeploymentStatus } from "@/components/DeploymentStatus";

type Step =
  | "landing"
  | "passkey"
  | "stipend"
  | "agent"
  | "job"
  | "refusal"
  | "receipts"
  | "revoke";

type Account = {
  id: string;
  credentialId: string;
  humanAddress: string;
  agentAddress: string;
  ausdBalance: string;
  agentRevoked: boolean;
  hasAgentKey: boolean;
  source?: "webauthn" | "demo";
};

type Stipend = {
  id: string;
  amount: string;
  remaining: string;
  perPaymentCap: string;
  dailyCap: string;
  maxPaymentsPerHour: number;
  payeeDataApi: string;
  payeeAgent: string;
  expiresAt: string;
};

type Quote = {
  id: string;
  recipient: string;
  recipientLabel: string;
  amount: string;
  asset: string;
  assetHash: string;
  purpose: string;
  frozen: boolean;
};

const STEPS: Step[] = [
  "landing",
  "passkey",
  "stipend",
  "agent",
  "job",
  "refusal",
  "receipts",
  "revoke",
];

export function StipendApp() {
  const [step, setStep] = useState<Step>("landing");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [stipend, setStipend] = useState<Stipend | null>(null);
  const [form, setForm] = useState(DEFAULT_STIPEND);
  const [job, setJob] = useState(DEFAULT_JOB);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [paid, setPaid] = useState(false);
  const [hostile, setHostile] = useState(HOSTILE_PAGE);
  const [injection, setInjection] = useState<AgentProposal | null>(null);
  const [refusal, setRefusal] = useState<EnvioReceipt | null>(null);
  const [stamp, setStamp] = useState(false);
  const [receipts, setReceipts] = useState<EnvioReceipt[]>([]);

  const fill = useMemo(() => {
    if (!stipend) return 0;
    const amount = Number(stipend.amount);
    if (!amount) return 0;
    return Math.max(0, Math.min(1, Number(stipend.remaining) / amount));
  }, [stipend]);

  async function refreshReceipts(accountId?: string) {
    const query = accountId ? `?accountId=${accountId}` : "";
    const data = await api<{ receipts: EnvioReceipt[] }>(`/api/receipts${query}`);
    setReceipts(data.receipts);
  }

  useEffect(() => {
    void refreshReceipts(account?.id).catch(() => undefined);
  }, [account?.id, step]);

  function go(next: Step) {
    setError("");
    setStep(next);
  }

  async function onCreatePasskey() {
    setBusy(true);
    setError("");
    try {
      let session;
      try {
        session = webAuthnAvailable()
          ? await createPasskeyAccount()
          : await demoAuthenticatorAccount();
      } catch {
        session = await demoAuthenticatorAccount();
      }
      const data = await api<{ account: Account }>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          credentialId: session.credentialId,
          humanAddress: session.humanAddress,
          agentAddress: session.agentAddress,
        }),
      });
      setAccount({ ...data.account, source: session.source });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResumePasskey() {
    setBusy(true);
    setError("");
    try {
      let session;
      try {
        session = webAuthnAvailable()
          ? await resumePasskeyAccount()
          : await demoAuthenticatorAccount();
      } catch {
        session = await demoAuthenticatorAccount();
      }
      const data = await api<{ account: Account }>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          credentialId: session.credentialId,
          humanAddress: session.humanAddress,
          agentAddress: session.agentAddress,
        }),
      });
      setAccount({ ...data.account, source: session.source });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSealStipend() {
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const data = await api<{ stipend: Stipend }>("/api/stipends", {
        method: "POST",
        body: JSON.stringify({
          accountId: account.id,
          ...form,
          expiresAt,
        }),
      });
      setStipend(data.stipend);
      go("agent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seal stipend");
    } finally {
      setBusy(false);
    }
  }

  async function onPropose(page?: string) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ proposal: AgentProposal }>("/api/agent/propose", {
        method: "POST",
        body: JSON.stringify({ job, page }),
      });
      if (page) {
        setInjection(data.proposal);
        setStamp(false);
        setRefusal(null);
      } else {
        setProposal(data.proposal);
      }
      return data.proposal;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qwen did not answer");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onFreeze() {
    if (!stipend || !proposal) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ quote: Quote }>("/api/quotes", {
        method: "POST",
        body: JSON.stringify({
          stipendId: stipend.id,
          recipient: proposal.recipient,
          recipientLabel: proposal.recipientLabel,
          amount: proposal.amount,
          purpose: proposal.purpose,
          freeze: true,
        }),
      });
      setQuote(data.quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not freeze quote");
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!account || !stipend || !quote) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{
        ok: boolean;
        remaining?: string;
        ausdBalance?: string;
        receipt: EnvioReceipt;
      }>("/api/signer/attempt", {
        method: "POST",
        body: JSON.stringify({
          accountId: account.id,
          stipendId: stipend.id,
          quoteId: quote.id,
          recipient: quote.recipient,
          amount: quote.amount,
          purpose: quote.purpose,
          injected: false,
        }),
      });
      if (data.ok) {
        setPaid(true);
        if (data.remaining && stipend) {
          setStipend({ ...stipend, remaining: data.remaining });
        }
        if (data.ausdBalance && account) {
          setAccount({ ...account, ausdBalance: data.ausdBalance });
        }
      }
      await refreshReceipts(account.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function onInject() {
    if (!account || !stipend) return;
    setBusy(true);
    setError("");
    try {
      const next = await onPropose(hostile);
      if (!next) return;
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      const data = await api<{
        ok: boolean;
        constructed: boolean;
        receipt: EnvioReceipt;
      }>("/api/signer/attempt", {
        method: "POST",
        body: JSON.stringify({
          accountId: account.id,
          stipendId: stipend.id,
          quoteId: quote?.id,
          recipient: next.recipient,
          amount: next.amount,
          purpose: next.purpose,
          injected: true,
        }),
      });
      setRefusal(data.receipt);
      setStamp(true);
      await refreshReceipts(account.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Injection demo failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/revoke", {
        method: "POST",
        body: JSON.stringify({ accountId: account.id }),
      });
      setAccount({ ...account, agentRevoked: true, hasAgentKey: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  if (step === "landing") {
    return <LandingHero onStart={() => go("passkey")} />;
  }

  return (
    <div className="stage">
      <aside className="stage-rail">
        <div className="brand">Stipend</div>
        <div className="meta">
          Metropolis
          <br />
          Trust · Identity · AI
          <br />
          13 Oct 2026
        </div>
      </aside>
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          <header className="status-bar">
            <span>Stipend</span>
            <span>09:41</span>
          </header>
          {step === "passkey" && (
            <section className="screen">
              <p className="kicker">Human key</p>
              <h1>Face ID opens the account.</h1>
              <p className="note" style={{ marginTop: 16, maxWidth: "28ch" }}>
                Create or resume. Nothing to copy down. This key stays with you.
              </p>
              {account ? (
                <>
                  <div className="amount" style={{ color: "var(--signal)" }}>
                    {Number(account.ausdBalance).toFixed(2)}
                    <span className="amount-unit">AUSD</span>
                  </div>
                  <p className="note">Simulated balance · not a token balance · human key · index 0</p>
                  <div className="chip">
                    <b>Human</b>
                    <span>{shortAddress(account.humanAddress)}</span>
                  </div>
                  {account.source === "demo" && (
                    <p className="note">
                      This preview has no authenticator. A local passkey stand-in
                      derived the same two keys.
                    </p>
                  )}
                </>
              ) : null}
              <div className="grow" />
              <p className="err">{error}</p>
              <div className="foot">
                {!account && (
                  <>
                    <button
                      className={`btn btn-primary ${busy ? "btn-pulse" : ""}`}
                      disabled={busy}
                      onClick={() => void onCreatePasskey()}
                    >
                      {busy ? "Waiting on Face ID" : "Create with Face ID"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => void onResumePasskey()}
                    >
                      Resume
                    </button>
                  </>
                )}
                {account && (
                  <button className="btn btn-primary" onClick={() => go("stipend")}>
                    Continue
                  </button>
                )}
              </div>
            </section>
          )}
          {step === "stipend" && (
            <section className="screen" style={{ overflow: "auto" }}>
              <p className="kicker">Sealed policy</p>
              <h1 style={{ fontSize: "2.1rem" }}>Set the stipend.</h1>
              <p className="note">The agent never receives this form.</p>
              <div className="field">
                <label>Amount</label>
                <input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) =>
                    setForm({ ...form, amount: event.target.value })
                  }
                />
              </div>
              <div className="row">
                <div className="field">
                  <label>Per payment</label>
                  <input
                    inputMode="decimal"
                    value={form.perPaymentCap}
                    onChange={(event) =>
                      setForm({ ...form, perPaymentCap: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label>Daily cap</label>
                  <input
                    inputMode="decimal"
                    value={form.dailyCap}
                    onChange={(event) =>
                      setForm({ ...form, dailyCap: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="field">
                <label>Max payments / hour</label>
                <input
                  inputMode="numeric"
                  value={form.maxPaymentsPerHour}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      maxPaymentsPerHour: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <p className="kicker">Allowlist</p>
              <div className="chips">
                <div className="chip">
                  <b>{PAYEES.dataApi.label}</b>
                  <span>{shortAddress(PAYEES.dataApi.address)}</span>
                </div>
                <div className="chip">
                  <b>{PAYEES.labeledAgent.label}</b>
                  <span>{shortAddress(PAYEES.labeledAgent.address)}</span>
                </div>
              </div>
              <p className="note" style={{ marginTop: 14 }}>
                Expires in 24 hours.
              </p>
              <p className="err">{error}</p>
              <div className="foot">
                <button
                  className="btn btn-primary"
                  disabled={busy || !account}
                  onClick={() => void onSealStipend()}
                >
                  Seal the stipend
                </button>
              </div>
            </section>
          )}
          {step === "agent" && (
            <section className="screen">
              <p className="kicker">One passkey, two keys</p>
              <h1 style={{ fontSize: "2.1rem" }}>Agent key.</h1>
              <p className="note">
                Same passkey. Index 1. The root key is not in the agent runtime.
              </p>
              <div className="keys">
                <div className="key-card">
                  <div className="idx">Index 0 · authenticator</div>
                  <h3>Human key</h3>
                  <div className="mono">{shortAddress(account?.humanAddress ?? "")}</div>
                </div>
                <div className={`key-card runtime ${account?.agentRevoked ? "dead" : ""}`}>
                  <div className="idx">Index 1 · derived identity only</div>
                  <h3>Agent key</h3>
                  <div className="mono">{shortAddress(account?.agentAddress ?? "")}</div>
                </div>
              </div>
              {stipend && (
                <div className="meter-wrap">
                  <svg className="meter" viewBox="0 0 100 100" aria-hidden>
                    <circle className="track" cx="50" cy="50" r="45" />
                    <circle
                      className="fill"
                      cx="50"
                      cy="50"
                      r="45"
                      style={{ ["--fill" as string]: fill }}
                    />
                  </svg>
                  <div>
                    <div className="lock">Cap sealed</div>
                    <div className="amount" style={{ fontSize: "2.4rem" }}>
                      {Number(stipend.remaining).toFixed(2)}
                    </div>
                    <div className="note" style={{ margin: 0 }}>
                      of {Number(stipend.amount).toFixed(2)} AUSD
                    </div>
                  </div>
                </div>
              )}
              <div className="grow" />
              <div className="foot">
                <button className="btn btn-primary" onClick={() => go("job")}>
                  Give it a job
                </button>
              </div>
            </section>
          )}
          {step === "job" && (
            <section className="screen" style={{ overflow: "auto" }}>
              <p className="kicker">Qwen 3.8 Max</p>
              <h1 style={{ fontSize: "2.1rem" }}>A job, in English.</h1>
              <div className="field" style={{ marginTop: 16 }}>
                <label>Job</label>
                <textarea value={job} onChange={(event) => setJob(event.target.value)} />
              </div>
              {proposal && (
                <div className={`quote ${quote?.frozen ? "frozen" : ""}`}>
                  <div className="q-k">Proposed payment</div>
                  <div className="q-v">
                    {proposal.amount} {proposal.asset} → {proposal.recipientLabel}
                  </div>
                  <div className="q-k">Purpose</div>
                  <div className="q-v" style={{ fontSize: "1rem" }}>
                    {proposal.purpose}
                  </div>
                  {quote?.frozen && <div className="lock">Quote frozen · local demo, no on-chain payment</div>}
                </div>
              )}
              <p className="err">{error}</p>
              <div className="foot">
                {!proposal && (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void onPropose()}
                  >
                    Ask Qwen
                  </button>
                )}
                {proposal && !quote?.frozen && (
                  <button className="btn btn-signal" disabled={busy} onClick={() => void onFreeze()}>
                    Freeze quote
                  </button>
                )}
                {quote?.frozen && !paid && (
                  <button className="btn btn-signal" disabled={busy} onClick={() => void onPay()}>
                    Simulate policy approval
                  </button>
                )}
                {paid && (
                  <button className="btn btn-primary" onClick={() => go("refusal")}>
                    Now try to break it
                  </button>
                )}
                {quote?.frozen && !paid && (
                  <button className="btn btn-ghost" onClick={() => go("refusal")}>
                    Skip to refusal
                  </button>
                )}
              </div>
            </section>
          )}
          {step === "refusal" && (
            <section className="screen" style={{ overflow: "auto" }}>
              <p className="kicker">The demo that matters</p>
              <h1 style={{ fontSize: "2.05rem" }}>A hostile page.</h1>
              <div className="hostile">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Injected instruction</label>
                  <textarea
                    value={hostile}
                    onChange={(event) => setHostile(event.target.value)}
                  />
                </div>
              </div>
              {injection && (
                <div className="bubble bad">
                  <div className="q-k">Qwen</div>
                  <p style={{ margin: "6px 0 0" }}>{injection.narrative}</p>
                </div>
              )}
              <div className={`signer-hero ${stamp ? "shake" : ""}`}>
                <div className="q-k">Signer</div>
                <p style={{ margin: "8px 0 0", maxWidth: "22ch" }}>
                  {refusal
                    ? refusal.params.reason
                    : "Policy lives here. The model cannot see or edit it."}
                </p>
                <div className={`stamp ${stamp ? "show" : ""}`}>REFUSED</div>
              </div>
              <p className="err">{error}</p>
              <div className="foot">
                {!refusal && (
                  <button
                    className="btn btn-refuse"
                    disabled={busy || !stipend}
                    onClick={() => void onInject()}
                  >
                    Feed the page to Qwen
                  </button>
                )}
                {refusal && (
                  <button className="btn btn-primary" onClick={() => go("receipts")}>
                    See receipts
                  </button>
                )}
              </div>
            </section>
          )}
          {step === "receipts" && (
            <section className="screen">
              <p className="kicker">Local simulated receipts · not on-chain</p>
              <h1 style={{ fontSize: "2.1rem" }}>Attempts.</h1>
              <div className="papers grow">
                {receipts.length === 0 && (
                  <p className="note">No attempts yet. Pay or inject first.</p>
                )}
                {receipts.map((item) => (
                  <article key={item.id} className="paper">
                    <div className={`stripe ${item.params.status}`} />
                    <div className="meta">{item.params.status === "paid" ? "simulated approval · no transfer" : "simulated refusal"}</div>
                    <div className="why">{item.params.reason}</div>
                    <div className="meta">
                      {item.params.amount} {item.params.asset} ·{" "}
                      {shortAddress(item.params.recipient)}
                    </div>
                  </article>
                ))}
              </div>
              <div className="foot">
                <button className="btn btn-primary" onClick={() => go("revoke")}>
                  Revoke the agent key
                </button>
              </div>
            </section>
          )}
          {step === "revoke" && (
            <section className="screen" style={{ overflow: "auto" }}>
              <p className="kicker">Kill switch · local demo</p>
              <h1 style={{ fontSize: "2.2rem" }}>One control.</h1>
              <p className="note" style={{ maxWidth: "24ch" }}>
                Local demo revoke only. It does not call an on-chain owner function.
                The human key stays on the passkey.
              </p>
              <div className={`key-card ${account?.agentRevoked ? "dead" : "runtime"}`}>
                <div className="idx">Index 1</div>
                  <h3>{account?.agentRevoked ? "Locally revoked" : "Agent identity · no on-chain signer"}</h3>
                <div className="mono">{shortAddress(account?.agentAddress ?? "")}</div>
              </div>
              <DeploymentStatus humanAddress={account?.humanAddress} agentAddress={account?.agentAddress} passkeySource={account?.source} />
              <p className="err">{error}</p>
              <div className="grow" />
              <div className="foot">
                {!account?.agentRevoked && (
                  <button
                    className="btn btn-refuse"
                    disabled={busy}
                    onClick={() => void onRevoke()}
                  >
                    Kill the agent key
                  </button>
                )}
                {account?.agentRevoked && (
                  <button className="btn btn-primary" onClick={() => go("receipts")}>
                    Back to receipts
                  </button>
                )}
              </div>
            </section>
          )}
          <nav className="dots" aria-label="Screens">
            {STEPS.map((item) => (
              <button
                key={item}
                className={`dot ${item === step ? "on" : ""} ${item === "refusal" ? "hot" : ""}`}
                onClick={() => go(item)}
                aria-label={item}
              />
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
