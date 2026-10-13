import { encodeFunctionData, erc20Abi, parseUnits, type Hex } from "viem";
import { AUSD_DECIMALS, AUSD_TOKEN, MONAD_CHAIN_ID } from "./constants";

export type ConstructedTransfer = {
  chainId: number;
  to: typeof AUSD_TOKEN;
  data: Hex;
  value: "0";
  asset: "AUSD";
};

export function constructAusdTransfer(
  recipient: `0x${string}`,
  amount: string,
): ConstructedTransfer {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, parseUnits(amount, AUSD_DECIMALS)],
  });

  return {
    chainId: MONAD_CHAIN_ID,
    to: AUSD_TOKEN,
    data,
    value: "0",
    asset: "AUSD",
  };
}
