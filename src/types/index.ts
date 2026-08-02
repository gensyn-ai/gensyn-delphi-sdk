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

export interface QuoteRedeemParams {
  /** Settled market proxy contract address */
  marketAddress: `0x${string}`;
  /** Wallet to quote redemption for (defaults to the configured signer's address) */
  account?: `0x${string}`;
}

export interface QuoteRedeemResponse {
  /** Winning outcome shares that would be burned on redemption */
  sharesIn: bigint;
  /** Collateral tokens you would receive (the redemption payout) */
  tokensOut: bigint;
}

export interface QuoteLiquidateParams {
  /** Expired (unsettled) market proxy contract address */
  marketAddress: `0x${string}`;
  /** Outcome indices to quote liquidation for (0-based) */
  outcomeIndices: number[];
  /** Wallet to quote liquidation for (defaults to the configured signer's address) */
  account?: `0x${string}`;
}

export interface QuoteLiquidateResponse {
  /** Shares that would be burned per outcome index */
  sharesIn: bigint[];
  /** Total collateral tokens you would receive across the given outcomes */
  totalTokensOut: bigint;
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

// ─── Market Status ────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a market.
 *
 * | Status                | Meaning                                                          |
 * |-----------------------|------------------------------------------------------------------|
 * | `open`                | Trading is open.                                                 |
 * | `awaiting_settlement` | Trading closed, awaiting a winning outcome.                      |
 * | `settled`             | A winning outcome was set — holders `redeem()`.                  |
 * | `expired`             | Settlement deadline passed with no winner — holders `liquidate()`.|
 * | `failed`              | Settlement ran but could not resolve — holders `liquidate()`.    |
 *
 * `failed` only occurs on automated-settlement markets: the oracle explicitly
 * failed to resolve the question. Like `expired` it has no winning outcome, so
 * `redeem()` reverts and funds are recovered via `liquidate()` instead.
 */
export type MarketStatus =
  | "open"
  | "awaiting_settlement"
  | "settled"
  | "expired"
  | "failed";

/**
 * Market statuses that have no winning outcome and must be exited via `liquidate()`
 * rather than `redeem()`.
 *
 * Typed as `readonly MarketStatus[]` (not a literal tuple) so `.includes()` accepts any
 * `MarketStatus` without a cast.
 */
export const LIQUIDATABLE_MARKET_STATUSES: readonly MarketStatus[] = ["expired", "failed"];

/**
 * Which on-chain deployment a market belongs to.
 *
 * `automated` markets settle via the Truebit oracle relayer and can end up
 * `failed`; `legacy` markets are settled manually by the market creator. The two
 * deployments have separate factories and gateways and do not interoperate.
 */
export type MarketDeployment = "legacy" | "automated";

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
  status: MarketStatus;
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
  status?: MarketStatus;
  /** Filter by market category (crypto, culture, economics, miscellaneous, politics, sports) */
  category?: string;
  /** Filter by verifiable settlement */
  verifiable?: boolean;
  /** Competition UUID to read markets from (competition networks only). When omitted, the API defaults to the active competition. */
  competitionId?: string;
  /** When true, fetches on-chain spot prices and implied probabilities for each market's outcomes via multicall (default false) */
  pricesAndImpliedProbabilities?: boolean;
}

export interface ListMarketsResponse {
  markets: Market[] | null;
}

export interface GetMarketParams {
  /** Market ID */
  id: string;
  /** Competition UUID to read the market from (competition networks only); a market outside it is reported as not found. When omitted, the API defaults to the active competition. */
  competitionId?: string;
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
  marketStatus: MarketStatus;
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

/**
 * Oracle-driven settlement on the automated-settlement gateway.
 *
 * Replaces the legacy gateway's `gatewayWinnerSubmitteds` entity and carries an
 * identical payload — the legacy subgraph has the old name, this one the new.
 */
export interface SubgraphMarketSettled {
  id: string;
  block_number: string;
  timestamp_: string;
  transactionHash_: string;
  contractId_: string;
  marketProxy: string | null;
  winningOutcomeIdx: string | null;
  marketCreatorReward: string | null;
  refund: string | null;
  marketCreatorTradingFeesCut: string | null;
}

/**
 * The oracle ran but could not resolve the market. There is no winning outcome,
 * so holders exit via `liquidate()` rather than `redeem()`.
 */
export interface SubgraphMarketFailed {
  id: string;
  block_number: string;
  timestamp_: string;
  transactionHash_: string;
  contractId_: string;
  marketProxy: string | null;
}

/** A keeper triggered oracle resolution for a market. */
export interface SubgraphMarketResolutionRequested {
  id: string;
  block_number: string;
  timestamp_: string;
  transactionHash_: string;
  contractId_: string;
  marketProxy: string | null;
  keeper: string | null;
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
export type Network = "testnet" | "mainnet" | "competition-testnet";

// ─── Client Configuration ─────────────────────────────────────────────────────

export interface DelphiClientConfig {
  /** Network to use: "testnet", "mainnet" or "competition-testnet". Default: `"testnet"`. */
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
  /**
   * Gateway for the automated-settlement deployment — where all new markets live.
   *
   * Used as the default for any market the client cannot attribute to a specific
   * deployment. Set this to pin every call to one gateway and skip routing.
   */
  gatewayAddress?: `0x${string}`;
  /**
   * Gateway for the legacy (creator-settled) deployment. Its factory no longer
   * produces markets, but existing positions there still need redeem/liquidate,
   * so the client routes to it for markets deployed by `legacyFactoryAddress`.
   */
  legacyGatewayAddress?: `0x${string}`;
  /** Factory backing `gatewayAddress`. Used to attribute a market to the automated deployment. */
  factoryAddress?: `0x${string}`;
  /** Factory backing `legacyGatewayAddress`. Used to attribute a market to the legacy deployment. */
  legacyFactoryAddress?: `0x${string}`;
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
