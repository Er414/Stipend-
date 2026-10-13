import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  createSecp256k1SigningSession,
  getEvmAddress,
} from "@category-labs/mera";
export type DerivedAgentKey = {
  index: 1;
  address: `0x${string}`;
};

export type DerivedHumanKey = {
  index: 0;
  address: `0x${string}`;
};

function deriveNode(prfOutput: Uint8Array, index: number): HDKey {
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  return HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
}

function addressFromPrivateKey(privateKey: Uint8Array): `0x${string}` {
  const session = createSecp256k1SigningSession({ privateKey });
  try {
    return getEvmAddress(session.publicKey);
  } finally {
    session.end();
  }
}

export function deriveHumanAndAgent(prfOutput: Uint8Array): {
  human: DerivedHumanKey;
  agent: DerivedAgentKey;
} {
  const humanNode = deriveNode(prfOutput, 0);
  const agentNode = deriveNode(prfOutput, 1);
  const humanKey = humanNode.privateKey;
  const agentKey = agentNode.privateKey;
  if (!humanKey || !agentKey) {
    throw new Error("Passkey derivation produced no key material");
  }

  const humanAddress = addressFromPrivateKey(humanKey);
  const agentAddress = addressFromPrivateKey(agentKey);
  humanKey.fill(0);
  agentKey.fill(0);

  return {
    human: { index: 0, address: humanAddress },
    agent: { index: 1, address: agentAddress },
  };
}
