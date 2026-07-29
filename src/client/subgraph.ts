import type {
  SubgraphBuy,
  SubgraphSell,
  SubgraphMarketSettled,
  SubgraphMarketFailed,
  SubgraphMarketResolutionRequested,
  SubgraphMeta,
} from "../types/index.js";

/**
 * Low-level GraphQL client for the Delphi Goldsky subgraph.
 *
 * Exposes a generic `query()` method so SDK consumers can run arbitrary
 * GraphQL, plus typed convenience methods for the most common entities.
 */
export class SubgraphClient {
  constructor(private readonly subgraphUrl: string) {}

  // ─── Generic Query ────────────────────────────────────────────────────────

  /**
   * Execute an arbitrary GraphQL query against the subgraph.
   *
   * @example
   * ```ts
   * const data = await subgraph.query<{ gatewayBuys: SubgraphBuy[] }>(`{
   *   gatewayBuys(first: 5, orderBy: timestamp_, orderDirection: desc) {
   *     id buyer marketProxy tokensIn sharesOut timestamp_
   *   }
   * }`);
   * ```
   */
  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const body: Record<string, unknown> = { query };
    if (variables && Object.keys(variables).length > 0) {
      body.variables = variables;
    }

    const response = await fetch(this.subgraphUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Subgraph request failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Subgraph query errors: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    if (!json.data) {
      throw new Error("Subgraph returned no data");
    }
    return json.data;
  }

  // ─── Convenience Methods ────────────────────────────────────────────────────

  /**
   * Fetch all buy and sell activity for a given market, sorted by most recent first.
   */
  async getMarketTrades(
    marketProxy: string,
    params: { first?: number; skip?: number } = {},
  ): Promise<{ buys: SubgraphBuy[]; sells: SubgraphSell[] }> {
    const first = params.first ?? 100;
    const skip = params.skip ?? 0;

    const data = await this.query<{
      gatewayBuys: SubgraphBuy[];
      gatewaySells: SubgraphSell[];
    }>(`{
      gatewayBuys(
        first: ${first}, skip: ${skip},
        orderBy: timestamp_, orderDirection: desc,
        where: { marketProxy: "${marketProxy}" }
      ) {
        id block_number timestamp_ transactionHash_ contractId_
        marketProxy buyer outcomeIdx tokensIn sharesOut
      }
      gatewaySells(
        first: ${first}, skip: ${skip},
        orderBy: timestamp_, orderDirection: desc,
        where: { marketProxy: "${marketProxy}" }
      ) {
        id block_number timestamp_ transactionHash_ contractId_
        marketProxy seller outcomeIdx sharesIn tokensOut
      }
    }`);
    return { buys: data.gatewayBuys, sells: data.gatewaySells };
  }

  /**
   * Fetch the settlement history for a market: the oracle's outcome (if it resolved),
   * the failure record (if it could not), and any keeper-triggered resolution requests.
   *
   * A market yields at most one of `settled` / `failed` — they are mutually exclusive
   * terminal states. `failed` means there is no winning outcome, so holders exit via
   * `liquidate()` rather than `redeem()`.
   *
   * Only meaningful against an automated-settlement subgraph; the legacy subgraph
   * records settlement under `gatewayWinnerSubmitteds` instead and returns empty here.
   */
  async getMarketSettlement(
    marketProxy: string,
    params: { first?: number } = {},
  ): Promise<{
    settled: SubgraphMarketSettled[];
    failed: SubgraphMarketFailed[];
    resolutionRequests: SubgraphMarketResolutionRequested[];
  }> {
    const first = params.first ?? 100;

    const data = await this.query<{
      gatewayMarketSettleds: SubgraphMarketSettled[];
      gatewayMarketFaileds: SubgraphMarketFailed[];
      marketResolutionRequesteds: SubgraphMarketResolutionRequested[];
    }>(`{
      gatewayMarketSettleds(
        first: ${first}, orderBy: timestamp_, orderDirection: desc,
        where: { marketProxy: "${marketProxy}" }
      ) {
        id block_number timestamp_ transactionHash_ contractId_
        marketProxy winningOutcomeIdx marketCreatorReward refund marketCreatorTradingFeesCut
      }
      gatewayMarketFaileds(
        first: ${first}, orderBy: timestamp_, orderDirection: desc,
        where: { marketProxy: "${marketProxy}" }
      ) {
        id block_number timestamp_ transactionHash_ contractId_ marketProxy
      }
      marketResolutionRequesteds(
        first: ${first}, orderBy: timestamp_, orderDirection: desc,
        where: { marketProxy: "${marketProxy}" }
      ) {
        id block_number timestamp_ transactionHash_ contractId_ marketProxy keeper
      }
    }`);

    return {
      settled: data.gatewayMarketSettleds,
      failed: data.gatewayMarketFaileds,
      resolutionRequests: data.marketResolutionRequesteds,
    };
  }

  /**
   * Fetch subgraph indexing metadata — current block, deployment hash, error status.
   */
  async getMeta(): Promise<SubgraphMeta> {
    const data = await this.query<{ _meta: SubgraphMeta }>(`{
      _meta {
        block { number timestamp hash }
        deployment
        hasIndexingErrors
      }
    }`);
    return data._meta;
  }
}
