# Sign-Pay

x402-compatible payment infrastructure for signature-based crypto payments. Accept crypto payments via middleware in any application - from e-commerce checkouts to AI agent APIs.

## Overview

Sign-Pay implements the [x402 payment protocol](https://x402.org) with extensions for dynamic pricing and flexible workflows. Users sign EIP-712 payment authorizations, your backend verifies and settles them via facilitators, then serves the requested resource or processes the order.

**Core capabilities:**
- **x402 Protocol Support**: Standard X-PAYMENT/X-PAYMENT-RESPONSE headers and resource flow
- **Dynamic Pricing**: Calculate prices from order data before payment (see React component example below)
- **ERC-3009 Token Support**: Gasless transfers for any ERC-3009 compatible token (USDC, EURC, etc.)
- **Multiple Use Cases**: E-commerce checkout, API payments, metered access, AI agent integrations

## Architecture

```
┌─────────────┐
│   Client    │  (React component, TypeScript agents, direct HTTP, etc.)
└──────┬──────┘
       │ 1. Price Discovery (optional)
       │    Request without X-PAYMENT → receives 402 with price
       │
       │ 2. Payment
       │    Request with X-PAYMENT header
       ▼
┌─────────────┐
│   Server    │  (SignPay Go middleware - x402 compatible)
│ Middleware  │
└──────┬──────┘
       │ 3. Verify & Settle
       ▼
┌─────────────┐
│ Facilitator │
└─────────────┘
```

**Server**: Go middleware handles x402 payment flow
**Client**: Optional packages for different use cases (React for e-commerce with dynamic pricing, future: TypeScript for agents, etc.)

## Quick Examples

### Use Case 1: E-Commerce Checkout

**Frontend** (React component):
```tsx
import { SignPay } from '@sign-pay/react';

<SignPay
  chainId={84532}
  tokenAddress="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  recipientAddress="0xYourAddress"
  paymentEndpoint="/api/purchase"
  orderData={{ items: [...], email: "..." }}
/>
```

**Backend**:
```go
import signpay "github.com/mvpoyatt/sign-pay/server/go"

r.POST("/api/purchase",
  calculateOrderTotal,  // Set dynamic amount from order
  signpay.SignPayMiddleware(
    84532,                                         // Chain ID
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Token address
    "",                                            // Amount (empty = dynamic)
    "0xYourRecipient",                             // Recipient
    "https://x402.org/facilitator",                // Facilitator URL
  ),
  fulfillOrder,  // Process after payment verified
)
```

### Use Case 2: API Payment (Agents, Direct Access)

**Client** (any HTTP client):
```bash
curl https://api.example.com/premium-data \
  -H "X-PAYMENT: eyJ2ZXJzaW9uIjoxLCJjaGFpbklkIjo..." \
  -H "Content-Type: application/json"
```

**Backend**:
```go
r.GET("/premium-data",
  signpay.SignPayMiddleware(
    84532,                                         // Chain ID
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Token address
    "1000000",                                     // Amount (1 USDC)
    "0xYourRecipient",                             // Recipient
    "https://x402.org/facilitator",                // Facilitator URL
  ),
  func(c *gin.Context) {
    c.JSON(200, gin.H{"data": "premium content"})
  },
)
```

## How It Works

### Basic Flow

1. **[Optional] Price Discovery**: Client sends request without X-PAYMENT header, receives 402 response with pricing (enables dynamic pricing from order data)
2. **Token Validation**: Client validates token supports ERC-3009 (gasless transfers) - React component does this automatically
3. **Payment Signature**: Client creates EIP-712 payment authorization and sends via `X-PAYMENT` header
4. **Verification & Settlement**: Middleware verifies signature and settles payment via facilitator
5. **Blockchain Execution**: Facilitator executes the transaction (handles gas)
6. **Handler Execution**: Your handler runs only after successful payment
7. **Response**: Includes `X-PAYMENT-RESPONSE` header with settlement proof

## Network Support

- Ethereum Mainnet (1) & Sepolia (11155111)
- Base Mainnet (8453) & Sepolia (84532)
- Optimism Mainnet (10) & Sepolia (11155420)
- Arbitrum Mainnet (42161) & Sepolia (421614)
- Polygon Mainnet (137) & Amoy (80002)
- Avalanche C-Chain (43114) & Fuji (43113)

Supports any ERC-3009 compatible token on these networks.

## Installation

**Go Middleware** (core):
```bash
go get github.com/mvpoyatt/sign-pay/server/go
```

**React Component** (optional, for e-commerce):
```bash
npm install @sign-pay/react
```

## Documentation

- [Go Middleware README](./server/go/README.md) - Core middleware documentation
- [React Component README](./client/react/README.md) - E-commerce checkout component

## Examples

- [E-commerce: Next.js + Gin](./examples/) - Full checkout flow with React component
- Future: AI agent integration example

## Development

```bash
# Install dependencies
cd client/react && npm install && npm run build
cd examples/react-nextjs && npm install

# Run examples
cd examples/react-nextjs && npm run dev  # Frontend
cd examples/go-gin && go run main.go     # Backend
```

## License

MIT
