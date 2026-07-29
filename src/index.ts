// ─── Client ──────────────────────────────────────────────────────────────────
export { DelphiClient } from "./client/DelphiClient.js";

// ─── Signer ──────────────────────────────────────────────────────────────────
export { createPrivateKeySigner, createCdpSigner } from "./client/signer.js";
export type {
  DelphiSigner,
  PrivateKeySignerConfig,
  CdpSignerConfig,
} from "./client/signer.js";

// ─── Subgraph ────────────────────────────────────────────────────────────────
export { SubgraphClient } from "./client/subgraph.js";

// ─── ABIs ────────────────────────────────────────────────────────────────────
export { ABI as DYNAMIC_PARIMUTUEL_GATEWAY_ABI } from "./abi/DynamicParimutuelGateway.js";
export { ABI as DELPHI_FACTORY_ABI } from "./abi/DelphiFactory.js";
export { ABI as ERC20_ABI } from "./abi/ERC20.js";

// ─── Constants ───────────────────────────────────────────────────────────────
export { LIQUIDATABLE_MARKET_STATUSES } from "./types/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  DelphiClientConfig,
  Network,
  SignerType,
  MarketStatus,
  MarketDeployment,
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
  RedeemMarketParams,
  RedeemMarketResponse,
  RedeemPositionsParams,
  RedeemPositionsResponse,
  RedeemPositionResult,
  LiquidateParams,
  LiquidateResponse,
  GetTokenAllowanceParams,
  GetTokenAllowanceResponse,
  ApproveTokenParams,
  ApproveTokenResponse,
  EnsureTokenApprovalParams,
  EnsureTokenApprovalResponse,
  Market,
  ListMarketsParams,
  ListMarketsResponse,
  GetMarketParams,
  GetMarketResponse,
  Position,
  ListPositionsParams,
  ListPositionsResponse,
  HealthResponse,
  SubgraphBuy,
  SubgraphSell,
  SubgraphMarketSettled,
  SubgraphMarketFailed,
  SubgraphMarketResolutionRequested,
  SubgraphMeta,
} from "./types/index.js";
