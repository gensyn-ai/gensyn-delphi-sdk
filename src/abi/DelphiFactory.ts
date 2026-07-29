import type { Abi } from "viem";

/**
 * Minimal DelphiFactory ABI — only the reads the SDK needs to resolve which
 * deployment (legacy or automated-settlement) a market proxy belongs to.
 *
 * Each gateway serves only the markets deployed by its own factory and reverts
 * with `MarketProxyNotDeployedByFactory` for anything else, so `marketProxyExists`
 * is what lets the client route a call to the correct gateway.
 */
const DELPHI_FACTORY_ABI = [
  {
    "inputs": [],
    "name": "IMPLEMENTATION",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTotalMarketProxiesCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "marketProxy",
        "type": "address"
      }
    ],
    "name": "marketProxyExists",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "marketProxies",
        "type": "address[]"
      }
    ],
    "name": "marketProxiesExist",
    "outputs": [
      {
        "internalType": "bool[]",
        "name": "",
        "type": "bool[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const satisfies Abi;

export const ABI = DELPHI_FACTORY_ABI;
export default DELPHI_FACTORY_ABI;
