import type {
  GetTokenAllowanceParams,
  GetTokenAllowanceResponse,
  ApproveTokenParams,
  ApproveTokenResponse,
  EnsureTokenApprovalParams,
  EnsureTokenApprovalResponse,
} from "../types/index.js";
import type { DelphiSigner } from "./signer.js";
import type { Abi } from "viem";
import { ABI as ERC20_ABI } from "../abi/ERC20.js";

/**
 * TokenClient — handles ERC-20 token operations for Delphi markets.
 *
 * Manages token allowances and approvals. Uses the globally configured
 * token address (DELPHI_TOKEN_ADDRESS) rather than resolving per-market.
 */
export class TokenClient {
  constructor(
    private readonly getSigner: () => Promise<DelphiSigner>,
    private readonly getGatewayAddress: () => `0x${string}`,
    private readonly getTokenAddress: () => `0x${string}`,
  ) {}

  // ─── Token Approval (on-chain) ─────────────────────────────────────────────

  async getTokenAllowance(params: GetTokenAllowanceParams): Promise<GetTokenAllowanceResponse> {
    const { address, publicClient } = await this.getSigner();
    const tokenAddress = this.getTokenAddress();

    const allowance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI as Abi,
      functionName: "allowance",
      args: [address, params.marketAddress],
    })) as bigint;

    return { ownerAddress: address, allowance };
  }

  async approveToken(params: ApproveTokenParams): Promise<ApproveTokenResponse> {
    const MAX_UINT256 = 2n ** 256n - 1n;
    const amount = params.amount ?? MAX_UINT256;

    const { address, walletClient, publicClient } = await this.getSigner();
    const tokenAddress = this.getTokenAddress();

    const contractCall = {
      address: tokenAddress,
      abi: ERC20_ABI as Abi,
      functionName: "approve" as const,
      args: [params.marketAddress, amount] as const,
    };

    await publicClient.simulateContract({ account: address, ...contractCall });

    const transactionHash = await walletClient.writeContract(contractCall);
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });

    return { transactionHash };
  }

  async ensureTokenApproval(params: EnsureTokenApprovalParams): Promise<EnsureTokenApprovalResponse> {
    const { allowance: currentAllowance } = await this.getTokenAllowance({
      marketAddress: params.marketAddress,
    });

    if (currentAllowance >= params.minimumAmount) {
      return { approvalNeeded: false, allowance: currentAllowance };
    }

    const MAX_UINT256 = 2n ** 256n - 1n;
    const approveAmount = params.approveAmount ?? MAX_UINT256;

    const { transactionHash } = await this.approveToken({
      marketAddress: params.marketAddress,
      amount: approveAmount,
    });

    return { approvalNeeded: true, allowance: approveAmount, transactionHash };
  }
}
