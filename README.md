# Sign-Pay

Signature-based crypto payment library for web applications. Accept crypto payments on your app in < 15 lines of code.

## Why This Exists

Traditional crypto payments:
1. Execute from the front-end
2. Try to link executions to user data on the back-end
3. Users have to think about gas

This creates a less robust and user-friendly checkout experience when purchasing with crypto compared to fiat.

**Sign-Pay solves this** by flipping the model: users sign an *authorization* for payment, your backend receives both the order data and payment signature in the same HTTP request, then executes the transaction on their behalf. This means:

- **Better UX**: Allow wallet to connect, allow signature creation
- **Atomic operations**: Payment verification and order processing happen together
- **Backend-controlled execution**: Middleware automatically adds purchase info to context
- **Customer doesn't think about gas**: Users only need an ERC-3009 token

## How It Works

### 1. Frontend Flow

```typescript
import { SignPay } from '@sign-pay/react';

<SignPay
  chainId={84532}
  tokenAddress="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  tokenAmount="1000000"  // 1 USDC (6 decimals)
  recipientAddress="0xYourAddress"
  paymentEndpoint="/api/purchase"
  orderData={{ orderId: '12345', items: [...] }}
/>
```

When clicked, the component:
1. Validates the token supports ERC-3009 (transferWithAuthorization)
2. Prompts user to sign an EIP-712 authorization message
3. Sends the signature + order data to your backend endpoint via `X-Payment` header

### 2. Backend Flow

```go
import signpay "github.com/mvpoyatt/sign-pay/server/go"

r.POST("/api/purchase",
  signpay.SignPayMiddleware(
    84532,                                         // Chain ID
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Token address
    "1000000",                                     // Amount
    "0xYourAddress",                               // Recipient
    "https://x402.org/facilitator",                // Facilitator URL
  ),
  func(c *gin.Context) {
    // Payment is verified and settled - process the order
    paymentData, _ := c.Get(signpay.PaymentDataKey)
    data := paymentData.(*signpay.PaymentData)

    // data.SettleResponse.Transaction contains the tx hash
    fulfillOrder(data)
  },
)
```

The middleware:
1. Extracts the payment signature from the `X-Payment` header
2. Verifies the signature is valid for the specified amount and recipient
3. Submits the transaction to the blockchain via a facilitator
4. Only calls your handler if payment succeeded
5. Returns 402 Payment Required if verification/settlement fails

### 3. Settlement via Facilitators

Under the hood, Sign-Pay uses **facilitators** (services that verify signatures and submit transactions). This leverages the x402 protocol infrastructure, which provides:

- Signature verification
- Transaction execution
- Gas management
- Settlement guarantees

You can use the public Coinbase facilitator (`https://x402.org/facilitator`) or others.

## Technical Details

### Security Model

- **Non-custodial**: Users never give you access to their funds. The signature authorizes a single specific transfer.
- **Replay protection**: Each authorization includes a nonce, preventing reuse.
- **Time bounds**: Authorizations can include validity windows.
- **Amount enforcement**: The middleware verifies the signature is for the exact amount you specified.

### Network Support

Currently supports:
- Ethereum Mainnet & Sepolia
- Base Mainnet & Sepolia
- Optimism Mainnet & Sepolia
- Arbitrum Mainnet & Sepolia
- Polygon & Amoy
- Avalanche C-Chain & Fuji

## Installation

### React Component

```bash
npm install @sign-pay/react
```

### Go Middleware

```bash
go get github.com/mvpoyatt/sign-pay/server/go
```

## Quick Start

See the [examples](./examples/) directory for complete working implementations:
- [Next.js Frontend Example](./examples/react-nextjs/)
- [Gin Backend Example](./examples/go-gin/)

For detailed package documentation:
- [React Component README](./client/react/README.md)
- [Go Middleware README](./server/go/README.md)

## Development

This is a monorepo with local package linking for development:

```bash
# Install dependencies
cd client/react && npm install && npm run build
cd examples/react-nextjs && npm install

# Run example app
cd examples/react-nextjs && npm run dev

# Run example backend
cd examples/go-gin && go run main.go
```

## License

MIT
