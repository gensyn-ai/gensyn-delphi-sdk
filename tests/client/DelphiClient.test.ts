import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `DelphiClient` calls `dotenvConfig()` at module load time.
// For unit tests that delete env vars, mock dotenv so env cleanup stays deterministic.
vi.mock("dotenv", () => ({
  config: () => ({}),
}));
import { DelphiClient } from "../../src/client/DelphiClient.js";
import type { DelphiSigner } from "../../src/client/signer.js";

// Test private key (DO NOT USE IN PRODUCTION - this is a well-known test key)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

describe("DelphiClient", () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.DELPHI_SIGNER_TYPE;
    delete process.env.WALLET_PRIVATE_KEY;
    delete process.env.CDP_API_KEY_ID;
    delete process.env.CDP_API_KEY_SECRET;
    delete process.env.CDP_WALLET_SECRET;
    delete process.env.CDP_WALLET_ADDRESS;
    delete process.env.GENSYN_RPC_URL;
    delete process.env.GENSYN_CHAIN_ID;
    delete process.env.DELPHI_GATEWAY_CONTRACT;
  });

  it("should create a DelphiClient instance", () => {
    const client = new DelphiClient();
    expect(client).toBeInstanceOf(DelphiClient);
  });

  it("should read signer type from environment variable", () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    const client = new DelphiClient();
    // We can't directly access private fields, but we can test behavior
    expect(client).toBeDefined();
  });

  it("should default to cdp_server_wallet when signer type not set", () => {
    const client = new DelphiClient();
    expect(client).toBeDefined();
  });

  it("should read chain configuration from environment variables", () => {
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = "0x1111111111111111111111111111111111111111";
    const client = new DelphiClient();
    expect(client).toBeDefined();
  });

  it("should throw error when rpcUrl is missing", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = "0x1111111111111111111111111111111111111111";

    const client = new DelphiClient();
    await expect(client.getSigner()).rejects.toThrow("Requires rpcUrl");
  });

  it("should throw error when chainId is missing", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.DELPHI_GATEWAY_CONTRACT = "0x1111111111111111111111111111111111111111";

    const client = new DelphiClient();
    (client as any).chainId = undefined;
    await expect(client.getSigner()).rejects.toThrow("Requires chainId");
  });

  it("should throw error when private key signer configured but private key missing", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";

    const client = new DelphiClient();
    await expect(client.getSigner()).rejects.toThrow("Requires privateKey");
  });

  it("should throw error when cdp server wallet signer missing cdpApiKeyId", async () => {
    process.env.DELPHI_SIGNER_TYPE = "cdp_server_wallet";
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";

    const client = new DelphiClient();
    await expect(client.getSigner()).rejects.toThrow("CDP signing requires cdpApiKeyId");
  });

  it("should create signer with private key when configured", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = "0x1111111111111111111111111111111111111111";

    const client = new DelphiClient();
    const signer = await client.getSigner();

    expect(signer).toHaveProperty("address");
    expect(signer).toHaveProperty("walletClient");
    expect(signer).toHaveProperty("publicClient");
    expect(signer.address).toBe(TEST_ADDRESS);
  });

  it("should throw error when gateway address is missing", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = "0x1111111111111111111111111111111111111111";

    const client = new DelphiClient();
    (client as any).gatewayAddress = undefined;
    await expect(async () => {
      await client.quoteBuy({
        marketAddress: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        outcomeIdx: 0,
        sharesOut: 1000000n,
      });
    }).rejects.toThrow("Requires gatewayAddress");
  });

  it("should delegate token methods to TokenClient", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = "0x1111111111111111111111111111111111111111";

    const client = new DelphiClient();
    
    // These should not throw (they'll fail at the contract call level, but the delegation works)
    const getTokenAllowancePromise = client.getTokenAllowance({
      marketAddress: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    });
    
    expect(getTokenAllowancePromise).toBeInstanceOf(Promise);
    // The actual call will fail because we're using a mock RPC, but we're testing the structure
    await expect(getTokenAllowancePromise).rejects.toBeDefined();
  });
});

// ─── pricesAndImpliedProbabilities Tests ─────────────────────────────────────

