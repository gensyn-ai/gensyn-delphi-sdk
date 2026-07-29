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
  QuoteRedeemParams,
  QuoteRedeemResponse,
  QuoteLiquidateParams,
  QuoteLiquidateResponse,
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
  Market,
  ListMarketsParams,
  ListMarketsResponse,
  GetMarketParams,
  GetMarketResponse,
  ListPositionsParams,
  ListPositionsResponse,
  MarketStatus,
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
import { ABI as DELPHI_FACTORY_ABI } from "../abi/DelphiFactory.js";
import { ABI as ERC20_ABI } from "../abi/ERC20.js";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureHexPrefix(value: string): string {
  return value.startsWith("0x") ? value : `0x${value}`;
}

// ─── Network Defaults ─────────────────────────────────────────────────────────

/**
 * Per-network contract defaults.
 *
 * Delphi runs two parallel deployments on each network. `gatewayAddress` /
 * `factoryAddress` are the automated-settlement deployment (oracle-settled, where
 * every new market is created); `legacyGatewayAddress` / `legacyFactoryAddress` are
 * the original creator-settled deployment, whose factory is frozen but whose
 * existing markets still hold redeemable positions.
 *
 * Each gateway only accepts markets from its own factory — passing the other
 * deployment's market reverts with `MarketProxyNotDeployedByFactory` — so the
 * client resolves the owning gateway per market (see `resolveGateway`).
 *
 * `subgraphUrl` indexes the automated-settlement gateway only. Legacy-gateway
 * activity lives in the older `delphi-testnet`/`delphi-mainnet` subgraphs; set
 * `subgraphUrl` explicitly to query those.
 */
