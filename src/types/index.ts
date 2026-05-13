// ─── Buy Shares (via Gateway.buyExactOut) ────────────────────────────────────

export interface BuySharesParams {
  /** Market proxy contract address */
  marketAddress: `0x${string}`;
  /** Outcome index to buy shares for (0-based) */
  outcomeIdx: number;
  /** Exact number of outcome shares to receive (18 decimals) */
  sharesOut: bigint;
  /** Maximum tokens willing to spend (slippage protection) */
  maxTokensIn: bigint;
}

export interface BuySharesResponse {
  transactionHash: `0x${string}`;
}

// ─── Sell Shares (via Gateway.sellExactIn) ───────────────────────────────────

export interface SellSharesParams {
  /** Market proxy contract address */
  marketAddress: `0x${string}`;
  /** Outcome index to sell shares for (0-based) */
  outcomeIdx: number;
  /** Exact number of outcome shares to sell (18 decimals) */
  sharesIn: bigint;
  /** Minimum tokens to receive back (slippage protection) */
  minTokensOut: bigint;
}

export interface SellSharesResponse {
  transactionHash: `0x${string}`;
}

// ─── Quote (read-only, no gas) ───────────────────────────────────────────────

export interface QuoteBuyParams {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  sharesOut: bigint;
}

export interface QuoteBuyResponse {
  /** Estimated tokens required to buy the requested shares */
  tokensIn: bigint;
}

export interface QuoteSellParams {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  sharesIn: bigint;
}

export interface QuoteSellResponse {
  /** Estimated tokens you will receive for the shares */
  tokensOut: bigint;
}

// ─── Redeem / Liquidate (via Gateway) ─────────────────────────────────────────

export interface RedeemMarketParams {
  marketAddress: `0x${string}`;
}

export interface RedeemMarketResponse {
  marketAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  /** Number of outcome shares burned */
  sharesIn: bigint;
  /** Number of collateral tokens received */
  tokensOut: bigint;
}

export interface RedeemPositionsParams {
  marketAddresses: `0x${string}`[];
}

export interface RedeemPositionResult {
  marketAddress: `0x${string}`;
  success: boolean;
  transactionHash?: `0x${string}`;
  /** Number of outcome shares burned */
  sharesIn?: bigint;
  /** Number of collateral tokens received */
  tokensOut?: bigint;
  error?: string;
}

export interface RedeemPositionsResponse {
  results: RedeemPositionResult[];
  totalTokensOut: bigint;
}

export interface LiquidateParams {
  /** Market proxy contract address */
  marketAddress: `0x${string}`;
  /**
   * Outcome indices to liquidate (0-based).
   * Typically you will pass all outcome indices for an expired market.
   */
  outcomeIndices: number[];
}

export interface LiquidateResponse {
  marketAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  /** Number of outcome shares burned per outcome index */
  sharesIn: bigint[];
  /** Total number of collateral tokens received across all outcomes */
  totalTokensOut: bigint;
}

// ─── Token Allowance ─────────────────────────────────────────────────────────

export interface GetTokenAllowanceParams {
  /** Market proxy contract address (used to resolve the token and as the spender) */
  marketAddress: `0x${string}`;
}

export interface GetTokenAllowanceResponse {
  ownerAddress: `0x${string}`;
  allowance: bigint;
}

// ─── Token Approval ──────────────────────────────────────────────────────────

export interface ApproveTokenParams {
  /** Market proxy contract address (used to resolve the token and as the spender) */
  marketAddress: `0x${string}`;
  /** Amount to approve. Defaults to max uint256 (unlimited). */
  amount?: bigint;
}

export interface ApproveTokenResponse {
  transactionHash: `0x${string}`;
}

// ─── Ensure Token Approval ───────────────────────────────────────────────────

export interface EnsureTokenApprovalParams {
  /** Market proxy contract address (used to resolve the token and as the spender) */
  marketAddress: `0x${string}`;
  /** Minimum allowance required. If current allowance >= this, no tx is sent. */
  minimumAmount: bigint;
  /** Amount to approve if approval is needed. Defaults to max uint256. */
  approveAmount?: bigint;
}

export interface EnsureTokenApprovalResponse {
  approvalNeeded: boolean;
  allowance: bigint;
  transactionHash?: `0x${string}`;
}

// ─── REST API: Market ─────────────────────────────────────────────────────────

export interface MarketMetadata {
  question: string;
  outcomes: string[];
  model?: {
    model_identifier?: string;
    prompt_context?: string;
  };
  initial_liquidity?: string;
  initial_pool?: string;
  refund?: string;
  market_creation_fee?: string;
  version?: string;
  [key: string]: unknown;
}