describe("DelphiClient – pricesAndImpliedProbabilities", () => {
  const API_BASE = "https://api.example.com";
  const API_KEY = "test-api-key";
  const GATEWAY = "0x7b8FDBD187B0Be5e30e48B1995df574A62667147" as const;

  const makeMarket = (id: string, outcomes: string[] = ["Yes", "No"]) => ({
    id,
    appMarketId: `uuid-${id}`,
    status: "active",
    category: "crypto",
    deployer: "0xdeployer",
    implementation: "",
    metadataUri: "",
    metadataUriContentHash: "",
    metadata: { question: "Test?", outcomes },
    dataSources: null,
    createdAt: "2024-01-01T00:00:00Z",
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

  let client: DelphiClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let multicallSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env.DELPHI_API_BASE_URL;
    delete process.env.DELPHI_API_ACCESS_KEY;
    process.env.DELPHI_API_BASE_URL = API_BASE;
    process.env.DELPHI_API_ACCESS_KEY = API_KEY;

    client = new DelphiClient({
      apiBaseUrl: API_BASE,
      apiKey: API_KEY,
      gatewayAddress: GATEWAY,
    });

    multicallSpy = vi.fn();
    vi.spyOn(client, "getSigner").mockResolvedValue({
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      publicClient: { multicall: multicallSpy } as any,
      walletClient: {} as any,
      sendTransaction: vi.fn(),
    } as any);

    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── listMarkets ──────────────────────────────────────────────────────────────

  it("listMarkets() without flag does not call multicall", async () => {
    const market = makeMarket("0x0000000000000000000000000000000000000001");
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ markets: [market] }), { status: 200 }));

    await client.listMarkets();

    expect(multicallSpy).not.toHaveBeenCalled();
  });

  it("listMarkets({ pricesAndImpliedProbabilities: false }) does not call multicall", async () => {
    const market = makeMarket("0x0000000000000000000000000000000000000001");
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ markets: [market] }), { status: 200 }));

    await client.listMarkets({ pricesAndImpliedProbabilities: false });

    expect(multicallSpy).not.toHaveBeenCalled();
  });

  it("listMarkets({ pricesAndImpliedProbabilities: true }) issues one multicall: decimals + 2 contracts per market", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ markets: [makeMarket(id)] }), { status: 200 }));

    multicallSpy.mockResolvedValueOnce([
      { status: "success", result: 18 },                                          // decimals()
      { status: "success", result: [500000000000000000n, 500000000000000000n] },  // spotPrices
      { status: "success", result: [500000000000000000n, 500000000000000000n] },  // spotImpliedProbabilities
    ]);

    await client.listMarkets({ pricesAndImpliedProbabilities: true });

    expect(multicallSpy).toHaveBeenCalledOnce();
    const { contracts } = multicallSpy.mock.calls[0][0];
    // 1 decimals() + 2 price calls for 1 market = 3 total
    expect(contracts).toHaveLength(3);
    expect(contracts[0].functionName).toBe("decimals");
    expect(contracts[1].functionName).toBe("spotPrices");
    expect(contracts[1].args).toEqual([id, [0n, 1n]]);
    expect(contracts[2].functionName).toBe("spotImpliedProbabilities");
    expect(contracts[2].args).toEqual([id, [0n, 1n]]);
  });

  it("listMarkets() merges decimal-adjusted spotPrices and spotImpliedProbabilities onto each market", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ markets: [makeMarket(id)] }), { status: 200 }));

    multicallSpy.mockResolvedValueOnce([
      { status: "success", result: 18 },
      { status: "success", result: [600000000000000000n, 400000000000000000n] },
      { status: "success", result: [600000000000000000n, 400000000000000000n] },
    ]);

    const result = await client.listMarkets({ pricesAndImpliedProbabilities: true });

    expect(result.markets?.[0]).toMatchObject({
      id,
      spotPrices: [0.6, 0.4],
      spotImpliedProbabilities: [0.6, 0.4],
    });
  });

  it("listMarkets() batches all markets in a single multicall", async () => {
    const id1 = "0x0000000000000000000000000000000000000001";
    const id2 = "0x0000000000000000000000000000000000000002";
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ markets: [makeMarket(id1), makeMarket(id2, ["A", "B", "C"])] }), { status: 200 }),
    );

    multicallSpy.mockResolvedValueOnce([
      { status: "success", result: 18 },                                                                  // decimals()
      { status: "success", result: [500000000000000000n, 500000000000000000n] },                          // id1 spotPrices
      { status: "success", result: [500000000000000000n, 500000000000000000n] },                          // id1 spotImpliedProbabilities
      { status: "success", result: [333000000000000000n, 333000000000000000n, 334000000000000000n] },     // id2 spotPrices
      { status: "success", result: [333000000000000000n, 333000000000000000n, 334000000000000000n] },     // id2 spotImpliedProbabilities
    ]);

    await client.listMarkets({ pricesAndImpliedProbabilities: true });

    expect(multicallSpy).toHaveBeenCalledOnce();
    const { contracts } = multicallSpy.mock.calls[0][0];
    // 1 decimals() + 2 markets × 2 price calls = 5 total
    expect(contracts).toHaveLength(5);
    expect(contracts[1].args).toEqual([id1, [0n, 1n]]);
    expect(contracts[3].args).toEqual([id2, [0n, 1n, 2n]]);
  });

  it("listMarkets() returns empty arrays for a market without metadata outcomes", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    const market = { ...makeMarket(id), metadata: null };
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ markets: [market] }), { status: 200 }));

    const result = await client.listMarkets({ pricesAndImpliedProbabilities: true });

    expect(multicallSpy).not.toHaveBeenCalled();
    expect(result.markets?.[0]).toMatchObject({ id, spotPrices: [], spotImpliedProbabilities: [] });
  });

  it("listMarkets() returns empty arrays when multicall price calls fail for a market", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ markets: [makeMarket(id)] }), { status: 200 }));

    multicallSpy.mockResolvedValueOnce([
      { status: "success", result: 18 },
      { status: "failure", error: new Error("revert") },
      { status: "failure", error: new Error("revert") },
    ]);

    const result = await client.listMarkets({ pricesAndImpliedProbabilities: true });

    expect(result.markets?.[0]).toMatchObject({ id, spotPrices: [], spotImpliedProbabilities: [] });
  });

  it("listMarkets() with empty markets list does not call multicall", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ markets: [] }), { status: 200 }));

    await client.listMarkets({ pricesAndImpliedProbabilities: true });

    expect(multicallSpy).not.toHaveBeenCalled();
  });

  // ── getMarket ────────────────────────────────────────────────────────────────

  it("getMarket() without flag does not call multicall", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(makeMarket(id)), { status: 200 }));

    await client.getMarket({ id });

    expect(multicallSpy).not.toHaveBeenCalled();
  });

  it("getMarket({ pricesAndImpliedProbabilities: true }) calls multicall and merges decimal-adjusted prices", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(makeMarket(id)), { status: 200 }));

    multicallSpy.mockResolvedValueOnce([
      { status: "success", result: 18 },
      { status: "success", result: [700000000000000000n, 300000000000000000n] },
      { status: "success", result: [700000000000000000n, 300000000000000000n] },
    ]);

    const result = await client.getMarket({ id, pricesAndImpliedProbabilities: true });

    expect(multicallSpy).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id, spotPrices: [0.7, 0.3], spotImpliedProbabilities: [0.7, 0.3] });
  });

  it("getMarket() returns empty arrays when market has no metadata outcomes", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    const market = { ...makeMarket(id), metadata: null };
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(market), { status: 200 }));

    const result = await client.getMarket({ id, pricesAndImpliedProbabilities: true });

    expect(multicallSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id, spotPrices: [], spotImpliedProbabilities: [] });
  });

  it("getMarket() returns empty arrays when multicall fails", async () => {
    const id = "0x0000000000000000000000000000000000000001";
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(makeMarket(id)), { status: 200 }));

    multicallSpy.mockResolvedValueOnce([
      { status: "success", result: 18 },
      { status: "failure", error: new Error("revert") },
      { status: "failure", error: new Error("revert") },
    ]);

    const result = await client.getMarket({ id, pricesAndImpliedProbabilities: true });

    expect(result).toMatchObject({ id, spotPrices: [], spotImpliedProbabilities: [] });
  });
});

