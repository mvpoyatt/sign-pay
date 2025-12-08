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
  const [response, setResponse] = useState<{success: boolean, message: string} | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
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

    if (response && !response.success) {
      setResponse(null); // Clear previous error
      return;
    }

    setProcessingPayment(true);

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
          const errorText = await response.text();
          console.warn('Payment endpoint error:', errorText || response.statusText);

          // Try to parse JSON error message
          let errorMessage = errorText || response.statusText;
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error) {
              errorMessage = errorJson.error;
            }
          } catch {
            // If not JSON, use the raw text
          }

          setResponse({ success: false, message: errorMessage });
        } else {
          const responseData = await response.json();
          console.log('Payment processed successfully:', responseData);
          setResponse({ success: true, message: 'Payment successful' });
        }
      } else {
        console.log('Payment signature created:', signatureData);
        console.warn('No payment handler provided. Pass onPaymentCreated or paymentEndpoint to handle payment.');
      }

    } catch (error) {
      console.error('Payment failed:', error);
      setResponse({ success: false, message: (error as Error).message || 'Payment failed' });
    } finally {
      setProcessingPayment(false);
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
      <div style={{ height: '12rem', overflowY: 'auto' }}>
        { !response && !processingPayment &&
          <WalletOptions
            chainId={chainId}
            tokenAddress={tokenAddress}
            isDark={isDark}
            accentColor={accentColor}
          />
        }

        { response && !response.success && !processingPayment &&
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: isDark ? '#3f3f46' : '#fef2f2',
            color: isDark ? '#fca5a5' : '#991b1b',
            border: isDark ? '1px solid #52525b' : '1px solid #fecaca'
          }}>
            <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Payment Error</h3>
            <p>{response.message}</p>
          </div>
        }

        { response && response.success && !processingPayment &&
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: isDark ? '#064e3b' : '#ecfdf5',
            color: isDark ? '#a7f3d0' : '#065f46',
            border: isDark ? '1px solid #10b981' : '1px solid #a7f3d0'
          }}>
            <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Payment Successful</h3>
            <p>Your payment has been processed successfully. You can close this window.</p>
          </div>
        }

        { processingPayment &&
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '8rem',
            paddingBottom: '2rem'
          }}>
            <LoadingSpinner accentColor={accentColor} size={48} />
          </div>
        }
      </div>

      { !response && <button
        disabled={!isConnected || (chain?.id !== chainId) || isCheckingToken || processingPayment}
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
      </button> }

      { response && !response.success && !processingPayment && <button
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
        Try Again
      </button> }
    </>
  )
}

interface LoadingSpinnerProps {
  accentColor: string;
  size?: number;
}

function LoadingSpinner({ accentColor, size = 32 }: LoadingSpinnerProps) {
  return (
    <div role="status">
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .spinner-svg {
          animation: spin 1s linear infinite;
        }
      `}</style>
      <svg
        aria-hidden="true"
        className="spinner-svg"
        style={{ width: `${size}px`, height: `${size}px` }}
        viewBox="0 0 100 101"
        fill="none"
        xmlns="http://www.w3.org/2000/svg">
        <path
          d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
          fill={`${accentColor}33`}
        />
        <path
          d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
          fill={accentColor}
        />
      </svg>
      <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
        Loading...
      </span>
    </div>
  );
}
