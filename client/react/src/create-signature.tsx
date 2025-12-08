// Map chain IDs to x402 network names
const chainIdToNetwork: Record<number, string> = {
  1: 'ethereum',
  11155111: 'sepolia',
  8453: 'base',
  84532: 'base-sepolia',
  10: 'optimism',
  11155420: 'optimism-sepolia',
  42161: 'arbitrum',
  421614: 'arbitrum-sepolia',
  137: 'polygon',
  80002: 'polygon-amoy',
  43114: 'avalanche',
  43113: 'avalanche-fuji',
  59144: 'linea',
  59141: 'linea-sepolia',
  324: 'zksync',
  300: 'zksync-sepolia',
};

export async function CreateSignature(
  /* eslint-disable @typescript-eslint/no-explicit-any */
  walletClient: any, // wagmi wallet client (loosely typed to support all chains)
  fromAddress: `0x${string}`, // User's wallet address
  recipientAddress: `0x${string}`, // Merchant's address
  tokenAddress: `0x${string}`, // Token contract address
  tokenAmount: string, // Amount in smallest unit (e.g., "1000000" for 1 USDC with 6 decimals)
  chainId: number, // Chain ID (e.g., 8453 for Base)
  tokenName: string, // Token name for EIP-712 domain (e.g., "USD Coin")
  tokenVersion: string = '2' // Token version for EIP-712 domain
) {
  if (!walletClient) {
    throw new Error('No wallet client available');
  }

  // Generate nonce and validity window
  const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
  const validAfter = BigInt(0);
  const validBefore = BigInt(Math.floor(Date.now() / 1000 + 3600)); // 1 hour from now

  // EIP-712 domain for the token
  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId: chainId,
    verifyingContract: tokenAddress
  } as const;

  // ERC-3009 TransferWithAuthorization type
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  } as const;

  const message = {
    from: fromAddress,
    to: recipientAddress,
    value: BigInt(tokenAmount),
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce
  } as const;

  // Sign with EIP-712 using viem
  const signature = await walletClient.signTypedData({
    account: fromAddress,
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message
  });

  // Get network name from chain ID
  const network = chainIdToNetwork[chainId];
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // Create PaymentPayload matching x402 SDK structure
  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: network,
    payload: {
      signature: signature,
      authorization: {
        from: fromAddress,
        to: recipientAddress,
        value: tokenAmount,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce
      }
    }
  };

  // Return Base64 encoded
  return btoa(JSON.stringify(paymentPayload));
}
