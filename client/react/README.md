# @sign-pay/react

React checkout component for signature-based crypto payments. Provides a complete e-commerce payment flow with automatic price discovery, wallet connection, and payment signing.

## Installation

```bash
npm install @sign-pay/react
```

## Basic Usage

```tsx
import { SignPay } from '@sign-pay/react';

export default function CheckoutPage() {
  return (
    <SignPay
      // Network & token config
      chainId={84532}
      tokenAddress="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      recipientAddress="0xYourAddress"

      // Backend endpoint
      paymentEndpoint="/api/purchase"

      // Order data (sent in request body)
      orderData={{
        customerEmail: "customer@example.com",
        items: [
          {
            productCode: "TSH-001",
            productName: "T-Shirt",
            quantity: 2,
            size: "L"
          }
        ]
      }}

      // Optional: UI customization
      displayMode="system"
      accentColor="#10b981"
    />
  );
}
```

## How It Works

1. **Price Discovery** (automatic on load): Component sends order data to backend, receives price from 402 response
2. **User Interaction**: User clicks "Pay with Crypto", connects wallet if needed, signs EIP-712 authorization
3. **Payment**: Component sends signed authorization via `X-PAYMENT` header with order data in body
4. **Backend Processing**: Go middleware settles payment and processes order

See the [Go middleware README](https://github.com/mvpoyatt/sign-pay/tree/main/server/go) for backend implementation.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `chainId` | `number` | Yes | Network chain ID (e.g., 1 for Ethereum, 8453 for Base) |
| `tokenAddress` | `0x${string}` | Yes | ERC-3009 token address (e.g., USDC) |
| `recipientAddress` | `0x${string}` | Yes | Where the funds should go |
| `paymentEndpoint` | `string` | Yes* | Your backend endpoint to receive the payment |
| `orderData` | `object` | No | Custom data sent in request body |
| `orderHeaders` | `object` | No | Custom headers (e.g., auth tokens) |
| `onPaymentCreated` | `function` | Yes* | Alternative to `paymentEndpoint` - callback receives signature data |
| `buttonHeight` | `number` | No | Button height in pixels (default: 40) |
| `buttonWidth` | `number` | No | Button width in pixels (default: 160) |
| `buttonText` | `string` | No | Custom button text (default: 'Pay with Crypto') |
| `buttonRadius` | `string` | No | Button border radius (default: '0.75rem') |
| `buttonBackgroundColor` | `string` | No | Button background color, overrides `accentColor` for button only |
| `displayMode` | `'light' \| 'dark' \| 'system'` | No | Theme mode (default: 'system'). 'system' follows OS preference |
| `accentColor` | `string` | No | Hex color for accents like spinner and borders (default: '#338aea') |

*Either `paymentEndpoint` or `onPaymentCreated` is required.

## Theming

```tsx
<SignPay
  // ... other props
  displayMode="system"           // Auto-detects OS theme
  accentColor="#10b981"          // Custom accent color for spinner, borders
  buttonText="Buy Now"           // Custom button text
  buttonRadius="0.5rem"          // Custom button border radius
  buttonBackgroundColor="#9333ea" // Custom button color (overrides accentColor)
/>
```

### Theme Options

- **displayMode**: `'light'`, `'dark'`, or `'system'` (follows OS preference)
- **accentColor**: Hex color for spinner, borders, and other accent elements
- **buttonBackgroundColor**: Hex color specifically for the button (if not provided, uses `accentColor`)
- **buttonText**: Customize button text to match your use case
- **buttonRadius**: Adjust button roundness with any CSS border-radius value

## Backend Integration

The component uses x402 protocol for automatic price discovery:

1. **Price Discovery** (on load): Sends order data without payment to get the amount
2. **Payment** (when user clicks Pay): Sends signed payment authorization

Your Go middleware handles both requests automatically. See [backend implementation guide](https://github.com/mvpoyatt/sign-pay/tree/main/server/go).

## Supported Tokens

Any ERC-3009 token (tokens with `transferWithAuthorization`):
- USDC (all supported networks)
- EURC
- Other ERC-3009 compliant tokens

The component automatically validates token compatibility before allowing payment.

## Supported Networks

- Ethereum Mainnet (1) & Sepolia (11155111)
- Base Mainnet (8453) & Sepolia (84532)
- Optimism Mainnet (10) & Sepolia (11155420)
- Arbitrum Mainnet (42161) & Sepolia (421614)
- Polygon Mainnet (137) & Amoy (80002)
- Avalanche C-Chain (43114) & Fuji (43113)

## Complete Example

See the [Next.js example](../../../examples/react-nextjs/) for a full e-commerce implementation with dynamic pricing and order processing.

## License

MIT