const NETWORK_DEFAULTS: Record<Network, Partial<DelphiClientConfig>> = {
  testnet: {
    rpcUrl: "https://gensyn-testnet.g.alchemy.com/public",
    chainId: 685685,
    gatewayAddress: "0x22ea355D7218Dc86b4c83732cBbd01f7Ff2332b3" as `0x${string}`,
    factoryAddress: "0x97d2b3F0614C8189343A38094629FCE2910b727A" as `0x${string}`,
    legacyGatewayAddress: "0x7b8FDBD187B0Be5e30e48B1995df574A62667147" as `0x${string}`,
    legacyFactoryAddress: "0xd03CEC55802f0D44D844384E1144B25717315E5A" as `0x${string}`,
    tokenAddress: "0x0724D6079b986F8e44bDafB8a09B60C0bd6A45a1" as `0x${string}`,
    apiBaseUrl: "https://delphi-api.gensyn.ai/",
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-testnet-autoset/1.0.0/gn",
    delphiAppUrl: "https://testnet.delphi.fyi"
  },
  mainnet: {
    rpcUrl: "https://gensyn-mainnet.g.alchemy.com/public",
    chainId: 685689,
    gatewayAddress: "0x982a67aE92D8de361957249fB2BB4a62BCc6A8d5" as `0x${string}`,
    factoryAddress: "0x9C73417f79a1361c6aF9Bd828343badEE1b84936" as `0x${string}`,
    legacyGatewayAddress: "0x4e4e85c52E0F414cc67eE88d0C649Ec81698d700" as `0x${string}`,
    legacyFactoryAddress: "0x4596d847eA56DCf9A37944c13793Af802Fc5D1eC" as `0x${string}`,
    tokenAddress: "0x5b32c997211621d55a89Cc5abAF1cC21F3A6ddF5" as `0x${string}`,
    apiBaseUrl: "https://api.delphi.fyi/",
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-mainnet-autoset/1.0.0/gn",
    delphiAppUrl: "https://app.delphi.fyi"
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
  private readonly legacyGatewayAddress?: `0x${string}`;
  private readonly factoryAddress?: `0x${string}`;
  private readonly legacyFactoryAddress?: `0x${string}`;
  private readonly tokenAddress?: `0x${string}`;

  /** Resolved gateway per market proxy (lowercased). A market never changes deployment. */
  private readonly gatewayByMarket = new Map<string, `0x${string}`>();

  // REST API config
  private readonly apiBaseUrl?: string;
  private readonly apiKey?: string;
  private readonly extraHeaders: Record<string, string>;

  // Subgraph config
  private readonly subgraphUrl?: string;

  // Delphi app URL
  private readonly delphiAppUrl?: string;

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
    const rawPrivateKey = config?.privateKey ?? envPrivateKey;
    this.privateKey = rawPrivateKey
      ? (ensureHexPrefix(rawPrivateKey) as `0x${string}`)
      : undefined;

    // CDP config (user must provide)
    this.cdpApiKeyId = config?.cdpApiKeyId ?? process.env.CDP_API_KEY_ID;
    this.cdpApiKeySecret = config?.cdpApiKeySecret ?? process.env.CDP_API_KEY_SECRET;
    this.cdpWalletSecret = config?.cdpWalletSecret ?? process.env.CDP_WALLET_SECRET;
    const envCdpWalletAddress = process.env.CDP_WALLET_ADDRESS;
    const rawCdpWalletAddress = config?.cdpWalletAddress ?? envCdpWalletAddress;
    this.cdpWalletAddress = rawCdpWalletAddress
      ? (ensureHexPrefix(rawCdpWalletAddress) as `0x${string}`)
      : undefined;

    // Chain config (use network defaults, allow env/config override)
    this.rpcUrl = config?.rpcUrl ?? process.env.GENSYN_RPC_URL ?? networkDefaults.rpcUrl;
    const envChainId = process.env.GENSYN_CHAIN_ID;
    this.chainId = config?.chainId ?? (envChainId ? Number(envChainId) : undefined) ?? networkDefaults.chainId;
    const envGateway = process.env.DELPHI_GATEWAY_CONTRACT;
    this.gatewayAddress = config?.gatewayAddress ?? (envGateway ? (envGateway as `0x${string}`) : undefined) ?? networkDefaults.gatewayAddress;
    // An explicit gatewayAddress (config or env) pins every call to that gateway, so the
    // legacy/automated routing addresses are only defaulted when no override was given.
    const gatewayPinned = Boolean(config?.gatewayAddress ?? envGateway);
    const envLegacyGateway = process.env.DELPHI_LEGACY_GATEWAY_CONTRACT;
    this.legacyGatewayAddress = config?.legacyGatewayAddress
      ?? (envLegacyGateway ? (envLegacyGateway as `0x${string}`) : undefined)
      ?? (gatewayPinned ? undefined : networkDefaults.legacyGatewayAddress);
    this.factoryAddress = config?.factoryAddress
      ?? (process.env.DELPHI_FACTORY_CONTRACT as `0x${string}` | undefined)
      ?? (gatewayPinned ? undefined : networkDefaults.factoryAddress);
    this.legacyFactoryAddress = config?.legacyFactoryAddress
      ?? (process.env.DELPHI_LEGACY_FACTORY_CONTRACT as `0x${string}` | undefined)
      ?? (gatewayPinned ? undefined : networkDefaults.legacyFactoryAddress);
    const envTokenAddress = process.env.DELPHI_TOKEN_ADDRESS;
    this.tokenAddress = config?.tokenAddress ?? (envTokenAddress ? (envTokenAddress as `0x${string}`) : undefined) ?? networkDefaults.tokenAddress;

    // REST API config (use network defaults, allow env/config override)
    const envApiBaseUrl = process.env.DELPHI_API_BASE_URL;
    this.apiBaseUrl = config?.apiBaseUrl ?? envApiBaseUrl ?? networkDefaults.apiBaseUrl;
    // API key must be provided by user (no default)
    this.apiKey = config?.apiKey ?? process.env.DELPHI_API_ACCESS_KEY;

    // Subgraph URL (use network defaults, allow env/config override)
    this.subgraphUrl = config?.subgraphUrl ?? process.env.DELPHI_SUBGRAPH_URL ?? networkDefaults.subgraphUrl;

    // Delphi app URL (use network defaults, allow env/config override)
    this.delphiAppUrl = config?.delphiAppUrl ?? process.env.DELPHI_APP_URL ?? networkDefaults.delphiAppUrl;

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

  /**
   * Resolves which gateway serves `marketAddress`.
   *
   * Delphi runs a legacy (creator-settled) and an automated-settlement deployment
   * side by side. Each gateway rejects the other's markets with
   * `MarketProxyNotDeployedByFactory`, so every market-scoped call has to be routed.
   *
   * Resolution asks both factories whether they deployed the proxy and is cached for
   * the lifetime of the client — a market never moves between deployments. When
   * routing is not configured (e.g. `gatewayAddress` was pinned explicitly) or
   * neither factory claims the market, the configured `gatewayAddress` is used.
   */
  async resolveGateway(marketAddress: `0x${string}`): Promise<`0x${string}`> {
    const [gateway] = await this.resolveGateways([marketAddress]);
    return gateway;
  }

  /**
   * Batch form of {@link resolveGateway} — resolves many markets in a single
   * multicall (two calls: one per factory) instead of one round trip per market.
   */
  private async resolveGateways(
    marketAddresses: `0x${string}`[],
  ): Promise<`0x${string}`[]> {
    const defaultGateway = this.getGatewayAddress();

    // Routing needs both deployments' factories; without them everything goes to
    // the configured gateway (which is also the explicit-override path).
    if (!this.legacyGatewayAddress || !this.factoryAddress || !this.legacyFactoryAddress) {
      return marketAddresses.map(() => defaultGateway);
    }

    const unresolved = [
      ...new Set(
        marketAddresses
          .map((m) => m.toLowerCase())
          .filter((m) => !this.gatewayByMarket.has(m)),
      ),
    ] as `0x${string}`[];

    if (unresolved.length > 0) {
      const { publicClient } = await this.getSigner();
      const factoryAbi = DELPHI_FACTORY_ABI as Abi;

      const [automatedResult, legacyResult] = await publicClient.multicall({
        contracts: [
          {
            address: this.factoryAddress,
            abi: factoryAbi,
            functionName: "marketProxiesExist",
            args: [unresolved],
          },
          {
            address: this.legacyFactoryAddress,
            abi: factoryAbi,
            functionName: "marketProxiesExist",
            args: [unresolved],
          },
        ],
        allowFailure: true,
      });

      const inAutomated =
        automatedResult.status === "success" ? (automatedResult.result as boolean[]) : [];
      const inLegacy =
        legacyResult.status === "success" ? (legacyResult.result as boolean[]) : [];

      unresolved.forEach((market, i) => {
        // Deliberately leave unclaimed markets out of the cache so a later call
        // can retry — a failed multicall must not pin a market to the wrong gateway.
        if (inAutomated[i]) {
          this.gatewayByMarket.set(market, defaultGateway);
        } else if (inLegacy[i]) {
          this.gatewayByMarket.set(market, this.legacyGatewayAddress!);
        }
      });
    }

    return marketAddresses.map(
      (m) => this.gatewayByMarket.get(m.toLowerCase()) ?? defaultGateway,
    );
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
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
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
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
    const { publicClient } = await this.getSigner();

    const tokensOut = (await publicClient.readContract({
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "quoteSellExactIn",
      args: [params.marketAddress, BigInt(params.outcomeIdx), params.sharesIn],
    })) as bigint;

    return { tokensOut };
  }

  /**
   * Quote the proceeds of redeeming winning shares in a settled market, without
   * sending a transaction. Simulates `Gateway.redeem(marketProxy)` via eth_call
   * (no gas) and returns the shares that would be burned and tokens received.
   * Reverts (throws) if the market is not settled or the account holds no
   * winning shares to redeem.
   */
  async quoteRedeem(params: QuoteRedeemParams): Promise<QuoteRedeemResponse> {
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
    const { address, publicClient } = await this.getSigner();

    const { result } = await publicClient.simulateContract({
      account: params.account ?? address,
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "redeem",
      args: [params.marketAddress],
    });

    const [sharesIn, tokensOut] = result as [bigint, bigint];
    return { sharesIn, tokensOut };
  }

  /**
   * Quote the proceeds of liquidating positions in an expired (unsettled) market,
   * without sending a transaction. Simulates `Gateway.liquidate(marketProxy,
   * outcomeIndices)` via eth_call (no gas) and returns the shares that would be
   * burned per outcome and the total tokens received. Reverts (throws) if the
   * market is not liquidatable or the account holds no shares in those outcomes.
   */
  async quoteLiquidate(params: QuoteLiquidateParams): Promise<QuoteLiquidateResponse> {
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
    const { address, publicClient } = await this.getSigner();

    const outcomeIndicesBigInt = params.outcomeIndices.map((idx) => BigInt(idx));

    const { result } = await publicClient.simulateContract({
      account: params.account ?? address,
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "liquidate",
      args: [params.marketAddress, outcomeIndicesBigInt],
    });

    const [sharesIn, totalTokensOut] = result as [bigint[], bigint];
    return { sharesIn, totalTokensOut };
  }

  // ─── Buy / Sell (on-chain via Gateway) ──────────────────────────────────────

  async buyShares(params: BuySharesParams): Promise<BuySharesResponse> {
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
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
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
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
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
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

  /**
   * Redeems winning shares across several settled markets, collecting per-market
   * results instead of failing the whole batch on the first error.
   *
   * Only `settled` markets are redeemable. `expired` and `failed` markets have no
   * winning outcome, so `redeem()` reverts for them and their funds are recovered
   * with {@link liquidate} instead — check {@link getMarketStatus} when a portfolio
   * may contain them.
   */
  async redeemPositions(params: RedeemPositionsParams): Promise<RedeemPositionsResponse> {
    const results: RedeemPositionsResponse["results"] = [];
    let totalTokensOut = 0n;

    // Resolve the whole batch in one multicall so the per-market `redeemMarket`
    // calls below hit the cache, instead of one routing round trip per market.
    // Routing failures are not fatal here: an unresolved market falls back to the
    // default gateway and surfaces as that market's own error.
    try {
      await this.resolveGateways(params.marketAddresses);
    } catch {
      // Ignore — resolution is retried per market by redeemMarket.
    }

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
    const gatewayAddress = await this.resolveGateway(params.marketAddress);
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

  // ─── Market Status (on-chain, read-only) ────────────────────────────────────

  /**
   * Reads a market's lifecycle status directly from its gateway.
   *
   * Unlike {@link getMarket}, this hits the chain rather than the indexed REST API,
   * so it reflects state that has not been indexed yet. Automated-settlement markets
   * can report `failed` (the oracle ran but could not resolve the question); legacy
   * markets never do.
   *
   * `settled` markets are exited with {@link redeemMarket}; `expired` and `failed`
   * markets have no winning outcome and are exited with {@link liquidate}.
   */
  async getMarketStatus(marketAddress: `0x${string}`): Promise<MarketStatus> {
    const gatewayAddress = await this.resolveGateway(marketAddress);
    const { publicClient } = await this.getSigner();

    const status = (await publicClient.readContract({
      address: gatewayAddress,
      abi: DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi,
      functionName: "marketStatus",
      args: [marketAddress],
    })) as number;

    // IDynamicParimutuelMarketTypes.MarketStatus. FAILED (4) exists only on the
    // automated-settlement implementation.
    const statuses: MarketStatus[] = [
      "open",
      "awaiting_settlement",
      "settled",
      "expired",
      "failed",
    ];
    const mapped = statuses[Number(status)];
    if (!mapped) {
      throw new Error(
        `Unknown market status ${status} for ${marketAddress} — the gateway ABI may be out of date.`,
      );
    }
    return mapped;
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

  private getDelphiAppUrl(): string {
    if (!this.delphiAppUrl) {
      throw new Error("Requires delphiAppUrl. Set DELPHI_APP_URL environment variable.");
    }
    return this.delphiAppUrl.replace(/\/+$/, ""); // strip trailing slash
  }

  private buildMarketUrl(appMarketId: string): string {
    return `${this.getDelphiAppUrl()}/market/${appMarketId}`;
  }

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
   * Fetches on-chain spot prices and implied probabilities for a batch of markets
   * using a single multicall (includes token decimals lookup).
   * Outcome counts are derived from market metadata.
   * Returns human-readable floats: spot prices decimal-adjusted by the token,
   * implied probabilities as values between 0 and 1.
   *
   * Markets are addressed through their own deployment's gateway, so a batch may
   * legitimately span both the legacy and automated gateways.
   */
  private async fetchPricesForMarkets(
    markets: Market[],
  ): Promise<Map<string, { spotPrices: number[]; spotImpliedProbabilities: number[] }>> {
    const result = new Map<string, { spotPrices: number[]; spotImpliedProbabilities: number[] }>();
    if (markets.length === 0) return result;

    const tokenAddress = this.getTokenAddress();
    const { publicClient } = await this.getSigner();
    const gatewayAbi = DYNAMIC_PARIMUTUEL_GATEWAY_ABI as Abi;
    const erc20Abi = ERC20_ABI as Abi;

    // Resolve every market's gateway up front (one batched multicall) so the price
    // calls below can be mixed across deployments in a single round trip.
    const gateways = await this.resolveGateways(markets.map((m) => m.id as `0x${string}`));

    // Accumulate spotPrices + spotImpliedProbabilities contracts per market.
    // Slot indices below are relative to the price contracts array (before prepending decimals).
    const priceContracts: { address: `0x${string}`; abi: Abi; functionName: string; args: unknown[] }[] = [];
    const marketPriceSlots: { marketId: string; slotPrices: number; slotProbs: number }[] = [];

    markets.forEach((m, marketIdx) => {
      const n = m.metadata?.outcomes?.length ?? 0;
      if (n === 0) {
        result.set(m.id, { spotPrices: [], spotImpliedProbabilities: [] });
        return;
      }
      const gatewayAddress = gateways[marketIdx];
      const indices = Array.from({ length: n }, (_, j) => BigInt(j));
      marketPriceSlots.push({
        marketId: m.id,
        slotPrices: priceContracts.length,
        slotProbs: priceContracts.length + 1,
      });
      priceContracts.push(
        { address: gatewayAddress, abi: gatewayAbi, functionName: "spotPrices", args: [m.id as `0x${string}`, indices] },
        { address: gatewayAddress, abi: gatewayAbi, functionName: "spotImpliedProbabilities", args: [m.id as `0x${string}`, indices] },
      );
    });

    if (priceContracts.length === 0) return result;

    // Prepend a decimals() call so everything lands in one multicall.
    const decimalsContract = { address: tokenAddress, abi: erc20Abi, functionName: "decimals", args: [] };
    const allResults = await publicClient.multicall({
      contracts: [decimalsContract, ...priceContracts],
      allowFailure: true,
    });

    const tokenDecimals = allResults[0].status === "success" ? Number(allResults[0].result as number) : 18;
    const priceResults = allResults.slice(1);

    for (const { marketId, slotPrices, slotProbs } of marketPriceSlots) {
      const pr = priceResults[slotPrices];
      const probr = priceResults[slotProbs];
      const divisorPrice = 10 ** tokenDecimals;
      result.set(marketId, {
        spotPrices: pr?.status === "success"
          ? (pr.result as bigint[]).map((v) => Number(v) / divisorPrice)
          : [],
        spotImpliedProbabilities: probr?.status === "success"
          ? (probr.result as bigint[]).map((v) => Number(v) / 1e18)
          : [],
      });
    }

    return result;
  }

  /**
   * Retrieve markets with pagination and optional filters.
   */
  async listMarkets(params: ListMarketsParams = {}): Promise<ListMarketsResponse> {
    const response = await this.apiGet<ListMarketsResponse>("/markets", {
      skip: params.skip,
      limit: params.limit,
      orderBy: params.orderBy,
      status: params.status,
      category: params.category,
      verifiable: params.verifiable,
    });

    const markets = response.markets?.map((m) => ({ ...m, marketUrl: this.buildMarketUrl(m.appMarketId) })) ?? null;

    if (params.pricesAndImpliedProbabilities && markets && markets.length > 0) {
      const priceMap = await this.fetchPricesForMarkets(markets);
      return {
        ...response,
        markets: markets.map((m) => {
          const prices = priceMap.get(m.id);
          return prices ? { ...m, ...prices } : m;
        }),
      };
    }

    return { ...response, markets };
  }

  /**
   * Retrieve a single market by ID.
   */
  async getMarket(params: GetMarketParams): Promise<GetMarketResponse> {
    const market = await this.apiGet<GetMarketResponse>(`/markets/${encodeURIComponent(params.id)}`);
    const enriched = { ...market, marketUrl: this.buildMarketUrl(market.appMarketId) };

    if (params.pricesAndImpliedProbabilities) {
      const priceMap = await this.fetchPricesForMarkets([enriched]);
      const prices = priceMap.get(enriched.id);
      if (prices) return { ...enriched, ...prices };
    }

    return enriched;
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
