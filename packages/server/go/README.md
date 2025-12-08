# Sign-Pay Go Middleware

Gin middleware for signature-based crypto payments.

## Installation

```bash
go get github.com/mvpoyatt/sign-pay
```

## Usage

```go
package main

import (
  signpay "github.com/mvpoyatt/sign-pay"
  "github.com/gin-gonic/gin"
)

func main() {
  r := gin.Default()

  r.POST("/api/purchase",
    signpay.SignPayMiddleware(
      84532,                                         // Chain ID
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Token address (USDC)
      "1000000",                                     // Amount (1 USDC with 6 decimals)
      "0xYourRecipientAddress",                      // Recipient
      "https://x402.org/facilitator",                // Facilitator URL
    ),
    func(c *gin.Context) {
      // Payment is verified and settled - process the order
      paymentData, _ := c.Get(signpay.PaymentDataKey)
      data := paymentData.(*signpay.PaymentData)

      log.Printf("Payment successful: tx=%s", data.SettleResponse.Transaction)

      c.JSON(200, gin.H{"success": true})
    },
  )

  r.Run(":8080")
}
```

## What It Does

The middleware intercepts requests and:

1. Extracts payment signature from `X-Payment` header
2. Verifies the signature is valid for the specified amount/recipient
3. Submits the transaction to the blockchain via facilitator
4. Stores payment data in Gin context
5. Calls your handler only if payment succeeds
6. Returns `402 Payment Required` if verification/settlement fails

## Configuration

### With API Key

If your facilitator requires authentication:

```go
signpay.SignPayMiddleware(
  chainId,
  tokenAddress,
  amount,
  recipient,
  facilitatorURL,
  signpay.WithAPIKey("your-api-key"),
)
```

### Accessing Payment Data

The middleware stores payment information in the Gin context:

```go
paymentData, _ := c.Get(signpay.PaymentDataKey)
data := paymentData.(*signpay.PaymentData)

txHash := data.SettleResponse.Transaction
```

## CORS Configuration

If your frontend is on a different origin, add CORS middleware:

```go
r.Use(func(c *gin.Context) {
  c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
  c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Payment")
  c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

  if c.Request.Method == "OPTIONS" {
    c.AbortWithStatus(204)
    return
  }

  c.Next()
})
```

## Facilitators

The middleware uses facilitators to verify signatures and execute transactions. You can:

- This package and the corresponding client package support more chains than most facilitators will support
- Use the public Coinbase facilitator: `https://x402.org/facilitator`
- Use any x402-compatible facilitator

## Supported Networks

- Ethereum Mainnet (1) & Sepolia (11155111)
- Base Mainnet (8453) & Sepolia (84532)
- Optimism Mainnet (10) & Sepolia (11155420)
- Arbitrum Mainnet (42161) & Sepolia (421614)
- Polygon Mainnet (137) & Amoy (80002)
- Avalanche C-Chain (43114) & Fuji (43113)

## Error Handling

The middleware returns standard HTTP status codes:

- `402 Payment Required` - Payment verification failed or insufficient funds
- `400 Bad Request` - Invalid payment payload or missing X-Payment header
- `500 Internal Server Error` - Facilitator communication error

Error responses include a JSON body with details:

```json
{
  "error": "Payment verification failed: insufficient_funds"
}
```

## Example

See the [Gin example](../../../examples/go-gin/) for a complete working server.

## License

MIT
