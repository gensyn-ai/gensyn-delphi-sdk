import type {
  SignerType,
  Network,
  DelphiClientConfig,
  BuySharesParams,
  BuySharesResponse,
  SellSharesParams,
  SellSharesResponse,
  QuoteBuyParams,
  QuoteBuyResponse,
  QuoteSellParams,
  QuoteSellResponse,
  GetTokenAllowanceParams,
  GetTokenAllowanceResponse,
  ApproveTokenParams,
  ApproveTokenResponse,
  EnsureTokenApprovalParams,
  EnsureTokenApprovalResponse,
  RedeemMarketParams,
  RedeemMarketResponse,
  RedeemPositionsParams,
  RedeemPositionsResponse,
  LiquidateParams,
  LiquidateResponse,
  HealthResponse,
  ListMarketsParams,
  ListMarketsResponse,
  GetMarketParams,
  GetMarketResponse,
  ListPositionsParams,
  ListPositionsResponse,
} from "../types/index.js";
import {
  createPrivateKeySigner,
  createCdpSigner,
  type DelphiSigner,
} from "./signer.js";
import { TokenClient } from "./token.js";
import { WalletClient } from "./wallet.js";
import { SubgraphClient } from "./subgraph.js";
import type { Abi } from "viem";
import { ABI as DYNAMIC_PARIMUTUEL_GATEWAY_ABI } from "../abi/DynamicParimutuelGateway.js";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

// ─── Network Defaults ─────────────────────────────────────────────────────────

const NETWORK_DEFAULTS: Record<Network, Partial<DelphiClientConfig>> = {
  testnet: {
    rpcUrl: "https://gensyn-testnet.g.alchemy.com/public",
    chainId: 685685,
    gatewayAddress: "0x7b8FDBD187B0Be5e30e48B1995df574A62667147" as `0x${string}`,
    tokenAddress: "0x0724D6079b986F8e44bDafB8a09B60C0bd6A45a1" as `0x${string}`,
    apiBaseUrl: "https://delphi-api.gensyn.ai/",
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-testnet/1.0.0/gn",
  },
  mainnet: {
    rpcUrl: "https://gensyn-mainnet.g.alchemy.com/public",
    chainId: 685689,
    gatewayAddress: "0x4e4e85c52E0F414cc67eE88d0C649Ec81698d700" as `0x${string}`,
    tokenAddress: "0x5b32c997211621d55a89Cc5abAF1cC21F3A6ddF5" as `0x${string}`,
    apiBaseUrl: "https://api.delphi.fyi/",
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-mainnet/1.0.0/gn",
  },
};

/**
 * DelphiClient — on-chain write operations for the Delphi prediction market.
 *
 * Supports buying/selling shares, quoting trades, managing ERC-20 approvals,
 * and redeeming winning positions — all routed through the Gateway contract.
 *
 * ## Network Configuration
 *
 * The client supports two networks: `"testnet"` (default) and `"mainnet"`.
 * Network-specific defaults are applied automatically, but can be overridden
 * via config or environment variables.
 *
 * ## Signing mechanisms
 *
 * | `signerType`          | Description                                    |
 * |-----------------------|------------------------------------------------|
 * | `"cdp_server_wallet"` | Delegate to a CDP Server Wallet v2 (default)   |
 * | `"private_key"`       | Sign locally with a hex private key             |
 */
export class DelphiClient {
  private readonly signerType: SignerType;

  // Private-key path
  private readonly privateKey?: `0x${string}`;

  // CDP path
  private readonly cdpApiKeyId?: string;
  private readonly cdpApiKeySecret?: string;
  private readonly cdpWalletSecret?: string;
  private readonly cdpWalletAddress?: `0x${string}`;

  // Shared chain config
  private readonly rpcUrl?: string;
  private readonly chainId?: number;
  private readonly gatewayAddress?: `0x${string}`;
  private readonly tokenAddress?: `0x${string}`;

  // REST API config
  private readonly apiBaseUrl?: string;
  private readonly apiKey?: string;
  private readonly extraHeaders: Record<string, string>;

