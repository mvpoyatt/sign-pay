'use client';

import { SignPay } from '@sign-pay/react';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-zinc-900 sm:items-start">
        <div className="mb-8 w-full sm:mb-16 sm:flex sm:w-auto sm:justify-start bg-zinc-900 text-white p-4 rounded-lg">

          <SignPay
            // Chain configs
            chainId={84532}
            tokenAddress={'0x036CbD53842c5426634e7929541eC2318f3dCF7e'}
            tokenAmount={'19990000'}
            recipientAddress={'0xB8E124eaA317761CF8E4C63EB445fA3d21deD759'}
            // API configs
            paymentEndpoint={'http://localhost:8080/api/purchase'}
            orderData={{ orderId: 'order_12345', description: 'Test Order' }}
            // UI customization
            buttonHeight={40}
            buttonWidth={160}
            displayMode="dark"
            accentColor="#0169a4"
          />

        </div>
      </main>
    </div>
  );
}
