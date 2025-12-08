'use client';

import { useState } from 'react';
import { WagmiProvider } from 'wagmi'
import { WagmiConfig, SupportedChainId } from './wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ConnectAndPay } from './connect-pay';
import { FiX } from "react-icons/fi";

export type SignPayProps = {
  chainId: SupportedChainId
  tokenAddress: `0x${string}`
  tokenAmount: string
  recipientAddress: `0x${string}`
  paymentEndpoint?: string
  orderHeaders?: Record<string, string>
  /* eslint-disable @typescript-eslint/no-explicit-any */
  orderData?: Record<string, any>
  // Custom callback (overrides paymentEndpoint if provided)
  onPaymentCreated?: (signatureData: string) => Promise<void>

  buttonHeight?: number
  buttonWidth?: number
};

export function SignPay({
  chainId,
  tokenAddress,
  tokenAmount,
  recipientAddress,
  paymentEndpoint,
  orderHeaders,
  orderData,
  onPaymentCreated,
  buttonHeight,
  buttonWidth,
}: SignPayProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <WagmiProvider config={WagmiConfig}>
      <QueryClientProvider client={new QueryClient()}>

        <button
          style={{
            borderRadius: '9999px',
            backgroundColor: '#9333ea',
            padding: '0.5rem 1rem',
            color: 'white',
            marginBottom: '1rem',
            cursor: 'pointer',
            border: 'none',
            fontSize: '1rem',
            height: buttonHeight || 40,
            width: buttonWidth || 160,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7e22ce'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#9333ea'}
          onClick={() => {setIsOpen(true)}}>
          Pay with Crypto
        </button>

        <Dialog open={isOpen} as="div" style={{ position: 'relative', zIndex: 10 }} onClose={() => {setIsOpen(false)}}>
          <DialogBackdrop transition style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />

          <div style={{ position: 'fixed', inset: 0, zIndex: 10, width: '100vw', overflowY: 'auto' }}>
            <div style={{ display: 'flex', minHeight: '100%', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <DialogPanel
                transition
                style={{
                  width: '100%',
                  maxWidth: '28rem',
                  borderRadius: '0.75rem',
                  backgroundColor: 'black',
                  padding: '1.5rem',
                  backdropFilter: 'blur(40px)',
                }}>

                <DialogTitle style={{ fontSize: '1.125rem', fontWeight: 500, color: 'white', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3>Pay With Crypto</h3>
                    <FiX
                      style={{ cursor: 'pointer', color: 'white' }}
                      size={20}
                      onClick={() => setIsOpen(false)}
                    />
                  </div>
                </DialogTitle>

                <ConnectAndPay
                  chainId={chainId}
                  tokenAddress={tokenAddress}
                  tokenAmount={tokenAmount}
                  recipientAddress={recipientAddress}
                  paymentEndpoint={paymentEndpoint}
                  orderHeaders={orderHeaders}
                  orderData={orderData}
                  onPaymentCreated={onPaymentCreated}
                />

              </DialogPanel>
            </div>
          </div>
        </Dialog>

      </QueryClientProvider>
    </WagmiProvider>
  );
}
