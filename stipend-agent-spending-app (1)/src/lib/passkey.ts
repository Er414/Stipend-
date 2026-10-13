"use client";

import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "@category-labs/mera";
import { deriveHumanAndAgent } from "./derive";

export type PasskeySession = {
  credentialId: string;
  source: "webauthn" | "demo";
  humanAddress: `0x${string}`;
  agentAddress: `0x${string}`;
};

function rpId(): string {
  return window.location.hostname;
}

function fromPrf(
  prfOutput: Uint8Array,
  credentialId: string,
  source: PasskeySession["source"],
): PasskeySession {
  const keys = deriveHumanAndAgent(prfOutput);
  prfOutput.fill(0);
  return {
    credentialId,
    source,
    humanAddress: keys.human.address,
    agentAddress: keys.agent.address,
  };
}

export function webAuthnAvailable(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

export async function createPasskeyAccount(): Promise<PasskeySession> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Stipend" },
    user: { name: "stipend-owner", displayName: "Stipend owner" },
  });
  return fromPrf(created.prfOutput, created.credentialId, "webauthn");
}

export async function resumePasskeyAccount(): Promise<PasskeySession> {
  const asserted = await getPasskeyPrfOutput({ rpId: rpId() });
  return fromPrf(asserted.prfOutput, asserted.credentialId, "webauthn");
}

export async function demoAuthenticatorAccount(): Promise<PasskeySession> {
  const stored = sessionStorage.getItem("stipend.demo.prf");
  let prf: Uint8Array;
  if (stored) {
    prf = Uint8Array.from(JSON.parse(stored) as number[]);
  } else {
    prf = crypto.getRandomValues(new Uint8Array(32));
    sessionStorage.setItem("stipend.demo.prf", JSON.stringify([...prf]));
  }
  const session = fromPrf(prf, "demo-local-authenticator", "demo");
  prf.fill(0);
  return session;
}
