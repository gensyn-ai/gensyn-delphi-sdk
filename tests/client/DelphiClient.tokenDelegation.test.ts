import { describe, it, expect, vi, beforeEach } from "vitest";

// `DelphiClient` calls `dotenvConfig()` at module load time.
// Mock dotenv so missing-env tests aren't affected by local `.env` files.
vi.mock("dotenv", () => ({
  config: () => ({}),
}));

// Test private key (DO NOT USE IN PRODUCTION - this is a well-known test key)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

const mockMarketAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const mockGatewayAddress = "0x1111111111111111111111111111111111111111" as `0x${string}`;

let observed: {
  signerAddress?: string;
  gatewayAddress?: string;
  lastParams?: unknown;
} = {};

const TokenClientMock = vi.fn().mockImplementation(function (getSigner: () => Promise<any>, getGatewayAddress: () => any) {
  (this as any).getSignerFn = getSigner;
  (this as any).getGatewayAddressFn = getGatewayAddress;

  (this as any).getTokenAllowance = async (params: unknown) => {
    (observed as any).lastParams = params;
    const signer = await (this as any).getSignerFn();
    observed.signerAddress = signer.address;
    observed.gatewayAddress = (this as any).getGatewayAddressFn();
    return { ownerAddress: signer.address, allowance: 123n };
  };

  (this as any).approveToken = async (params: unknown) => {
    (observed as any).lastParams = params;
    const signer = await (this as any).getSignerFn();
    observed.signerAddress = signer.address;
    observed.gatewayAddress = (this as any).getGatewayAddressFn();
    return { transactionHash: "0xapprove" };
  };

  (this as any).ensureTokenApproval = async (params: unknown) => {
    (observed as any).lastParams = params;
    const signer = await (this as any).getSignerFn();
    observed.signerAddress = signer.address;
    observed.gatewayAddress = (this as any).getGatewayAddressFn();
    return { approvalNeeded: true, allowance: 456n, transactionHash: "0xensure" };
  };
});

vi.mock("@/client/token", () => ({
  TokenClient: TokenClientMock,
}));

describe("DelphiClient token delegation", () => {
  beforeEach(() => {
    observed = {};
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

    TokenClientMock.mockClear();
  });

  it("getTokenAllowance() delegates to TokenClient and wires signer + gateway", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = mockGatewayAddress;

    const { DelphiClient } = await import("../../src/client/DelphiClient.js");
    const client = new DelphiClient();

    const result = await client.getTokenAllowance({ marketAddress: mockMarketAddress });

    expect(TokenClientMock).toHaveBeenCalledTimes(1);
    expect(observed.signerAddress).toBe(TEST_ADDRESS);
    expect(observed.gatewayAddress).toBe(mockGatewayAddress);
    expect((observed.lastParams as any).marketAddress).toBe(mockMarketAddress);
    expect(result).toEqual({ ownerAddress: TEST_ADDRESS, allowance: 123n });
  });

  it("reuses the same TokenClient instance across token methods", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = mockGatewayAddress;

    const { DelphiClient } = await import("../../src/client/DelphiClient.js");
    const client = new DelphiClient();

    await client.getTokenAllowance({ marketAddress: mockMarketAddress });
    await client.approveToken({ marketAddress: mockMarketAddress, amount: 1n });
    await client.ensureTokenApproval({ marketAddress: mockMarketAddress, minimumAmount: 1n, approveAmount: 2n });

    // DelphiClient lazily creates TokenClient once and reuses it.
    expect(TokenClientMock).toHaveBeenCalledTimes(1);
  });

  it("getTokenAllowance() propagates missing gatewayAddress error from signer->gateway wiring", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = mockGatewayAddress;

    const { DelphiClient } = await import("../../src/client/DelphiClient.js");
    const client = new DelphiClient();
    (client as any).gatewayAddress = undefined;

    await expect(client.getTokenAllowance({ marketAddress: mockMarketAddress })).rejects.toThrow("Requires gatewayAddress");
  });

  it("getTokenAllowance() propagates missing rpcUrl error from signer wiring", async () => {
    process.env.DELPHI_SIGNER_TYPE = "private_key";
    process.env.WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.GENSYN_RPC_URL = "https://example.com/rpc";
    process.env.GENSYN_CHAIN_ID = "1";
    process.env.DELPHI_GATEWAY_CONTRACT = mockGatewayAddress;

    const { DelphiClient } = await import("../../src/client/DelphiClient.js");
    const client = new DelphiClient();
    (client as any).rpcUrl = undefined;

    await expect(client.getTokenAllowance({ marketAddress: mockMarketAddress })).rejects.toThrow("Requires rpcUrl");
  });
});

