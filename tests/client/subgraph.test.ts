import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SubgraphClient } from "../../src/client/subgraph.js";

const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_test/subgraphs/test-graph/1.0.0/gn";

describe("SubgraphClient", () => {
  let client: SubgraphClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new SubgraphClient(SUBGRAPH_URL);
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ─── query() ────────────────────────────────────────────────────────────────

  describe("query()", () => {
    it("should POST the query and return data", async () => {
      const payload = { gatewayBuys: [{ id: "0xabc" }] };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: payload }), { status: 200 }),
      );

      const result = await client.query<typeof payload>("{ gatewayBuys { id } }");

      expect(result).toEqual(payload);
      expect(fetchSpy).toHaveBeenCalledOnce();

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(SUBGRAPH_URL);
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Accept"]).toBe("application/json");

      const body = JSON.parse(init.body as string);
      expect(body.query).toBe("{ gatewayBuys { id } }");
      expect(body.variables).toBeUndefined();
    });

    it("should include variables when provided", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), { status: 200 }),
      );

      await client.query("query($id: ID!) { gatewayBuy(id: $id) { id } }", { id: "0x123" });

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.variables).toEqual({ id: "0x123" });
    });

    it("should omit variables when empty object is provided", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), { status: 200 }),
      );

      await client.query("{ _meta { deployment } }", {});

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.variables).toBeUndefined();
    });

    it("should only send Content-Type and Accept headers", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), { status: 200 }),
      );

      await client.query("{ _meta { deployment } }");

      const headers = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
      expect(Object.keys(headers)).toEqual(["Content-Type", "Accept"]);
    });

    it("should throw on non-2xx HTTP response", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Bad Gateway", { status: 502 }),
      );

      await expect(client.query("{ bad }")).rejects.toThrow("Subgraph request failed (502): Bad Gateway");
    });

    it("should throw when response contains GraphQL errors", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ errors: [{ message: "Field not found" }, { message: "Syntax error" }] }),
          { status: 200 },
        ),
      );

      await expect(client.query("{ bad }")).rejects.toThrow(
        "Subgraph query errors: Field not found; Syntax error",
      );
    });

    it("should throw when response has no data field", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      await expect(client.query("{ bad }")).rejects.toThrow("Subgraph returned no data");
    });
  });

  // ─── getMarketTrades() ──────────────────────────────────────────────────────

  describe("getMarketTrades()", () => {
    const marketProxy = "0x029a7b6409205dad24e59d5dc1586fea96903d08";

    const fakeBuy = {
      id: "0xbuy1",
      block_number: "100",
      timestamp_: "1700000000",
      transactionHash_: "0xtx1",
      contractId_: "0xgateway",
      marketProxy,
      buyer: "0xbuyer1",
      outcomeIdx: "0",
      tokensIn: "500000",
      sharesOut: "1000000000000000000",
    };

    const fakeSell = {
      id: "0xsell1",
      block_number: "101",
      timestamp_: "1700000001",
      transactionHash_: "0xtx2",
      contractId_: "0xgateway",
      marketProxy,
      seller: "0xseller1",
      outcomeIdx: "1",
      sharesIn: "500000000000000000",
      tokensOut: "250000",
    };

    it("should return buys and sells for a market", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { gatewayBuys: [fakeBuy], gatewaySells: [fakeSell] } }),
          { status: 200 },
        ),
      );

      const result = await client.getMarketTrades(marketProxy);

      expect(result.buys).toEqual([fakeBuy]);
      expect(result.sells).toEqual([fakeSell]);
    });

    it("should use default first=100 and skip=0", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { gatewayBuys: [], gatewaySells: [] } }),
          { status: 200 },
        ),
      );

      await client.getMarketTrades(marketProxy);

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.query).toContain("first: 100");
      expect(body.query).toContain("skip: 0");
    });

    it("should pass custom first and skip params", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { gatewayBuys: [], gatewaySells: [] } }),
          { status: 200 },
        ),
      );

      await client.getMarketTrades(marketProxy, { first: 10, skip: 20 });

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.query).toContain("first: 10");
      expect(body.query).toContain("skip: 20");
    });

    it("should include the marketProxy in the where clause", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { gatewayBuys: [], gatewaySells: [] } }),
          { status: 200 },
        ),
      );

      await client.getMarketTrades(marketProxy);

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.query).toContain(`marketProxy: "${marketProxy}"`);
    });

    it("should request orderBy timestamp_ desc", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { gatewayBuys: [], gatewaySells: [] } }),
          { status: 200 },
        ),
      );

      await client.getMarketTrades(marketProxy);

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.query).toContain("orderBy: timestamp_");
      expect(body.query).toContain("orderDirection: desc");
    });

    it("should request all buy and sell fields", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { gatewayBuys: [], gatewaySells: [] } }),
          { status: 200 },
        ),
      );

      await client.getMarketTrades(marketProxy);

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      for (const field of ["id", "block_number", "timestamp_", "transactionHash_", "contractId_", "marketProxy", "buyer", "outcomeIdx", "tokensIn", "sharesOut"]) {
        expect(body.query).toContain(field);
      }
      for (const field of ["seller", "sharesIn", "tokensOut"]) {
        expect(body.query).toContain(field);
      }
    });
  });

  // ─── getMeta() ──────────────────────────────────────────────────────────────

  describe("getMeta()", () => {
    it("should return subgraph metadata", async () => {
      const meta = {
        block: { number: 16329866, timestamp: 1774276336, hash: "0xblockhash" },
        deployment: "QmcmS5eioA8zMZY8fRAnPXNuv8yDSk2YoEX7fFwrvJ8ezP",
        hasIndexingErrors: false,
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { _meta: meta } }), { status: 200 }),
      );

      const result = await client.getMeta();

      expect(result).toEqual(meta);
    });

    it("should request block, deployment, and hasIndexingErrors fields", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { _meta: { block: { number: 1, timestamp: null, hash: null }, deployment: "Qm", hasIndexingErrors: false } },
          }),
          { status: 200 },
        ),
      );

      await client.getMeta();

      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.query).toContain("_meta");
      expect(body.query).toContain("block");
      expect(body.query).toContain("number");
      expect(body.query).toContain("timestamp");
      expect(body.query).toContain("hash");
      expect(body.query).toContain("deployment");
      expect(body.query).toContain("hasIndexingErrors");
    });
  });
});

