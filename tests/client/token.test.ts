import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenClient } from "../../src/client/token.js";
import type { DelphiSigner } from "../../src/client/signer.js";

describe("TokenClient", () => {
  const MAX_UINT256 = 2n ** 256n - 1n;
  const mockMarketAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const mockTokenAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`;
  const mockOwnerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;

  const createMockSigner = (): DelphiSigner => {
    return {
      address: mockOwnerAddress,
      walletClient: {
        writeContract: vi.fn().mockResolvedValue("0xtxhash"),
      } as any,
      publicClient: {
        readContract: vi.fn(),
        simulateContract: vi.fn().mockResolvedValue({}),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({}),
      } as any,
    };
  };

  let mockSigner: DelphiSigner;
  let getSigner: () => Promise<DelphiSigner>;
  let getGatewayAddress: () => `0x${string}`;
  let getTokenAddress: () => `0x${string}`;

  beforeEach(() => {
    mockSigner = createMockSigner();
    getSigner = vi.fn().mockResolvedValue(mockSigner);
    // TokenClient no longer uses gateway address internally, but we keep this callback
    // to match the constructor signature.
    getGatewayAddress = vi.fn().mockReturnValue("0x1111111111111111111111111111111111111111" as `0x${string}`);
    getTokenAddress = vi.fn().mockReturnValue(mockTokenAddress);
  });

  it("should create a TokenClient instance", () => {
    const client = new TokenClient(getSigner, getGatewayAddress, getTokenAddress);
    expect(client).toBeInstanceOf(TokenClient);
  });

  it("should get token allowance", async () => {
    const expectedAllowance = 1000000n;
    (mockSigner.publicClient.readContract as any)
      .mockResolvedValueOnce(expectedAllowance); // allowance call

    const client = new TokenClient(getSigner, getGatewayAddress, getTokenAddress);
    const result = await client.getTokenAllowance({
      marketAddress: mockMarketAddress,
    });

    expect(result).toHaveProperty("ownerAddress");
    expect(result).toHaveProperty("allowance");
    expect(result.ownerAddress).toBe(mockOwnerAddress);
    expect(result.allowance).toBe(expectedAllowance);

    expect(mockSigner.publicClient.readContract).toHaveBeenCalledTimes(1);

    const [allowanceCallArgs] = (mockSigner.publicClient.readContract as any).mock.calls as Array<
      [Record<string, unknown>]
    >;
    expect(allowanceCallArgs[0].address).toBe(mockTokenAddress);
    expect(allowanceCallArgs[0].functionName).toBe("allowance");
    expect(allowanceCallArgs[0].args).toEqual([mockOwnerAddress, mockMarketAddress]);
  });

  it("should return approval not needed when allowance is sufficient", async () => {
    const sufficientAllowance = 1000000n;
    (mockSigner.publicClient.readContract as any)
      .mockResolvedValueOnce(sufficientAllowance); // getTokenAllowance

    const client = new TokenClient(getSigner, getGatewayAddress, getTokenAddress);
    const result = await client.ensureTokenApproval({
      marketAddress: mockMarketAddress,
      minimumAmount: 500000n,
    });

    expect(result.approvalNeeded).toBe(false);
    expect(result.allowance).toBe(sufficientAllowance);
    expect(result.transactionHash).toBeUndefined();

    expect(mockSigner.publicClient.simulateContract).not.toHaveBeenCalled();
    expect(mockSigner.walletClient.writeContract).not.toHaveBeenCalled();
    expect(mockSigner.publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it("should return approval needed when allowance is insufficient", async () => {
    const insufficientAllowance = 100000n;
    (mockSigner.publicClient.readContract as any)
      .mockResolvedValueOnce(insufficientAllowance); // getTokenAllowance

    const client = new TokenClient(getSigner, getGatewayAddress, getTokenAddress);
    const result = await client.ensureTokenApproval({
      marketAddress: mockMarketAddress,
      minimumAmount: 500000n,
    });

    expect(result.approvalNeeded).toBe(true);
    expect(result.transactionHash).toBe("0xtxhash");

    // default approveAmount is MAX_UINT256
    expect(result.allowance).toBe(MAX_UINT256);
    expect(mockSigner.publicClient.simulateContract).toHaveBeenCalledTimes(1);
    expect(mockSigner.walletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(mockSigner.publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(1);

    const simulateCall = (mockSigner.publicClient.simulateContract as any).mock.calls[0][0] as Record<string, unknown>;
    expect(simulateCall.account).toBe(mockOwnerAddress);
    expect(simulateCall.address).toBe(mockTokenAddress);
    expect(simulateCall.functionName).toBe("approve");
    expect(simulateCall.args).toEqual([mockMarketAddress, MAX_UINT256]);
  });

  it("approveToken() should simulate, write, and wait with correct args", async () => {
    const client = new TokenClient(getSigner, getGatewayAddress, getTokenAddress);
    const result = await client.approveToken({
      marketAddress: mockMarketAddress,
      // amount omitted => defaults to MAX_UINT256
    });

    expect(result).toEqual({ transactionHash: "0xtxhash" });

    expect(mockSigner.publicClient.simulateContract).toHaveBeenCalledTimes(1);
    expect(mockSigner.walletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(mockSigner.publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(1);

    const simulateCall = (mockSigner.publicClient.simulateContract as any).mock.calls[0][0] as Record<string, unknown>;
    expect(simulateCall.account).toBe(mockOwnerAddress);
    expect(simulateCall.address).toBe(mockTokenAddress);
    expect(simulateCall.functionName).toBe("approve");
    expect(simulateCall.args).toEqual([mockMarketAddress, MAX_UINT256]);

    const writeCall = (mockSigner.walletClient.writeContract as any).mock.calls[0][0] as Record<string, unknown>;
    expect(writeCall.address).toBe(mockTokenAddress);
    expect(writeCall.functionName).toBe("approve");
    expect(writeCall.args).toEqual([mockMarketAddress, MAX_UINT256]);

    const waitCall = (mockSigner.publicClient.waitForTransactionReceipt as any).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(waitCall.hash).toBe("0xtxhash");
  });

  it("ensureTokenApproval() should use provided approveAmount", async () => {
    const insufficientAllowance = 100000n;
    const customApproveAmount = 999n;

    (mockSigner.publicClient.readContract as any)
      .mockResolvedValueOnce(insufficientAllowance); // allowance

    const client = new TokenClient(getSigner, getGatewayAddress, getTokenAddress);
    const result = await client.ensureTokenApproval({
      marketAddress: mockMarketAddress,
      minimumAmount: 500000n,
      approveAmount: customApproveAmount,
    });

    expect(result.approvalNeeded).toBe(true);
    expect(result.allowance).toBe(customApproveAmount);
    expect(result.transactionHash).toBe("0xtxhash");

    const writeCall = (mockSigner.walletClient.writeContract as any).mock.calls[0][0] as Record<string, unknown>;
    expect(writeCall.args).toEqual([mockMarketAddress, customApproveAmount]);
  });
});