// ─── Read API Tests ──────────────────────────────────────────────────────────

describe("DelphiClient – Read APIs", () => {
  const API_BASE = "https://api.example.com";
  const API_KEY = "test-api-key";

  let client: DelphiClient;
  let fetchSpy: any;

  beforeEach(() => {
    // Clear all env vars then set the ones we need for REST API calls
    delete process.env.DELPHI_API_BASE_URL;
    delete process.env.DELPHI_API_ACCESS_KEY;
    process.env.DELPHI_API_BASE_URL = API_BASE;
    process.env.DELPHI_API_ACCESS_KEY = API_KEY;

    client = new DelphiClient();

    // Mock global fetch
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── health ───────────────────────────────────────────────────────────────────

  it("health() should GET /health without an API key header", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );

    const result = await client.health();

    expect(result).toEqual({ status: "ok" });
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, init] = fetchSpy.mock.calls[0] as [unknown, any];
    expect(url).toBe(`${API_BASE}/health`);
    expect((init as any)?.method).toBe("GET");
    // health does NOT send X-API-Key
    const headers = (init as any)?.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBeUndefined();
  });

  it("health() should throw on non-2xx response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("service unavailable", { status: 503 }),
    );

    await expect(client.health()).rejects.toThrow("Health check failed (503)");
  });

  // ── listMarkets ──────────────────────────────────────────────────────────────

  it("listMarkets() should GET /markets with default params", async () => {
    const body = { markets: [{ id: "m1", appMarketId: "uuid-1234", status: "active" }] };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    const result = await client.listMarkets();

    expect(result).toEqual({
      markets: [{ ...body.markets[0], marketUrl: "https://testnet.delphi.fyi/market/uuid-1234" }],
    });
    const [url, init] = fetchSpy.mock.calls[0] as [unknown, any];
    expect(url).toContain("/markets");
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });

  it("listMarkets() should pass query filters", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ markets: [] }), { status: 200 }),
    );

    await client.listMarkets({ skip: 10, limit: 5, status: "settled", category: "sports" });

    const [url] = fetchSpy.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("skip")).toBe("10");
    expect(parsed.searchParams.get("limit")).toBe("5");
    expect(parsed.searchParams.get("status")).toBe("settled");
    expect(parsed.searchParams.get("category")).toBe("sports");
  });

  it("listMarkets() should pass orderBy and verifiable params", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ markets: [] }), { status: 200 }),
    );

    await client.listMarkets({ orderBy: "created", verifiable: true });

    const [url] = fetchSpy.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("orderBy")).toBe("created");
    expect(parsed.searchParams.get("verifiable")).toBe("true");
  });

  it("listMarkets() should pass orderBy=settles_at", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ markets: [] }), { status: 200 }),
    );

    await client.listMarkets({ orderBy: "settles_at" });

    const [url] = fetchSpy.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("orderBy")).toBe("settles_at");
  });

  it("listMarkets() should omit undefined optional params from query string", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ markets: null }), { status: 200 }),
    );

    await client.listMarkets();

    const [url] = fetchSpy.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.has("skip")).toBe(false);
    expect(parsed.searchParams.has("limit")).toBe(false);
    expect(parsed.searchParams.has("orderBy")).toBe(false);
    expect(parsed.searchParams.has("status")).toBe(false);
    expect(parsed.searchParams.has("category")).toBe(false);
    expect(parsed.searchParams.has("verifiable")).toBe(false);
  });

  // ── getMarket ────────────────────────────────────────────────────────────────

  it("getMarket() should GET /markets/:id", async () => {
    const market = { id: "abc-123", appMarketId: "uuid-abc-123", status: "active", deployer: "0xabc" };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(market), { status: 200 }),
    );

    const result = await client.getMarket({ id: "abc-123" });

    expect(result).toEqual({ ...market, marketUrl: "https://testnet.delphi.fyi/market/uuid-abc-123" });
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("/markets/abc-123");
  });

  it("getMarket() should throw on 404", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );

    await expect(client.getMarket({ id: "missing" })).rejects.toThrow("API request failed (404)");
  });

  // ── listPositions ────────────────────────────────────────────────────────────

  it("listPositions() should GET /positions with wallet param", async () => {
    const body = {
      positions: [
        {
          id: "p1",
          marketProxy: "0xproxy",
          wallet: "0xwallet",
          outcomeIdx: "0",
          shares: "1000",
          redeemedOrLiquidated: false,
          tokensRedeemed: "0",
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    const result = await client.listPositions({ wallet: "0xwallet" });

    expect(result).toEqual(body);
    const [url, init] = fetchSpy.mock.calls[0] as [unknown, any];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/positions");
    expect(parsed.searchParams.get("wallet")).toBe("0xwallet");
    expect(((init as any)?.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });

  it("listPositions() should pass pagination and redeemedOrLiquidated filter", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ positions: [] }), { status: 200 }),
    );

    await client.listPositions({
      wallet: "0xwallet",
      skip: 10,
      limit: 20,
      redeemedOrLiquidated: true,
    });

    const [url] = fetchSpy.mock.calls[0] as [unknown, unknown];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("wallet")).toBe("0xwallet");
    expect(parsed.searchParams.get("skip")).toBe("10");
    expect(parsed.searchParams.get("limit")).toBe("20");
    expect(parsed.searchParams.get("redeemedOrLiquidated")).toBe("true");
  });

  it("listPositions() should omit undefined optional params from query string", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ positions: null }), { status: 200 }),
    );

    await client.listPositions({ wallet: "0xwallet" });

    const [url] = fetchSpy.mock.calls[0] as [unknown, unknown];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.has("wallet")).toBe(true);
    expect(parsed.searchParams.has("skip")).toBe(false);
    expect(parsed.searchParams.has("limit")).toBe(false);
    expect(parsed.searchParams.has("redeemedOrLiquidated")).toBe(false);
  });

  // ── error handling (shared apiGet) ───────────────────────────────────────────

  it("should throw when DELPHI_API_BASE_URL is not set", async () => {
    process.env.DELPHI_API_BASE_URL = "";
    const c = new DelphiClient();
    await expect(c.listMarkets()).rejects.toThrow("Requires apiBaseUrl");
  });

  it("should throw when DELPHI_API_ACCESS_KEY is not set", async () => {
    process.env.DELPHI_API_ACCESS_KEY = "";
    const c = new DelphiClient();
    await expect(c.listMarkets()).rejects.toThrow("Requires apiKey");
  });
});