export interface Market {
  /** On-chain contract address of the market proxy */
  id: string;
  /** UUID identifying the market in the Delphi app UI */
  appMarketId: string;
  /** Direct link to the market on the Delphi app */
  marketUrl: string;
  status: string;
  category: string;
  /** Wallet address of the market creator */
  deployer: string;
  implementation: string;
  metadataUri: string;
  metadataUriContentHash: string;
  metadata: MarketMetadata | null;
  dataSources: unknown;
  createdAt: string;
  fetchedAt: string | null;
  fetchResponseStatus: string | null;
  resolvesAt: string | null;
  settledAt: string | null;
  settlesAt: string | null;
  winningOutcomeIdx: string | null;
  tradingFee: string | null;
  proof: string | null;
  error: string | null;
  verifiable: boolean;
  /** Spot price per outcome, decimal-adjusted to a human-readable float. Only present when pricesAndImpliedProbabilities is requested. */
  spotPrices?: number[];
  /** Implied probability per outcome as a value between 0 and 1. Only present when pricesAndImpliedProbabilities is requested. */
  spotImpliedProbabilities?: number[];
}

export interface ListMarketsParams {
  /** Number of records to skip (default 0) */
  skip?: number;
  /** Max number of records to return (default 50) */
  limit?: number;
  /** Sort order: "liquidity" (default, volume + initial liquidity) | "created" (newest first) | "settles_at" (earliest settlement first) */
  orderBy?: string;
  /** Filter by market status */
  status?: string;
  /** Filter by market category (crypto, culture, economics, miscellaneous, politics, sports) */
  category?: string;
  /** Filter by verifiable settlement */
  verifiable?: boolean;
  /** When true, fetches on-chain spot prices and implied probabilities for each market's outcomes via multicall (default false) */
  pricesAndImpliedProbabilities?: boolean;
}

export interface ListMarketsResponse {
  markets: Market[] | null;
}

export interface GetMarketParams {
  /** Market ID */
  id: string;
  /** When true, fetches on-chain spot prices and implied probabilities for the market's outcomes (default false) */
  pricesAndImpliedProbabilities?: boolean;
}

export type GetMarketResponse = Market;

// ─── REST API: Position ──────────────────────────────────────────────────────

export interface Position {
  id: string;
  marketProxy: string;
  wallet: string;
  outcomeIdx: string;
  shares: string;
  /** True if the position has been redeemed or liquidated */
  redeemedOrLiquidated: boolean;
  tokensRedeemed: string;
  marketStatus: string;
}

export interface ListPositionsParams {
  /** Wallet address to filter positions by (required) */
  wallet: string;
  /** Number of records to skip (default 0) */
  skip?: number;
  /** Max number of records to return (default 50) */
  limit?: number;
  /** Filter by redeemedOrLiquidated status */
  redeemedOrLiquidated?: boolean;
}

export interface ListPositionsResponse {
  positions: Position[] | null;
}

// ─── REST API: Health ─────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
}

// ─── Subgraph: Entity Types ───────────────────────────────────────────────────

export interface SubgraphBuy {
  id: string;
  block_number: string;
  timestamp_: string;
  transactionHash_: string;
  contractId_: string;
  marketProxy: string | null;
  buyer: string | null;
  outcomeIdx: string | null;
  tokensIn: string | null;
  sharesOut: string | null;
}

export interface SubgraphSell {
  id: string;
  block_number: string;
  timestamp_: string;
  transactionHash_: string;
  contractId_: string;
  marketProxy: string | null;
  seller: string | null;
  outcomeIdx: string | null;
  sharesIn: string | null;
  tokensOut: string | null;
}

export interface SubgraphMeta {
  block: { number: number; timestamp: number | null; hash: string | null };
  deployment: string;
  hasIndexingErrors: boolean;
}

// ─── Signer Type ──────────────────────────────────────────────────────────────

/**
 * `"cdp_server_wallet"` — CDP Server Wallet v2 (default).
 * `"private_key"` — Sign locally with a hex private key.
 */
export type SignerType = "private_key" | "cdp_server_wallet";
export type Network = "testnet" | "mainnet";

// ─── Client Configuration ─────────────────────────────────────────────────────

export interface DelphiClientConfig {
  /** Network to use: "testnet" or "mainnet". Default: `"testnet"`. */
  network?: Network;
  /** Which signing mechanism to use. Default: `"cdp_server_wallet"`. */
  signerType?: SignerType;

  // ── Private-key signer ─────────────────────────────────────────────────────
  privateKey?: `0x${string}`;

  // ── CDP Server Wallet signer ───────────────────────────────────────────────
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  cdpWalletSecret?: string;
  cdpWalletAddress?: `0x${string}`;

  // ── Shared chain config ────────────────────────────────────────────────────
  rpcUrl?: string;
  chainId?: number;
  gatewayAddress?: `0x${string}`;
  /** ERC-20 token address used for all markets. Falls back to DELPHI_TOKEN_ADDRESS env var, then network default. */
  tokenAddress?: `0x${string}`;

  // ── REST API config ───────────────────────────────────────────────────────
  apiBaseUrl?: string;
  apiKey?: string;

  // ── Subgraph (Goldsky) config ─────────────────────────────────────────────
  /** Goldsky subgraph GraphQL endpoint. Falls back to DELPHI_SUBGRAPH_URL env var, then network default. */
  subgraphUrl?: string;

  // ── Delphi App URL ─────────────────────────────────────────────────────────
  /** URL of the Delphi app. Falls back to DELPHI_APP_URL env var, then network default. */
  delphiAppUrl?: string;
}
