import { createPublicClient, http, keccak256, toBytes, type Hex } from "viem";
import { monadTestnet } from "viem/chains";
import { AUSD_TOKEN, MONAD_RPC } from "./constants";

if (monadTestnet.id !== 10143) throw new Error("Refusing non-testnet chain");
export { monadTestnet };

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC),
});

export function assetHashForAusd(): Hex {
  return keccak256(toBytes(`${AUSD_TOKEN.toLowerCase()}:AUSD`));
}

export async function latestBlockNumber(): Promise<string | null> {
  try {
    const block = await publicClient.getBlockNumber();
    return block.toString();
  } catch {
    return null;
  }
}
