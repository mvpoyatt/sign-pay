'use client';

import { useEffect, useState } from 'react';
import { erc20Abi } from 'viem'
import { useConnection, useSwitchChain, useReadContract, useWalletClient } from 'wagmi'
import { SupportedChainId } from './wagmi';
import { WalletOptions } from './wallet-options';
import { CreateSignature } from './create-signature';
import { useIsERC3009Token } from './detect-standard';

export type ConnectAndPayProps = {
  chainId: SupportedChainId
  tokenAddress: `0x${string}`
  tokenAmount: string  // Amount in smallest unit (e.g., "19990000" for 19.99 USDC with 6 decimals)
  recipientAddress: `0x${string}`
  paymentEndpoint?: string
  orderHeaders?: Record<string, string>
  /* eslint-disable @typescript-eslint/no-explicit-any */
  orderData?: Record<string, any>
  // Custom callback (overrides paymentEndpoint if provided)
  onPaymentCreated?: (signatureData: string) => Promise<void>
  isDark: boolean
  accentColor: string
};

export function ConnectAndPay({
  chainId,
  tokenAddress,
  tokenAmount,
  recipientAddress,
  paymentEndpoint,
  orderHeaders,
  orderData,
  onPaymentCreated,
  isDark,
  accentColor,
}: ConnectAndPayProps) {
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const { isConnected, chain, address } = useConnection()
  const switchChain = useSwitchChain()
  const { data: walletClient } = useWalletClient({ chainId })

  useEffect(() => {
    if (isConnected && chain?.id !== chainId) {
      switchChain.mutate({ chainId })
    }
  }, [isConnected, chain?.id, chainId, switchChain])

  // Validate token supports ERC-3009
  const { isSupported: isERC3009, isLoading: isCheckingToken } = useIsERC3009Token(
    tokenAddress,
    chainId
  )

  // Get token metadata for display
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'symbol',
    chainId: chainId,
  })

  const { data: tokenName } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'name',
    chainId: chainId,
  })

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: chainId,
  })

  // Try to read version from token contract (EIP-712 domain)
  const { data: tokenVersion } = useReadContract({
    address: tokenAddress,
    abi: [
      {
        name: 'version',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'string' }],
      },
    ],
    functionName: 'version',
    chainId: chainId,
    query: { retry: false } // Don't retry if version() doesn't exist
  })

  // Convert smallest unit to human-readable for display
  const displayAmount = tokenDecimals
    ? (Number(tokenAmount) / Math.pow(10, tokenDecimals)).toFixed(Math.min(tokenDecimals, 6))
    : tokenAmount;

  const handlePay = async () => {
    if (!isConnected || !address || !walletClient || !tokenName) {
      console.error('Missing required data for payment');
      return;
    }

    try {
      const signatureData = await CreateSignature(
        walletClient,
        address,
        recipientAddress,
        tokenAddress,
        tokenAmount,
        chainId,
        tokenName as string,
        (tokenVersion as string) || '2' // Use token's version or default to '2' for USDC/EURC
      );

      // Handle payment with custom callback or endpoint
      if (onPaymentCreated) {
        await onPaymentCreated(signatureData);
      } else if (paymentEndpoint) {
        const response = await fetch(paymentEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Payment': signatureData,
            ...(orderHeaders || {})
          },
          body: orderData ? JSON.stringify(orderData) : undefined
        });

        if (!response.ok) {
          throw new Error(`Payment endpoint returned ${response.status}`);
        }
      } else {
        console.log('Payment signature created:', signatureData);
        console.warn('No payment handler provided. Pass onPaymentCreated or paymentEndpoint to handle payment.');
      }

    } catch (error) {
      console.error('Payment failed:', error);
      // TODO: Show error to user
    }
  }

  // Show error if token doesn't support ERC-3009
  if (!isCheckingToken && !isERC3009) {
    return (
      <div style={{ padding: '1rem', backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '0.5rem' }}>
        <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Unsupported Token</h3>
        <p style={{ fontSize: '0.875rem' }}>
          This token does not support ERC-3009 gasless transfers.
        </p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Token: {tokenAddress}
        </p>
      </div>
    );
  }

  const darkenColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `#${Math.floor(r * 0.85).toString(16).padStart(2, '0')}${Math.floor(g * 0.85).toString(16).padStart(2, '0')}${Math.floor(b * 0.85).toString(16).padStart(2, '0')}`;
  };

  return (
    <>
      <WalletOptions
        chainId={chainId}
        tokenAddress={tokenAddress}
        isDark={isDark}
        accentColor={accentColor}
      />

      <button
        disabled={!isConnected || (chain?.id !== chainId) || isCheckingToken}
        style={{
          width: '100%',
          marginTop: '1.25rem',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          backgroundColor: isHoveringButton ? darkenColor(accentColor) : accentColor,
          color: 'white',
          opacity: (!isConnected || (chain?.id !== chainId) || isCheckingToken) ? 0.5 : 1,
          cursor: isHoveringButton ? 'pointer' : 'default'
        }}
        onMouseEnter={() => setIsHoveringButton(true)}
        onMouseLeave={() => setIsHoveringButton(false)}
        onClick={() => { handlePay() }}>
        {isCheckingToken ? 'Validating token...' : `Purchase for ${displayAmount} ${tokenSymbol || '...'}`}
      </button>
    </>
  )
}
