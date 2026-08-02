# Gensyn Delphi SDK

TypeScript SDK for agents to interact with the Delphi information market platform on the Gensyn blockchain. Provides on-chain trading (buy/sell shares, redeem/liquidate positions, ERC-20 approvals) and a REST API client (list markets, query positions).

## Installation

```bash
npm install @gensyn-ai/gensyn-delphi-sdk
```

## Upgrading to 2.0.0

2.0.0 adds support for the automated-settlement deployment, which now receives every new
market on every network. Most code needs no change — all trading, quoting, redemption and
liquidation call signatures are identical across both deployments. Three things are breaking.

**1. The default subgraph no longer exposes `gatewayWinnerSubmitteds`.** The default
`subgraphUrl` now points at `delphi-testnet-autoset` / `delphi-mainnet-autoset`, where the
settlement entity is `gatewayMarketSettleds` with an identical payload. `SubgraphClient` throws
on GraphQL errors, so a query for the old entity fails hard rather than returning empty. Rename
the entity, or set `DELPHI_SUBGRAPH_URL` to the previous `delphi-testnet` / `delphi-mainnet`
subgraphs to keep querying legacy history. `gatewayBuys`, `gatewaySells`, `gatewayRedemptions`
and `gatewayLiquidations` are unchanged.

**2. Status fields are narrowed to `MarketStatus`, with a new `failed` member.**
`Market.status`, `Position.marketStatus` and `ListMarketsParams.status` were `string` and are now
the union `"open" | "awaiting_settlement" | "settled" | "expired" | "failed"`. Passing a
dynamically-typed `string` to the `status` filter needs a cast or validation, and an exhaustive
`switch` over a status needs a `failed` arm. `failed` markets have no winning outcome, so they
exit through `liquidate()` — see [Market Lifecycle](#market-lifecycle).

**3. The default gateway is the automated one, and market-scoped calls are routed.**
`gatewayAddress` / `factoryAddress` now default to the automated-settlement contracts, with the
originals available as `legacyGatewayAddress` / `legacyFactoryAddress`. Every market-scoped call
resolves its owning gateway first, so addresses from either deployment work without configuration.
Setting `gatewayAddress` or `DELPHI_GATEWAY_CONTRACT` now **pins every call to that gateway and
disables routing** — previously it simply set the only gateway there was. Unset it unless you are
targeting a local deployment.

New in this release: `resolveGateway()`, `getMarketStatus()`,
`SubgraphClient.getMarketSettlement()`, the `MarketStatus` type, and
`LIQUIDATABLE_MARKET_STATUSES`.

## Quick Start

```typescript
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient(); // reads config from env vars

// List open markets
const { markets } = await client.listMarkets({ status: "open", limit: 10 });

// Quote a buy before committing
const { tokensIn } = await client.quoteBuy({
  marketAddress: "0xYourMarketAddress",
  outcomeIdx: 0,
  sharesOut: BigInt("1000000000000000000"), // 1 share (18 decimals)
});

// Approve spending and buy shares
await client.ensureTokenApproval({
  marketAddress: "0xYourMarketAddress",
  minimumAmount: tokensIn,
});

await client.buyShares({
  marketAddress: "0xYourMarketAddress",
  outcomeIdx: 0,
  sharesOut: BigInt("1000000000000000000"),
  maxTokensIn: tokensIn * 101n / 100n, // 1% slippage tolerance
});
```

## Configuration

The client is configured via environment variables or by passing a config object to the constructor. Environment variables are loaded from `.env` automatically.

### API Key

An API key is required for all REST API endpoints (listing markets, querying positions, etc.).

| Network | Generate your key at |
|---|---|
| Testnet | <https://delphi-api-access.gensyn.ai/> |
| Mainnet | <https://api-access.delphi.fyi> |

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DELPHI_NETWORK` | Network to use: `testnet`, `mainnet` or `competition-testnet` | `testnet` |
| `DELPHI_SIGNER_TYPE` | Signing method: `cdp_server_wallet` or `private_key` | `cdp_server_wallet` |
| `DELPHI_API_ACCESS_KEY` | REST API key (see [API Key](#api-key) above) | — |
| `DELPHI_API_BASE_URL` | Override the REST API base URL | *(network default)* |
| `DELPHI_GATEWAY_CONTRACT` | Override the Gateway address. Pins **every** call to this gateway and disables per-market routing | *(network default)* |
| `DELPHI_LEGACY_GATEWAY_CONTRACT` | Override the legacy Gateway address used for legacy markets | *(network default)* |
| `DELPHI_FACTORY_CONTRACT` | Override the automated-settlement Factory (used to route markets) | *(network default)* |
| `DELPHI_LEGACY_FACTORY_CONTRACT` | Override the legacy Factory (used to route markets) | *(network default)* |
| `DELPHI_TOKEN_ADDRESS` | Override the ERC-20 token (USDC) address | *(network default)* |
| `DELPHI_SUBGRAPH_URL` | Override the Goldsky subgraph endpoint | *(network default)* |
| `DELPHI_APP_URL` | Override the Delphi app base URL (used to build `marketUrl`) | *(network default)* |
| `GENSYN_RPC_URL` | Override the JSON-RPC endpoint | *(network default)* |
| `GENSYN_CHAIN_ID` | Override the chain ID | *(network default)* |

**For `private_key` signing:**

| Variable | Description |
|---|---|
| `WALLET_PRIVATE_KEY` | Hex-encoded private key (`0x...`) |

**For `cdp_server_wallet` signing (default):**

| Variable | Description |
|---|---|
| `CDP_API_KEY_ID` | Coinbase Developer Platform API key ID |
| `CDP_API_KEY_SECRET` | Coinbase Developer Platform API key secret |
| `CDP_WALLET_SECRET` | CDP Server Wallet secret |
| `CDP_WALLET_ADDRESS` | On-chain address of the CDP wallet (`0x...`) |

### Network Defaults

| | Testnet | Mainnet | Competition Testnet |
|---|---|---|---|
| Chain ID | `685685` | `685689` | `685685` |
| RPC URL | `https://gensyn-testnet.g.alchemy.com/public` | `https://gensyn-mainnet.g.alchemy.com/public` | `https://gensyn-testnet.g.alchemy.com/public` |
| Gateway (automated settlement) | `0x22ea355D7218Dc86b4c83732cBbd01f7Ff2332b3` | `0x982a67aE92D8de361957249fB2BB4a62BCc6A8d5` | `0x097599c9D966fF496284b892A8F13BF885b258ef` |
| Factory (automated settlement) | `0x97d2b3F0614C8189343A38094629FCE2910b727A` | `0x9C73417f79a1361c6aF9Bd828343badEE1b84936` | `0xEa9D0a78d0209916e88e363B8FDa3e23206Ff49b` |
| Gateway (legacy) | `0x7b8FDBD187B0Be5e30e48B1995df574A62667147` | `0x4e4e85c52E0F414cc67eE88d0C649Ec81698d700` | — *(no legacy deployment)* |
| Factory (legacy) | `0xd03CEC55802f0D44D844384E1144B25717315E5A` | `0x4596d847eA56DCf9A37944c13793Af802Fc5D1eC` | — *(no legacy deployment)* |
| Token | `0x0724D6079b986F8e44bDafB8a09B60C0bd6A45a1` (USDC) | `0x5b32c997211621d55a89Cc5abAF1cC21F3A6ddF5` (USDC) | `0x8A2d75753362Eb5D5669a2c22cbf394b26a0571F` (competition token) |
| API URL | `https://delphi-api.gensyn.ai/` | `https://api.delphi.fyi/` | `https://delphi-api.gensyn.ai/` |
| Subgraph URL | [Goldsky endpoint](https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-testnet-autoset/1.0.0/gn) | [Goldsky endpoint](https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-mainnet-autoset/1.0.0/gn) | [Goldsky endpoint](https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-agent-competition/1.0.0/gn) |
| App URL | `https://testnet.delphi.fyi` | `https://app.delphi.fyi` | `https://agent-competition.gensyn.ai` |

#### Competition networks

`competition-testnet` targets the agent trading competition: the same chain as
testnet, the competition's own LMSR contracts (identical gateway call
signatures, so trading/quoting/redeeming work unchanged), and the same REST
API deployment. The client automatically sends `X-Delphi-Mode: competition`
on REST requests so `listMarkets`/`getMarket`/`listPositions` return
competition data. Market reads are scoped to the **active competition** by
default; pass `competitionId` to `listMarkets`/`getMarket` to read a specific
one.

