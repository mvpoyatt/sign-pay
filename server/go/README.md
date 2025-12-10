# Sign-Pay Go Middleware

Gin middleware for signature-based crypto payments.

## Installation

```bash
go get github.com/mvpoyatt/sign-pay/server/go
```

## Usage

```go
package main

import (
  signpay "github.com/mvpoyatt/sign-pay/server/go"
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

The middleware stores payment information in the Gin context. Use the `GetPaymentData` helper for clean access:

```go
data := signpay.GetPaymentData(c)

txHash := data.SettleResponse.Transaction
```

### Handling Order Data

The request body from your frontend is available in `PaymentData.RequestBody`. Use the `UnmarshalOrderData` method to parse it:

```go
r.POST("/api/purchase",
  signpay.SignPayMiddleware(
    84532,
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "1000000",
    "0xYourRecipientAddress",
    "https://x402.org/facilitator",
  ),
  func(c *gin.Context) {
    // Get verified payment data
    data := signpay.GetPaymentData(c)

    // Define your order structure
    type OrderItem struct {
      ProductCode string `json:"productCode"`
      ProductName string `json:"productName"`
      Quantity    int    `json:"quantity"`
      Size        string `json:"size"`
    }

    var order struct {
      CustomerEmail string      `json:"customerEmail"`
      Items         []OrderItem `json:"items"`
    }

    // Parse the order data from the request body
    if err := data.UnmarshalOrderData(&order); err != nil {
      c.JSON(400, gin.H{"error": "Invalid order data"})
      return
    }

    // Process the order with payment confirmation
    log.Printf("Processing order for %s", order.CustomerEmail)
    log.Printf("Transaction: %s", data.SettleResponse.Transaction)

    for _, item := range order.Items {
      log.Printf("Item: %s (%s) - Qty: %d, Size: %s",
        item.ProductName, item.ProductCode, item.Quantity, item.Size)
    }

    c.JSON(200, gin.H{
      "success":     true,
      "transaction": data.SettleResponse.Transaction,
    })
  },
)
```

The order data structure is completely flexible - define whatever fields match your frontend's `orderData` prop.

## Dynamic Pricing

For dynamic pricing based on order contents, use middleware to calculate and set the amount:

```go
// Middleware to calculate order total
func calculateOrderTotal(c *gin.Context) {
  var order struct {
    Items []OrderItem `json:"items"`
  }

  bodyBytes, _ := io.ReadAll(c.Request.Body)
  c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
  json.Unmarshal(bodyBytes, &order)

  // Calculate total in smallest token units (e.g., USDC has 6 decimals)
  var total int64
  for _, item := range order.Items {
    // Your pricing logic here
    total += calculateItemPrice(item)
  }

  c.Set("signpay:amount", fmt.Sprintf("%d", total))
  c.Next()
}

r.POST("/api/purchase",
  calculateOrderTotal,                    // Set dynamic amount
  signpay.SignPayMiddleware(             // Uses dynamic amount from context
    chainId, tokenAddr, "", recipient, facilitatorURL,
  ),
  processOrder,                           // Process after payment settled
)
```

**Note**: Amounts must be in smallest token units. For USD conversion, you can implement logic in the calculate middleware.

## ⚠️ Important: Order Validation Best Practice

**Critical**: The middleware settles payment (takes money) **BEFORE** your handler runs. This means:

- ✅ **Good**: Validation middleware runs → Payment settled → Handler processes order
- ❌ **Bad**: Payment settled → Handler validates (too late, money already taken)

**Best Practice**: Always validate your order data in middleware **BEFORE** `SignPayMiddleware`:

```go
// Validation middleware (runs BEFORE payment)
func validateOrder(c *gin.Context) {
  var order struct {
    CustomerEmail string      `json:"customerEmail"`
    Items         []OrderItem `json:"items"`
  }

  bodyBytes, _ := io.ReadAll(c.Request.Body)
  c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

  if err := json.Unmarshal(bodyBytes, &order); err != nil {
    c.AbortWithStatusJSON(400, gin.H{"error": "Invalid JSON"})
    return
  }

  // Validate required fields
  if order.CustomerEmail == "" {
    c.AbortWithStatusJSON(400, gin.H{"error": "Customer email required"})
    return
  }

  if len(order.Items) == 0 {
    c.AbortWithStatusJSON(400, gin.H{"error": "No items in order"})
    return
  }

  // Validate business logic (inventory, etc.)
  for _, item := range order.Items {
    if !isInStock(item.ProductCode) {
      c.AbortWithStatusJSON(400, gin.H{"error": "Item out of stock"})
      return
    }
  }

  c.Next()
}

// Recommended middleware chain
r.POST("/api/purchase",
  validateOrder,       // 1. Validate FIRST (abort if invalid, no payment taken)
  calculatePrice,      // 2. Calculate price (only if validation passed)
  signpay.SignPayMiddleware(...),  // 3. Settle payment (only if valid order)
  processOrder,        // 4. Process order (payment already confirmed)
)
```

This ensures you never take payment for invalid orders. If validation fails, the request aborts before any blockchain transaction occurs.

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

See the [Gin example](../../examples/go-gin/) for a complete working server.

## License

MIT
