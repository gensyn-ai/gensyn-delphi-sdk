import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `DelphiClient` calls `dotenvConfig()` at module load time.
// For unit tests that delete env vars, mock dotenv so env cleanup stays deterministic.
vi.mock("dotenv", () => ({
  config: () => ({}),
}));
import { DelphiClient } from "../../src/client/DelphiClient.js";

// Testnet network defaults — the two parallel deployments.
const AUTOMATED_GATEWAY = "0x22ea355D7218Dc86b4c83732cBbd01f7Ff2332b3";
const AUTOMATED_FACTORY = "0x97d2b3F0614C8189343A38094629FCE2910b727A";
const LEGACY_GATEWAY = "0x7b8FDBD187B0Be5e30e48B1995df574A62667147";
const LEGACY_FACTORY = "0xd03CEC55802f0D44D844384E1144B25717315E5A";

const AUTOMATED_MARKET = "0x00000000000000000000000000000000000000aa" as `0x${string}`;
const LEGACY_MARKET = "0x00000000000000000000000000000000000000bb" as `0x${string}`;
const ORPHAN_MARKET = "0x00000000000000000000000000000000000000cc" as `0x${string}`;

/**
 * Mocks the two `marketProxiesExist` calls the router issues, answering as if
 * `automated` / `legacy` each deployed the listed markets.
 */
function factoryProbe(automated: `0x${string}`[], legacy: `0x${string}`[]) {
  return (args: { contracts: { address: string; args: unknown[] }[] }) => {
    const answer = (owned: `0x${string}`[], contract: { args: unknown[] }) =>
      (contract.args[0] as `0x${string}`[]).map((m) =>
        owned.some((o) => o.toLowerCase() === m.toLowerCase()),
      );
    return Promise.resolve([
      { status: "success", result: answer(automated, args.contracts[0]) },
      { status: "success", result: answer(legacy, args.contracts[1]) },
    ]);
  };
}

