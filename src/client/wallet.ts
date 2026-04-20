import type { DelphiSigner } from "./signer.js";
import type { Abi } from "viem";
import { ABI as ERC20_ABI } from "../abi/ERC20.js";

/**
 * WalletClient — read-only helpers for wallet balances.
 *
 * Exposes convenience methods for:
 * - Native ETH balance
 * - ERC-20 token balance (given token address)
 */
export class WalletClient {
  constructor(private readonly getSigner: () => Promise<DelphiSigner>) {}

  /**
   * Returns the native ETH balance for the current signer address.
   */
  async getEthBalance(): Promise<bigint> {
    const { address, publicClient } = await this.getSigner();
    return (await publicClient.getBalance({ address })) as bigint;
  }

  /**
   * Returns the ERC-20 token balance for the current signer address.
   */
  async getErc20Balance(tokenAddress: `0x${string}`): Promise<bigint> {
    const { address, publicClient } = await this.getSigner();

    const balance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI as Abi,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;

    return balance;
  }

  /**
   * Returns the ERC-20 token balance and decimals for the current signer address.
   */
  async getErc20BalanceWithDecimals(
    tokenAddress: `0x${string}`,
  ): Promise<{ balance: bigint; decimals: number }> {
    const { address, publicClient } = await this.getSigner();

    const [balance, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI as Abi,
        functionName: "balanceOf",
        args: [address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI as Abi,
        functionName: "decimals",
      }) as Promise<number>,
    ]);

    return {
      balance,
      decimals,
    };
  }
}
