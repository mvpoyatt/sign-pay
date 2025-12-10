# @sign-pay/react

React component for signature-based crypto payments.

## Installation

```bash
npm install @sign-pay/react
```

## Usage

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

      // Optional: custom headers (e.g., auth token)
      orderHeaders={{ 'Authorization': 'Bearer token' }}

      // Optional: UI customization
      buttonHeight={40}
      buttonWidth={160}
      displayMode="system"
      accentColor="#10b981"
    />
  );
}
```

## What It Does

1. Renders a "Pay with Crypto" button
2. Automatically discovers the price from your backend (x402 protocol)
3. Displays the price on the button
4. Checks if the token supports ERC-3009 (signature-based transfers)
5. Prompts the user to connect their wallet to the appropriate chain if not already connected
6. When user clicks "Pay", asks them to sign an authorization message (EIP-712)
7. POSTs to your `paymentEndpoint` with:
   - Payment signature in `X-PAYMENT` header
   - Your `orderData` in request body
   - Any custom `orderHeaders`

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

## Theming & Customization

The component supports light, dark, and system-based themes with customizable colors and button styling:

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

### Theming Options

- **displayMode**: Choose `'light'`, `'dark'`, or `'system'` (follows OS preference)
- **accentColor**: Hex color for spinner, borders, and other accent elements (default: '#338aea')
- **buttonBackgroundColor**: Hex color specifically for the button background. If not provided, uses `accentColor`
- **buttonText**: Customize the button text to match your use case
- **buttonRadius**: Adjust button roundness with any CSS border-radius value

## Backend Integration

The component uses x402 protocol for automatic price discovery:

1. **Price Discovery** (automatic on load): Sends order data without payment to get the amount
2. **Payment** (when user clicks Pay): Sends signed payment authorization

The Go middleware handles both requests automatically. See the [Go middleware README](https://github.com/mvpoyatt/sign-pay/tree/main/server/go) for implementation details.

## Supported Tokens

Any token implementing ERC-3009 (transferWithAuthorization), including:
- USDC (all supported networks)
- EURC
- Other ERC-3009 compliant tokens

The component automatically checks if a token supports ERC-3009 before allowing payment.

## Supported Networks

- Ethereum Mainnet (1) & Sepolia (11155111)
- Base Mainnet (8453) & Sepolia (84532)
- Optimism Mainnet (10) & Sepolia (11155420)
- Arbitrum Mainnet (42161) & Sepolia (421614)
- Polygon Mainnet (137) & Amoy (80002)
- Avalanche C-Chain (43114) & Fuji (43113)

## Example

See the [Next.js example](../../../examples/react-nextjs/) for a complete working implementation.

## License

MIT