  // Subgraph config
  private readonly subgraphUrl?: string;

  private signerPromise: Promise<DelphiSigner> | null = null;
  private tokenClient: TokenClient | null = null;
  private walletClient: WalletClient | null = null;
  private subgraphClient: SubgraphClient | null = null;

  constructor(config?: DelphiClientConfig & { extraHeaders?: Record<string, string> }) {
    // Determine network (default to testnet)
    const network: Network = (config?.network ?? (process.env.DELPHI_NETWORK as Network) ?? "testnet");
    const networkDefaults = NETWORK_DEFAULTS[network];

    // Signer type
    const envSignerType = process.env.DELPHI_SIGNER_TYPE as SignerType | undefined;
    this.signerType = config?.signerType ?? envSignerType ?? "cdp_server_wallet";

    // Private-key config (user must provide)
    const envPrivateKey = process.env.WALLET_PRIVATE_KEY;
    this.privateKey = config?.privateKey ?? (envPrivateKey ? (envPrivateKey as `0x${string}`) : undefined);

    // CDP config (user must provide)
    this.cdpApiKeyId = config?.cdpApiKeyId ?? process.env.CDP_API_KEY_ID;
    this.cdpApiKeySecret = config?.cdpApiKeySecret ?? process.env.CDP_API_KEY_SECRET;
    this.cdpWalletSecret = config?.cdpWalletSecret ?? process.env.CDP_WALLET_SECRET;
    const envCdpWalletAddress = process.env.CDP_WALLET_ADDRESS;
    this.cdpWalletAddress = config?.cdpWalletAddress ?? (envCdpWalletAddress ? (envCdpWalletAddress as `0x${string}`) : undefined);

    // Chain config (use network defaults, allow env/config override)
    this.rpcUrl = config?.rpcUrl ?? process.env.GENSYN_RPC_URL ?? networkDefaults.rpcUrl;
    const envChainId = process.env.GENSYN_CHAIN_ID;
    this.chainId = config?.chainId ?? (envChainId ? Number(envChainId) : undefined) ?? networkDefaults.chainId;
    const envGateway = process.env.DELPHI_GATEWAY_CONTRACT;
    this.gatewayAddress = config?.gatewayAddress ?? (envGateway ? (envGateway as `0x${string}`) : undefined) ?? networkDefaults.gatewayAddress;
    const envTokenAddress = process.env.DELPHI_TOKEN_ADDRESS;
    this.tokenAddress = config?.tokenAddress ?? (envTokenAddress ? (envTokenAddress as `0x${string}`) : undefined) ?? networkDefaults.tokenAddress;

    // REST API config (use network defaults, allow env/config override)
    const envApiBaseUrl = process.env.DELPHI_API_BASE_URL;
    this.apiBaseUrl = config?.apiBaseUrl ?? envApiBaseUrl ?? networkDefaults.apiBaseUrl;
    // API key must be provided by user (no default)
    this.apiKey = config?.apiKey ?? process.env.DELPHI_API_ACCESS_KEY;

    // Subgraph URL (use network defaults, allow env/config override)
    this.subgraphUrl = config?.subgraphUrl ?? process.env.DELPHI_SUBGRAPH_URL ?? networkDefaults.subgraphUrl;

    // Extra headers (e.g. Cloudflare Access)
    this.extraHeaders = config?.extraHeaders ?? {};
  }

  // ─── Signer ─────────────────────────────────────────────────────────────────

  /**
   * Returns (or lazily creates) the signer used for on-chain operations.
   * Public so callers can access publicClient for reading market state.
   */
  async getSigner(): Promise<DelphiSigner> {
    if (!this.signerPromise) {
      this.signerPromise = this.initSigner();
    }
    return this.signerPromise;
  }

