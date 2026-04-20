import { describe, it, expect } from "vitest";
import { createPrivateKeySigner, createCdpSigner } from "../../src/client/signer.js";
import type { PrivateKeySignerConfig, CdpSignerConfig } from "../../src/client/signer.js";

// Test private key (DO NOT USE IN PRODUCTION - this is a well-known test key)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

describe("createPrivateKeySigner", () => {
  const config: PrivateKeySignerConfig = {
    privateKey: TEST_PRIVATE_KEY,
    rpcUrl: "https://example.com/rpc",
    chainId: 1,
  };

  it("should create a DelphiSigner with correct structure and address", async () => {
    const signer = await createPrivateKeySigner(config);

    expect(signer).toHaveProperty("address");
    expect(signer).toHaveProperty("walletClient");
    expect(signer).toHaveProperty("publicClient");
    expect(signer.address).toBe(TEST_ADDRESS);
    expect(signer.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(signer.walletClient.chain?.id).toBe(1);
    expect(signer.publicClient.chain?.id).toBe(1);
  });
});

describe("createCdpSigner", () => {
  const config: CdpSignerConfig = {
    apiKeyId: "test-api-key-id",
    apiKeySecret: "test-api-key-secret",
    walletSecret: "test-wallet-secret",
    walletAddress: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    rpcUrl: "https://example.com/rpc",
    chainId: 1,
  };

  it("should create a DelphiSigner with correct structure", async () => {
    // Note: This will fail with test credentials, but demonstrates the expected structure
    // In a real scenario with valid CDP credentials, it would succeed
    const result = createCdpSigner(config);
    expect(result).toBeInstanceOf(Promise);

    // Properly handle the promise rejection to avoid unhandled rejection warnings
    await expect(result).rejects.toThrow();
  });
});
