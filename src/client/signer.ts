/**
 * Signer module — creates a viem-compatible wallet client from either
 * a raw private key or a Coinbase Developer Platform (CDP) Server Wallet.
 *
 * Both paths produce the same {@link DelphiSigner} shape so the rest of
 * the SDK can remain signing-agnostic.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  type Account,
  type WalletClient,
  type PublicClient,
  type HttpTransport,
  type Chain,
} from "viem";
import { privateKeyToAccount, toAccount } from "viem/accounts";

// ─── Shared types ─────────────────────────────────────────────────────────────

/**
 * A signing context that every write method in the SDK consumes.
 */
export interface DelphiSigner {
  /** On-chain address of the signing wallet */
  address: `0x${string}`;
  /** Wallet client for signing & sending transactions (has embedded account) */
  walletClient: WalletClient<HttpTransport, Chain, Account>;
  /** Public client for reading chain state & simulating calls */
  publicClient: PublicClient<HttpTransport, Chain>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildChain(chainId: number, rpcUrl: string): Chain {
  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  });
}

// ─── Private-key signer ───────────────────────────────────────────────────────

export interface PrivateKeySignerConfig {
  privateKey: `0x${string}`;
  rpcUrl: string;
  chainId: number;
}

export async function createPrivateKeySigner(config: PrivateKeySignerConfig): Promise<DelphiSigner> {
  const account = privateKeyToAccount(config.privateKey);
  const chain = buildChain(config.chainId, config.rpcUrl);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  return {
    address: account.address,
    walletClient: walletClient as WalletClient<HttpTransport, Chain, Account>,
    publicClient,
  };
}

// ─── CDP Server Wallet signer ─────────────────────────────────────────────────

export interface CdpSignerConfig {
  apiKeyId: string;
  apiKeySecret: string;
  walletSecret: string;
  walletAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
}

/**
 * Creates a {@link DelphiSigner} backed by a CDP Server Wallet v2.
 *
 * Dynamically imports `@coinbase/cdp-sdk` so private-key-only users
 * don't need the dependency installed.
 */
export async function createCdpSigner(config: CdpSignerConfig): Promise<DelphiSigner> {
  const { CdpClient } = await import("@coinbase/cdp-sdk");

  const cdp = new CdpClient({
    apiKeyId: config.apiKeyId,
    apiKeySecret: config.apiKeySecret,
    walletSecret: config.walletSecret,
  });

  const account = await cdp.evm.getAccount({
    address: config.walletAddress,
  });

  const chain = buildChain(config.chainId, config.rpcUrl);

  const walletClient = createWalletClient({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDP account is duck-type compatible with viem's LocalAccountSource
    account: toAccount(account as any),
    chain,
    transport: http(config.rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  return {
    address: config.walletAddress,
    walletClient: walletClient as WalletClient<HttpTransport, Chain, Account>,
    publicClient,
  };
}