  private async initSigner(): Promise<DelphiSigner> {
    if (!this.rpcUrl) {
      throw new Error("Requires rpcUrl. Set GENSYN_RPC_URL environment variable.");
    }
    if (!this.chainId) {
      throw new Error("Requires chainId. Set GENSYN_CHAIN_ID environment variable.");
    }

    if (this.signerType === "cdp_server_wallet") {
      if (!this.cdpApiKeyId)
        throw new Error("CDP signing requires cdpApiKeyId. Set CDP_API_KEY_ID.");
      if (!this.cdpApiKeySecret)
        throw new Error("CDP signing requires cdpApiKeySecret. Set CDP_API_KEY_SECRET.");
      if (!this.cdpWalletSecret)
        throw new Error("CDP signing requires cdpWalletSecret. Set CDP_WALLET_SECRET.");
      if (!this.cdpWalletAddress)
        throw new Error("CDP signing requires cdpWalletAddress. Set CDP_WALLET_ADDRESS.");

      return createCdpSigner({
        apiKeyId: this.cdpApiKeyId,
        apiKeySecret: this.cdpApiKeySecret,
        walletSecret: this.cdpWalletSecret,
        walletAddress: this.cdpWalletAddress,
        rpcUrl: this.rpcUrl,
        chainId: this.chainId,
      });
    }

    // Private-key path
    if (!this.privateKey) {
      throw new Error("Requires privateKey. Set WALLET_PRIVATE_KEY or pass privateKey in config.");
    }

    return await createPrivateKeySigner({
      privateKey: this.privateKey,
      rpcUrl: this.rpcUrl,
      chainId: this.chainId,
    });
  }

  private getGatewayAddress(): `0x${string}` {
    if (!this.gatewayAddress) {
      throw new Error("Requires gatewayAddress. Set DELPHI_GATEWAY_CONTRACT environment variable.");
    }
    return this.gatewayAddress;
  }

  getTokenAddress(): `0x${string}` {
    if (!this.tokenAddress) {
      throw new Error("Requires tokenAddress. Set DELPHI_TOKEN_ADDRESS environment variable.");
    }
    return this.tokenAddress;
  }

  private getTokenClient(): TokenClient {
    if (!this.tokenClient) {
      this.tokenClient = new TokenClient(
        () => this.getSigner(),
        () => this.getGatewayAddress(),
        () => this.getTokenAddress(),
      );
    }
    return this.tokenClient;
  }

  private getWalletClient(): WalletClient {
    if (!this.walletClient) {
      this.walletClient = new WalletClient(() => this.getSigner());
    }
    return this.walletClient;
  }

  // ─── Quotes (read-only, no gas) ────────────────────────────────────────────

  async quoteBuy(params: QuoteBuyParams): Promise<QuoteBuyResponse> {
    const gatewayAddress = this.getGatewayAddress();
    const { publicClient } = await this.getSigner();

    const tokensIn = (await publicClient.readContract({
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "quoteBuyExactOut",
      args: [params.marketAddress, BigInt(params.outcomeIdx), params.sharesOut],
    })) as bigint;

    return { tokensIn };
  }

  async quoteSell(params: QuoteSellParams): Promise<QuoteSellResponse> {
    const gatewayAddress = this.getGatewayAddress();
    const { publicClient } = await this.getSigner();

    const tokensOut = (await publicClient.readContract({
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "quoteSellExactIn",
      args: [params.marketAddress, BigInt(params.outcomeIdx), params.sharesIn],
    })) as bigint;

    return { tokensOut };
  }

  // ─── Buy / Sell (on-chain via Gateway) ──────────────────────────────────────