// ─── DelphiClient.getSubgraph() integration ─────────────────────────────────

vi.mock("dotenv", () => ({
  config: () => ({}),
}));

import { DelphiClient } from "../../src/client/DelphiClient.js";

describe("DelphiClient – Subgraph integration", () => {
  beforeEach(() => {
    delete process.env.DELPHI_SUBGRAPH_URL;
  });

  it("getSubgraph() should return a SubgraphClient using the network default URL", () => {
    const client = new DelphiClient();
    const subgraph = client.getSubgraph();
    expect(subgraph).toBeInstanceOf(SubgraphClient);
  });

  it("getSubgraph() should return the same instance on repeated calls", () => {
    const client = new DelphiClient();
    const a = client.getSubgraph();
    const b = client.getSubgraph();
    expect(a).toBe(b);
  });

  it("getSubgraph() should respect config override", () => {
    const customUrl = "https://custom-subgraph.example.com/graphql";
    const client = new DelphiClient({ subgraphUrl: customUrl });
    const subgraph = client.getSubgraph();
    expect(subgraph).toBeInstanceOf(SubgraphClient);
    expect((subgraph as any).subgraphUrl).toBe(customUrl);
  });

  it("getSubgraph() should respect DELPHI_SUBGRAPH_URL env var", () => {
    const envUrl = "https://env-subgraph.example.com/graphql";
    process.env.DELPHI_SUBGRAPH_URL = envUrl;
    const client = new DelphiClient();
    const subgraph = client.getSubgraph();
    expect((subgraph as any).subgraphUrl).toBe(envUrl);
  });

  it("getSubgraph() should throw when subgraphUrl is not configured", () => {
    const client = new DelphiClient();
    (client as any).subgraphUrl = undefined;
    expect(() => client.getSubgraph()).toThrow("Requires subgraphUrl");
  });
});