describe("DelphiClient — gateway routing", () => {
  let client: DelphiClient;
  let multicallSpy: ReturnType<typeof vi.fn>;
  let readContractSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env.DELPHI_GATEWAY_CONTRACT;
    delete process.env.DELPHI_LEGACY_GATEWAY_CONTRACT;
    delete process.env.DELPHI_FACTORY_CONTRACT;
    delete process.env.DELPHI_LEGACY_FACTORY_CONTRACT;
    delete process.env.DELPHI_NETWORK;

    client = new DelphiClient({ network: "testnet" });

    multicallSpy = vi.fn();
    readContractSpy = vi.fn();
    vi.spyOn(client, "getSigner").mockResolvedValue({
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      publicClient: { multicall: multicallSpy, readContract: readContractSpy } as any,
      walletClient: {} as any,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── resolveGateway ─────────────────────────────────────────────────────────

  it("routes a market to the automated gateway when the automated factory claims it", async () => {
    multicallSpy.mockImplementation(factoryProbe([AUTOMATED_MARKET], []));

    await expect(client.resolveGateway(AUTOMATED_MARKET)).resolves.toBe(AUTOMATED_GATEWAY);
  });

  it("routes a market to the legacy gateway when the legacy factory claims it", async () => {
    multicallSpy.mockImplementation(factoryProbe([], [LEGACY_MARKET]));

    await expect(client.resolveGateway(LEGACY_MARKET)).resolves.toBe(LEGACY_GATEWAY);
  });

  it("probes both factories with marketProxiesExist", async () => {
    multicallSpy.mockImplementation(factoryProbe([AUTOMATED_MARKET], []));

    await client.resolveGateway(AUTOMATED_MARKET);

    const { contracts } = multicallSpy.mock.calls[0][0];
    expect(contracts).toHaveLength(2);
    expect(contracts[0].address).toBe(AUTOMATED_FACTORY);
    expect(contracts[1].address).toBe(LEGACY_FACTORY);
    expect(contracts[0].functionName).toBe("marketProxiesExist");
    expect(contracts[1].functionName).toBe("marketProxiesExist");
  });

  it("caches a resolved market and does not re-probe the factories", async () => {
    multicallSpy.mockImplementation(factoryProbe([], [LEGACY_MARKET]));

    await client.resolveGateway(LEGACY_MARKET);
    await client.resolveGateway(LEGACY_MARKET);

    expect(multicallSpy).toHaveBeenCalledOnce();
  });

  it("falls back to the automated gateway when neither factory claims the market", async () => {
    multicallSpy.mockImplementation(factoryProbe([], []));

    await expect(client.resolveGateway(ORPHAN_MARKET)).resolves.toBe(AUTOMATED_GATEWAY);
  });

  it("does not cache an unclaimed market, so a later call retries the probe", async () => {
    multicallSpy.mockImplementation(factoryProbe([], []));
    await client.resolveGateway(ORPHAN_MARKET);

    // The market is now claimed (e.g. the earlier probe raced a deployment).
    multicallSpy.mockImplementation(factoryProbe([ORPHAN_MARKET], []));
    await expect(client.resolveGateway(ORPHAN_MARKET)).resolves.toBe(AUTOMATED_GATEWAY);
    expect(multicallSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to the default gateway when the factory probe fails outright", async () => {
    multicallSpy.mockResolvedValue([
      { status: "failure", error: new Error("rpc down") },
      { status: "failure", error: new Error("rpc down") },
    ]);

    await expect(client.resolveGateway(LEGACY_MARKET)).resolves.toBe(AUTOMATED_GATEWAY);
  });

  it("resolves a mixed batch in a single factory multicall", async () => {
    multicallSpy.mockImplementation(factoryProbe([AUTOMATED_MARKET], [LEGACY_MARKET]));

    const resolved = await (client as any).resolveGateways([AUTOMATED_MARKET, LEGACY_MARKET]);

    expect(resolved).toEqual([AUTOMATED_GATEWAY, LEGACY_GATEWAY]);
    expect(multicallSpy).toHaveBeenCalledOnce();
  });

  it("deduplicates repeated markets within one batch", async () => {
    multicallSpy.mockImplementation(factoryProbe([AUTOMATED_MARKET], []));

    await (client as any).resolveGateways([AUTOMATED_MARKET, AUTOMATED_MARKET, AUTOMATED_MARKET]);

    const { contracts } = multicallSpy.mock.calls[0][0];
    expect(contracts[0].args[0]).toHaveLength(1);
  });

  // ── pinning ────────────────────────────────────────────────────────────────

  it("skips routing entirely when gatewayAddress is pinned in config", async () => {
    const pinned = new DelphiClient({
      network: "testnet",
      gatewayAddress: "0x1111111111111111111111111111111111111111",
    });
    const pinnedMulticall = vi.fn();
    vi.spyOn(pinned, "getSigner").mockResolvedValue({
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      publicClient: { multicall: pinnedMulticall } as any,
      walletClient: {} as any,
    } as any);

    await expect(pinned.resolveGateway(LEGACY_MARKET)).resolves.toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(pinnedMulticall).not.toHaveBeenCalled();
  });

  it("skips routing when DELPHI_GATEWAY_CONTRACT pins the gateway", async () => {
    process.env.DELPHI_GATEWAY_CONTRACT = "0x2222222222222222222222222222222222222222";
    const pinned = new DelphiClient({ network: "testnet" });
    const pinnedMulticall = vi.fn();
    vi.spyOn(pinned, "getSigner").mockResolvedValue({
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      publicClient: { multicall: pinnedMulticall } as any,
      walletClient: {} as any,
    } as any);

    await expect(pinned.resolveGateway(AUTOMATED_MARKET)).resolves.toBe(
      "0x2222222222222222222222222222222222222222",
    );
    expect(pinnedMulticall).not.toHaveBeenCalled();
  });

  // ── market-scoped calls use the routed gateway ──────────────────────────────

  it("quoteBuy targets the legacy gateway for a legacy market", async () => {
    multicallSpy.mockImplementation(factoryProbe([], [LEGACY_MARKET]));
    readContractSpy.mockResolvedValue(1000n);

    await client.quoteBuy({ marketAddress: LEGACY_MARKET, outcomeIdx: 0, sharesOut: 1n });

    expect(readContractSpy.mock.calls[0][0].address).toBe(LEGACY_GATEWAY);
  });

  it("quoteBuy targets the automated gateway for an automated market", async () => {
    multicallSpy.mockImplementation(factoryProbe([AUTOMATED_MARKET], []));
    readContractSpy.mockResolvedValue(1000n);

    await client.quoteBuy({ marketAddress: AUTOMATED_MARKET, outcomeIdx: 0, sharesOut: 1n });

    expect(readContractSpy.mock.calls[0][0].address).toBe(AUTOMATED_GATEWAY);
  });

  // ── redeemPositions batches routing ─────────────────────────────────────────

  it("redeemPositions resolves the whole batch in one routing multicall", async () => {
    const markets = [
      "0x00000000000000000000000000000000000000a1",
      "0x00000000000000000000000000000000000000a2",
      "0x00000000000000000000000000000000000000a3",
    ] as `0x${string}`[];

    // First multicall is the routing probe; simulateContract then rejects so no
    // transaction is sent and each market surfaces its own error.
    multicallSpy.mockImplementation(factoryProbe(markets, []));
    const simulate = vi.fn().mockRejectedValue(new Error("no winning shares"));
    vi.spyOn(client, "getSigner").mockResolvedValue({
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      publicClient: { multicall: multicallSpy, simulateContract: simulate } as any,
      walletClient: {} as any,
    } as any);

    const res = await client.redeemPositions({ marketAddresses: markets });

    // One routing multicall for all three markets, not one per market.
    expect(multicallSpy).toHaveBeenCalledOnce();
    expect(multicallSpy.mock.calls[0][0].contracts[0].args[0]).toHaveLength(3);
    expect(res.results).toHaveLength(3);
    expect(res.results.every((r) => r.success === false && !r.transactionHash)).toBe(true);
    expect(res.totalTokensOut).toBe(0n);
  });

  it("redeemPositions still succeeds when the routing probe fails outright", async () => {
    multicallSpy.mockRejectedValue(new Error("rpc down"));
    const simulate = vi.fn().mockRejectedValue(new Error("not settled"));
    vi.spyOn(client, "getSigner").mockResolvedValue({
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      publicClient: { multicall: multicallSpy, simulateContract: simulate } as any,
      walletClient: {} as any,
    } as any);

    const res = await client.redeemPositions({ marketAddresses: [LEGACY_MARKET] });

    // A dead routing probe must not throw out of redeemPositions.
    expect(res.results).toHaveLength(1);
    expect(res.results[0].success).toBe(false);
  });

  // ── price batches spanning both deployments ─────────────────────────────────

  it("listMarkets() points each market's price calls at its own gateway", async () => {
    const makeMarket = (id: string) => ({
      id,
      appMarketId: `app-${id}`,
      marketUrl: "",
      status: "open",
      category: "crypto",
      deployer: "0x0000000000000000000000000000000000000000",
      implementation: "0x0000000000000000000000000000000000000000",
      metadataUri: "",
      metadataUriContentHash: "",
      metadata: { question: "q?", outcomes: ["Yes", "No"] },
      dataSources: null,
      createdAt: "2026-01-01T00:00:00Z",
      fetchedAt: null,
      fetchResponseStatus: null,
      resolvesAt: null,
      settledAt: null,
      settlesAt: null,
      winningOutcomeIdx: null,
      tradingFee: null,
      proof: null,
      error: null,
      verifiable: false,
    });

    const apiClient = new DelphiClient({
      network: "testnet",
      apiBaseUrl: "https://api.example.com",
      apiKey: "k",
    });
    const mc = vi.fn();
    vi.spyOn(apiClient, "getSigner").mockResolvedValue({
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      publicClient: { multicall: mc } as any,
      walletClient: {} as any,
    } as any);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ markets: [makeMarket(AUTOMATED_MARKET), makeMarket(LEGACY_MARKET)] }),
        { status: 200 },
      ),
    );

    // First multicall resolves gateways; second fetches prices.
    mc.mockImplementationOnce(factoryProbe([AUTOMATED_MARKET], [LEGACY_MARKET]));
    mc.mockResolvedValueOnce([
      { status: "success", result: 18 },
      { status: "success", result: [500000000000000000n, 500000000000000000n] },
      { status: "success", result: [500000000000000000n, 500000000000000000n] },
      { status: "success", result: [500000000000000000n, 500000000000000000n] },
      { status: "success", result: [500000000000000000n, 500000000000000000n] },
    ]);

    await apiClient.listMarkets({ pricesAndImpliedProbabilities: true });

    expect(mc).toHaveBeenCalledTimes(2);
    const { contracts } = mc.mock.calls[1][0];
    // decimals() + 2 calls for the automated market + 2 for the legacy market
    expect(contracts).toHaveLength(5);
    expect(contracts[1].address).toBe(AUTOMATED_GATEWAY);
    expect(contracts[2].address).toBe(AUTOMATED_GATEWAY);
    expect(contracts[3].address).toBe(LEGACY_GATEWAY);
    expect(contracts[4].address).toBe(LEGACY_GATEWAY);
  });

  // ── getMarketStatus ────────────────────────────────────────────────────────

  it.each([
    [0, "open"],
    [1, "awaiting_settlement"],
    [2, "settled"],
    [3, "expired"],
    [4, "failed"],
  ])("getMarketStatus maps on-chain enum %i to %s", async (raw, expected) => {
    multicallSpy.mockImplementation(factoryProbe([AUTOMATED_MARKET], []));
    readContractSpy.mockResolvedValue(raw);

    await expect(client.getMarketStatus(AUTOMATED_MARKET)).resolves.toBe(expected);
  });

  it("getMarketStatus throws on an unrecognised status value", async () => {
    multicallSpy.mockImplementation(factoryProbe([AUTOMATED_MARKET], []));
    readContractSpy.mockResolvedValue(9);

    await expect(client.getMarketStatus(AUTOMATED_MARKET)).rejects.toThrow(
      "Unknown market status 9",
    );
  });

  it("getMarketStatus reads through the routed gateway", async () => {
    multicallSpy.mockImplementation(factoryProbe([], [LEGACY_MARKET]));
    readContractSpy.mockResolvedValue(2);

    await client.getMarketStatus(LEGACY_MARKET);

    expect(readContractSpy.mock.calls[0][0].address).toBe(LEGACY_GATEWAY);
    expect(readContractSpy.mock.calls[0][0].functionName).toBe("marketStatus");
  });
});