  async buyShares(params: BuySharesParams): Promise<BuySharesResponse> {
    const gatewayAddress = this.getGatewayAddress();
    const { address, walletClient, publicClient } = await this.getSigner();

    const contractCall = {
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "buyExactOut" as const,
      args: [
        params.marketAddress,
        BigInt(params.outcomeIdx),
        params.sharesOut,
        params.maxTokensIn,
      ] as const,
    };

    // Simulate to catch reverts before spending gas
    await publicClient.simulateContract({ account: address, ...contractCall });

    const transactionHash = await walletClient.writeContract(contractCall);
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });

    return { transactionHash };
  }

  async sellShares(params: SellSharesParams): Promise<SellSharesResponse> {
    const gatewayAddress = this.getGatewayAddress();
    const { address, walletClient, publicClient } = await this.getSigner();

    const contractCall = {
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "sellExactIn" as const,
      args: [
        params.marketAddress,
        BigInt(params.outcomeIdx),
        params.sharesIn,
        params.minTokensOut,
      ] as const,
    };

    await publicClient.simulateContract({ account: address, ...contractCall });

    const transactionHash = await walletClient.writeContract(contractCall);
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });

    return { transactionHash };
  }

  // ─── Redeem (on-chain via Gateway) ──────────────────────────────────────────

  async redeemMarket(params: RedeemMarketParams): Promise<RedeemMarketResponse> {
    const gatewayAddress = this.getGatewayAddress();
    const { address, walletClient, publicClient } = await this.getSigner();

    const contractCall = {
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "redeem" as const,
      args: [params.marketAddress] as const,
    };

    const { result } = await publicClient.simulateContract({
      account: address,
      ...contractCall,
    });

    const [sharesIn, tokensOut] = result as [bigint, bigint];

    const transactionHash = await walletClient.writeContract(contractCall);
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });

    return {
      marketAddress: params.marketAddress,
      transactionHash,
      sharesIn,
      tokensOut,
    };
  }

  async redeemPositions(params: RedeemPositionsParams): Promise<RedeemPositionsResponse> {
    const results: RedeemPositionsResponse["results"] = [];
    let totalTokensOut = 0n;

    for (const marketAddress of params.marketAddresses) {
      try {
        const { transactionHash, sharesIn, tokensOut } = await this.redeemMarket({ marketAddress });
        results.push({ marketAddress, success: true, transactionHash, sharesIn, tokensOut });
        totalTokensOut += tokensOut;
      } catch (e: unknown) {
        const err = e as { shortMessage?: string; message?: string };
        results.push({
          marketAddress,
          success: false,
          error: err.shortMessage ?? err.message ?? "Unknown error",
        });
      }
    }

    return { results, totalTokensOut };
  }

  // ─── Liquidate (on-chain via Gateway) ────────────────────────────────────────

  /**
   * Liquidate positions on an expired market for one or more outcome indices.
   *
   * This calls `Gateway.liquidate(marketProxy, outcomeIndices)` via RPC,
   * and returns the burned shares per outcome along with total tokens received.
   */
  async liquidate(params: LiquidateParams): Promise<LiquidateResponse> {
    const gatewayAddress = this.getGatewayAddress();
    const { address, walletClient, publicClient } = await this.getSigner();

    const outcomeIndicesBigInt = params.outcomeIndices.map((idx) => BigInt(idx));

    const contractCall = {
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "liquidate" as const,
      args: [params.marketAddress, outcomeIndicesBigInt] as const,
    };

    const { result } = await publicClient.simulateContract({
      account: address,
      ...contractCall,
    });

    const [sharesIn, totalTokensOut] = result as [bigint[], bigint];

    const transactionHash = await walletClient.writeContract(contractCall);
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });

    return {
      marketAddress: params.marketAddress,
      transactionHash,
      sharesIn,
      totalTokensOut,
    };
  }

  // ─── Token Approval (on-chain) ─────────────────────────────────────────────

  async getTokenAllowance(params: GetTokenAllowanceParams): Promise<GetTokenAllowanceResponse> {
    return this.getTokenClient().getTokenAllowance(params);
  }

  async approveToken(params: ApproveTokenParams): Promise<ApproveTokenResponse> {
    return this.getTokenClient().approveToken(params);
  }

  async ensureTokenApproval(params: EnsureTokenApprovalParams): Promise<EnsureTokenApprovalResponse> {
    return this.getTokenClient().ensureTokenApproval(params);
  }

  // ─── Wallet Balances (read-only) ─────────────────────────────────────────────

  /**
   * Returns the native ETH balance for the current signer wallet.
   */
  async getEthBalance(): Promise<bigint> {
    return this.getWalletClient().getEthBalance();
  }

  /**
   * Returns the ERC-20 token balance for the current signer wallet.
   * Defaults to the configured token address (DELPHI_TOKEN_ADDRESS) when omitted.
   */
  async getErc20Balance(tokenAddress?: `0x${string}`): Promise<bigint> {
    return this.getWalletClient().getErc20Balance(tokenAddress ?? this.getTokenAddress());
  }

  /**
   * Returns the ERC-20 token balance and decimals for the current signer wallet.
   * Defaults to the configured token address (DELPHI_TOKEN_ADDRESS) when omitted.
   */
  async getErc20BalanceWithDecimals(
    tokenAddress?: `0x${string}`,
  ): Promise<{ balance: bigint; decimals: number }> {
    return this.getWalletClient().getErc20BalanceWithDecimals(tokenAddress ?? this.getTokenAddress());
  }

  // ─── Subgraph (Goldsky) ─────────────────────────────────────────────────────

  private getSubgraphUrl(): string {
    if (!this.subgraphUrl) {
      throw new Error("Requires subgraphUrl. Set DELPHI_SUBGRAPH_URL environment variable.");
    }
    return this.subgraphUrl;
  }

  /**
   * Returns the SubgraphClient for direct GraphQL access.
   *
   * Use this for custom queries:
   * ```ts
   * const subgraph = client.getSubgraph();
   * const data = await subgraph.query<{ gatewayBuys: SubgraphBuy[] }>(`{
   *   gatewayBuys(first: 10, orderBy: timestamp_, orderDirection: desc) {
   *     id buyer marketProxy tokensIn sharesOut timestamp_
   *   }
   * }`);
   * ```
   */
  getSubgraph(): SubgraphClient {
    if (!this.subgraphClient) {
      this.subgraphClient = new SubgraphClient(this.getSubgraphUrl());
    }
    return this.subgraphClient;
  }

  // ─── REST API Helpers ───────────────────────────────────────────────────────

  private getApiBaseUrl(): string {
    if (!this.apiBaseUrl) {
      throw new Error("Requires apiBaseUrl. Set DELPHI_API_BASE_URL environment variable.");
    }
    return this.apiBaseUrl.replace(/\/+$/, ""); // strip trailing slash
  }

  private getApiKey(): string {
    if (!this.apiKey) {
      throw new Error("Requires apiKey. Set DELPHI_API_ACCESS_KEY environment variable.");
    }
    return this.apiKey;
  }

  /**
   * Internal helper: make an authenticated GET request to the REST API.
   * Throws on non-2xx responses.
   */
  private async apiGet<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(path, this.getApiBaseUrl());

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-Key": this.getApiKey(),
        Accept: "application/json",
        ...this.extraHeaders,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as T;
  }

  // ─── Read APIs ──────────────────────────────────────────────────────────────

  /**
   * Returns service health status.
   * Does not require authentication.
   */
  async health(): Promise<HealthResponse> {
    const url = new URL("/health", this.getApiBaseUrl());
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", ...this.extraHeaders },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Health check failed (${response.status}): ${body}`);
    }
    return (await response.json()) as HealthResponse;
  }

  /**
   * Retrieve markets with pagination and optional filters.
   */
  async listMarkets(params: ListMarketsParams = {}): Promise<ListMarketsResponse> {
    return this.apiGet<ListMarketsResponse>("/markets", {
      skip: params.skip,
      limit: params.limit,
      orderBy: params.orderBy,
      status: params.status,
      category: params.category,
      verifiable: params.verifiable,
    });
  }

  /**
   * Retrieve a single market by ID.
   */
  async getMarket(params: GetMarketParams): Promise<GetMarketResponse> {
    return this.apiGet<GetMarketResponse>(`/markets/${encodeURIComponent(params.id)}`);
  }

  /**
   * Retrieve positions for a given wallet address.
   */
  async listPositions(params: ListPositionsParams): Promise<ListPositionsResponse> {
    return this.apiGet<ListPositionsResponse>("/positions", {
      wallet: params.wallet,
      skip: params.skip,
      limit: params.limit,
      redeemedOrLiquidated: params.redeemedOrLiquidated,
    });
  }

}