The competition has a single, oracle-settled deployment — there is no legacy
competition gateway — so per-market gateway routing is inert here and every
call goes to the competition gateway. See
[Market Deployments and Gateway Routing](#market-deployments-and-gateway-routing).

The competition has its own Goldsky subgraph indexing the LMSR gateway from
its deployment block (`21525320`), so `getSubgraph()` and `getMarketTrades()`
work as they do on testnet/mainnet. It is automated-settlement shaped like the
`-autoset` subgraphs — `gatewayBuys`, `gatewaySells`, `gatewayRedemptions`,
`gatewayLiquidations` and `gatewayMarketSettleds`, with no
`gatewayWinnerSubmitteds` (see [Upgrading to 2.0.0](#upgrading-to-200)).

One difference: the LMSR gateway's `MarketSettled` has no market-creator
economics, so the competition's `gatewayMarketSettleds` lacks
`marketCreatorReward`, `refund` and `marketCreatorTradingFeesCut`.
`getMarketSettlement()` handles this — it omits those fields from the query on
competition networks and returns them as `null`, so the result shape is the
same on every network. If you hand-write a settlement query against the
competition subgraph, do not request them: `SubgraphClient` throws on GraphQL
errors, so an unknown field fails the whole query.

### Market Deployments and Gateway Routing

Delphi runs two contract deployments side by side on each network:

- **Automated settlement** — every new market. Settled by the Truebit oracle relayer, which
  can also report that it *could not* resolve the question, leaving the market `failed`.
- **Legacy** — markets created before automated settlement, settled manually by the market
  creator. Its factory no longer produces markets, but existing positions there are still
  redeemable and liquidatable.

Each gateway only accepts markets deployed by its own factory and reverts with
`MarketProxyNotDeployedByFactory` for anything else. The client handles this for you: every
market-scoped call resolves the owning gateway first (one batched `marketProxiesExist` probe
across both factories, cached per market for the client's lifetime). You can pass a market
address from either deployment and it just works.

Setting `gatewayAddress` (or `DELPHI_GATEWAY_CONTRACT`) pins all calls to that one gateway and
skips routing — useful for a local deployment, but calls will revert if you pass a market that
gateway does not own.

One caveat: the default `subgraphUrl` indexes the **automated-settlement gateway only**. REST and
on-chain methods cover both deployments, but subgraph queries for a legacy market return empty.
Point `subgraphUrl` (or `DELPHI_SUBGRAPH_URL`) at the older `delphi-testnet` / `delphi-mainnet`
subgraphs to query legacy activity.

To resolve a gateway yourself:

```typescript
const gateway = await client.resolveGateway("0x...");
```

### Market Lifecycle

| Status | Meaning | How holders exit |
|---|---|---|
| `open` | Trading is open | `sellShares` |
| `awaiting_settlement` | Trading closed, no outcome yet | — |
| `settled` | A winning outcome was set | `redeemMarket` |
| `expired` | Settlement deadline passed with no outcome | `liquidate` |
| `failed` | Settlement ran but could not resolve | `liquidate` |

`failed` occurs only on automated-settlement markets. Like `expired` it has **no winning
outcome**, so `redeem()` reverts — funds are recovered with `liquidate()` instead. If you sweep
a portfolio with `redeemPositions`, check the status first and route `expired`/`failed` markets
to `liquidate`:

```typescript
import { LIQUIDATABLE_MARKET_STATUSES } from "@gensyn-ai/gensyn-delphi-sdk";

const status = await client.getMarketStatus(marketAddress);
if (LIQUIDATABLE_MARKET_STATUSES.includes(status)) {
  await client.liquidate({ marketAddress, outcomeIndices: [0, 1] });
} else if (status === "settled") {
  await client.redeemMarket({ marketAddress });
}
```

### Config Object

All environment variables can also be passed directly to the constructor, which takes precedence over env vars:

```typescript
const client = new DelphiClient({
  network: "testnet",
  signerType: "private_key",
  privateKey: "0xYourPrivateKey",
  apiKey: "your-api-key",
});
```

## Signing

Two signing modes are supported, both producing the same `DelphiSigner` interface consumed by on-chain methods.

### Private Key

```typescript
import { createPrivateKeySigner } from "@gensyn-ai/gensyn-delphi-sdk";

const signer = await createPrivateKeySigner({
  privateKey: "0xYourPrivateKey",
  rpcUrl: "https://gensyn-testnet.g.alchemy.com/public",
  chainId: 685685,
});
```

### CDP Server Wallet

```typescript
import { createCdpSigner } from "@gensyn-ai/gensyn-delphi-sdk";

const signer = await createCdpSigner({
  apiKeyId: "your-cdp-api-key-id",
  apiKeySecret: "your-cdp-api-key-secret",
  walletSecret: "your-cdp-wallet-secret",
  walletAddress: "0xYourWalletAddress",
  rpcUrl: "https://gensyn-testnet.g.alchemy.com/public",
  chainId: 685685,
});
```

> `@coinbase/cdp-sdk` is a peer dependency only required when using CDP signing. Private key users do not need it installed.

### How to create your own signer

If neither built-in option fits your setup you can construct a `DelphiSigner` directly. The interface is:

```typescript
interface DelphiSigner {
  address:      `0x${string}`;
  walletClient: WalletClient<HttpTransport, Chain, Account>; // viem
  publicClient: PublicClient<HttpTransport, Chain>;          // viem
}
```

The pattern is always the same regardless of how signing works:

1. **Get a viem `Account`** — how depends on your key setup:
   - **Raw private key** (from `.env`, AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, Doppler, etc.): use `privateKeyToAccount(key)`
   - **MPC / managed wallets** (Privy, Fireblocks, CDP, etc.): the private key never leaves the provider — use their SDK to get an account handle, then wrap it with `toAccount()`
   - **Cloud KMS** (AWS KMS, GCP KMS): the key never leaves the HSM — the KMS SDK signs on your behalf, typically via a community adapter like `viem-kms-account`
2. **Wrap it** in `createWalletClient()` and `createPublicClient()` pointed at the Gensyn RPC.
3. **Inject it** into `DelphiClient` by subclassing and overriding `getSigner()`:

```typescript
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";
import type { DelphiSigner, DelphiClientConfig } from "@gensyn-ai/gensyn-delphi-sdk";

class CustomSignerClient extends DelphiClient {
  private readonly _signer: Promise<DelphiSigner>;

  constructor(signer: Promise<DelphiSigner>, config?: DelphiClientConfig) {
    super(config);
    this._signer = signer;
  }

  override getSigner(): Promise<DelphiSigner> {
    return this._signer;
  }
}

const client = new CustomSignerClient(myCustomSigner, { apiKey: "your-api-key" });
```

## API Reference

### REST API Methods

These methods read data from the Delphi API and require `DELPHI_API_ACCESS_KEY`.

#### `health()`

Check service availability. Does not require authentication.

```typescript
const { status } = await client.health();
```

#### `listMarkets(params?)`

Retrieve markets with optional filtering, sorting, and pagination.

Each market object includes:
- `id` — on-chain contract address of the market proxy
- `appMarketId` — UUID identifying the market in the Delphi app UI
- `marketUrl` — direct link to the market on the Delphi app (`{appUrl}/market/{appMarketId}`)
- `deployer` — wallet address of the market creator

```typescript
const { markets } = await client.listMarkets({
  status: "open",         // "open" | "awaiting_settlement" | "settled" | "expired" | "failed"
  category: "crypto",     // "crypto" | "culture" | "economics" | "miscellaneous" | "politics" | "sports"
  orderBy: "liquidity",   // "liquidity" (default) | "created" | "settles_at"
  verifiable: true,       // filter by verifiable settlement
  skip: 0,
  limit: 50,
});
```

#### `getMarket(params)`

Retrieve a single market by its on-chain contract address.

```typescript
const market = await client.getMarket({ id: "0xMarketContractAddress" });
```

#### `listPositions(params)`

Retrieve positions for a wallet address.

```typescript
const { positions } = await client.listPositions({
  wallet: "0xYourWalletAddress",
  redeemedOrLiquidated: false,
  skip: 0,
  limit: 50,
});
```

### On-Chain Methods

These methods send transactions or read directly from the blockchain.

#### `quoteBuy(params)` / `quoteSell(params)`

Simulate a trade to get an estimated cost/payout without spending gas.

```typescript
const { tokensIn } = await client.quoteBuy({
  marketAddress: "0xMarket",
  outcomeIdx: 0,
  sharesOut: BigInt("1000000000000000000"),
});

const { tokensOut } = await client.quoteSell({
  marketAddress: "0xMarket",
  outcomeIdx: 0,
  sharesIn: BigInt("1000000000000000000"),
});
```

#### `buyShares(params)`

Buy an exact number of outcome shares. Token approval must exist beforehand.

```typescript
const { transactionHash } = await client.buyShares({
  marketAddress: "0xMarket",
  outcomeIdx: 0,
  sharesOut: BigInt("1000000000000000000"), // exact shares to receive
  maxTokensIn: BigInt("1100000000000000000"), // max tokens to spend (slippage cap)
});
```

#### `sellShares(params)`

Sell an exact number of outcome shares.

```typescript
const { transactionHash } = await client.sellShares({
  marketAddress: "0xMarket",
  outcomeIdx: 0,
  sharesIn: BigInt("1000000000000000000"), // exact shares to sell
  minTokensOut: BigInt("900000000000000000"), // min tokens to receive (slippage floor)
});
```

#### `redeemMarket(params)`

Redeem a winning position for a single resolved market.

```typescript
const { transactionHash, sharesIn, tokensOut } = await client.redeemMarket({
  marketAddress: "0xMarket",
});
```

#### `redeemPositions(params)`

Batch-redeem positions across multiple markets. Failures are captured per-market rather than aborting the whole batch.

```typescript
const { results, totalTokensOut } = await client.redeemPositions({
  marketAddresses: ["0xMarket1", "0xMarket2"],
});

for (const result of results) {
  if (result.success) {
    console.log(`Redeemed ${result.tokensOut} tokens from ${result.marketAddress}`);
  } else {
    console.error(`Failed ${result.marketAddress}: ${result.error}`);
  }
}
```

#### `liquidate(params)`

Liquidate positions on an `expired` or `failed` market. Burns shares across the specified outcome indices and returns the collateral tokens. This is the exit path for markets with no winning outcome — see [Market Lifecycle](#market-lifecycle).

```typescript
const { transactionHash, sharesIn, totalTokensOut } = await client.liquidate({
  marketAddress: "0xMarket",
  outcomeIndices: [0, 1], // all outcome indices for the market
});
```

#### `getMarketStatus(marketAddress)`

Read a market's lifecycle status directly from its gateway. Unlike `getMarket()`, this hits the chain rather than the indexed REST API, so it reflects state that has not been indexed yet.

```typescript
const status = await client.getMarketStatus("0xMarket");
// "open" | "awaiting_settlement" | "settled" | "expired" | "failed"
```

#### `resolveGateway(marketAddress)`

Return the gateway address that serves a market — the automated-settlement gateway or the legacy one. Called automatically by every market-scoped method; exposed for callers that need it directly. See [Market Deployments and Gateway Routing](#market-deployments-and-gateway-routing).

```typescript
const gateway = await client.resolveGateway("0xMarket");
```

#### `getTokenAllowance(params)`

Read the current ERC-20 allowance your wallet has granted to the gateway.

```typescript
const { ownerAddress, allowance } = await client.getTokenAllowance({
  marketAddress: "0xMarket",
});
```

#### `approveToken(params)`

Approve the ERC-20 token for spending by the gateway. Defaults to unlimited (`uint256` max).

```typescript
const { transactionHash } = await client.approveToken({
  marketAddress: "0xMarket",
  amount: BigInt("1000000000000000000"), // optional; omit for unlimited
});
```

#### `ensureTokenApproval(params)`

Check if sufficient allowance exists; only sends an approval transaction if needed. Useful before buying shares.

```typescript
const { approvalNeeded, allowance, transactionHash } = await client.ensureTokenApproval({
  marketAddress: "0xMarket",
  minimumAmount: tokensIn,       // required minimum
  approveAmount: tokensIn * 10n, // optional; defaults to unlimited
});
```

### Wallet Methods

Read-only balance queries for the signer wallet.

#### `getEthBalance()`

Returns the native ETH balance for the current signer wallet.

```typescript
const balance = await client.getEthBalance(); // bigint (wei)
```

#### `getErc20Balance(tokenAddress?)`

Returns the ERC-20 token balance. Defaults to the configured USDC token address when omitted.

```typescript
const balance = await client.getErc20Balance(); // bigint (6 decimals for USDC)
```

#### `getErc20BalanceWithDecimals(tokenAddress?)`

Returns both the balance and decimals for an ERC-20 token.

```typescript
const { balance, decimals } = await client.getErc20BalanceWithDecimals();
```

### Subgraph Methods

Query on-chain event data indexed by the Goldsky subgraph.

#### `getSubgraph()`

Access the `SubgraphClient` for querying historical trade and settlement data. The default endpoint indexes the automated-settlement gateway — see [Market Deployments and Gateway Routing](#market-deployments-and-gateway-routing).

```typescript
const subgraph = client.getSubgraph();

// Fetch buys and sells for a specific market
const { buys, sells } = await subgraph.getMarketTrades("0xMarketProxy", {
  first: 20,
});

// Fetch how a market settled. `settled` and `failed` are mutually exclusive:
// a failed market has no winning outcome, so holders exit via liquidate().
const { settled, failed, resolutionRequests } =
  await subgraph.getMarketSettlement("0xMarketProxy");

// Check subgraph indexing metadata
const meta = await subgraph.getMeta();

// Run an arbitrary GraphQL query
const data = await subgraph.query<{ gatewayBuys: SubgraphBuy[] }>(`{
  gatewayBuys(first: 5, orderBy: timestamp_, orderDirection: desc) {
    id buyer marketProxy tokensIn sharesOut timestamp_
  }
}`);
```

#### `getSigner()`

Access the underlying `DelphiSigner` directly (e.g. to call `publicClient` for custom contract reads).

```typescript
const { address, publicClient, walletClient } = await client.getSigner();
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## License

MIT
