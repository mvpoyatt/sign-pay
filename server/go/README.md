# Sign-Pay Go Middleware

x402-compatible Gin middleware for signature-based crypto payments.

## Installation

```bash
go get github.com/mvpoyatt/sign-pay/server/go
```

## Quick Start

### Basic API Payment

```go
import (
  signpay "github.com/mvpoyatt/sign-pay/server/go"
  "github.com/gin-gonic/gin"
)

r.GET("/premium-content",
  signpay.SignPayMiddleware(
    84532,                                         // Chain ID
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Token address (USDC)
    "1000000",                                     // Amount (1 USDC = 6 decimals)
    "0xYourRecipientAddress",                      // Recipient
    "https://x402.org/facilitator",                // Facilitator URL
  ),
  func(c *gin.Context) {
    // Payment verified & settled - serve the resource
    c.JSON(200, gin.H{"data": "premium content"})
  },
)
```

Clients send `X-PAYMENT` header, middleware settles payment, handler returns the resource. Standard x402 flow.

## Use Cases

### 1. Simple API Payments

Fixed-price content or API access. Agent-friendly.

```go
r.GET("/api/joke",
  signpay.SignPayMiddleware(
    chainId,          // Chain ID
    tokenAddr,        // Token address
    "5000000",        // Amount (0.05 USDC = 6 decimals)
    recipient,        // Recipient
    facilitatorURL,   // Facilitator URL
  ),
  func(c *gin.Context) {
    c.JSON(200, gin.H{"joke": "Why do programmers prefer dark mode?"})
  },
)
```

### 2. E-Commerce with Dynamic Pricing

Calculate prices from order data, validate before charging.

```go
r.POST("/api/purchase",
  validateOrder,        // 1. Validate order data (BEFORE payment)
  calculateOrderTotal,  // 2. Calculate dynamic amount (sets context)
  signpay.SignPayMiddleware(
    chainId,            // Chain ID
    tokenAddr,          // Token address
    "",                 // Amount (empty = use dynamic from context)
    recipient,          // Recipient
    facilitatorURL,     // Facilitator URL
  ),
  fulfillOrder,         // 3. Process order (AFTER payment settled)
)
```

See [Middleware Flow Best Practices](#middleware-flow-best-practices) below for implementation details.

## Configuration Options

### WithAPIKey

Add facilitator authentication:

```go
signpay.SignPayMiddleware(
  chainId, tokenAddress, amount, recipient, facilitatorURL,
  signpay.WithAPIKey("your-api-key"),
)
```

### WithResource

Set explicit resource URL for x402 compatibility:

```go
signpay.SignPayMiddleware(
  chainId, tokenAddress, amount, recipient, facilitatorURL,
  signpay.WithResource("https://api.example.com/resource"),
)
```

If not provided, resource URL is auto-constructed from the request.

## Accessing Payment Data

The middleware stores verified payment information in the Gin context:

```go
func handler(c *gin.Context) {
  data := signpay.GetPaymentData(c)

  txHash := data.SettleResponse.Transaction

  // Parse order data if present
  var order Order
  if err := data.UnmarshalOrderData(&order); err != nil {
    c.JSON(400, gin.H{"error": "Invalid order data"})
    return
  }

  // Process with confirmed payment
  fulfillOrder(order, txHash)
}
```

## Middleware Flow Best Practices

### Critical: Payment Timing

**The middleware settles payment (takes money) BEFORE your handler runs.**

This means validation and pricing logic must run in **preceding middleware**, not in your handler:

```go
// ✅ CORRECT: Validate → Calculate → Charge → Process
r.POST("/purchase",
  validateOrder,        // Abort if invalid (no payment taken)
  calculatePrice,       // Set dynamic amount
  signpay.SignPayMiddleware(...),  // Charge (only if validation passed)
  processOrder,         // Process (payment already confirmed)
)

// ❌ WRONG: Charge → Validate (too late, money already taken)
r.POST("/purchase",
  signpay.SignPayMiddleware(...),  // Charges immediately
  func(c *gin.Context) {
    if !isValid(order) {  // Too late! Already charged customer
      return
    }
  },
)
```

### Example: Order Validation Middleware

```go
func validateOrder(c *gin.Context) {
  var order struct {
    CustomerEmail string      `json:"customerEmail"`
    Items         []OrderItem `json:"items"`
  }

  // Read and restore body for next middleware
  bodyBytes, _ := io.ReadAll(c.Request.Body)
  c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
  json.Unmarshal(bodyBytes, &order)

  // Validate before payment
  if order.CustomerEmail == "" {
    c.AbortWithStatusJSON(400, gin.H{"error": "Email required"})
    return
  }

  if len(order.Items) == 0 {
    c.AbortWithStatusJSON(400, gin.H{"error": "No items"})
    return
  }

  // Check inventory, business rules, etc.
  for _, item := range order.Items {
    if !isInStock(item.ProductCode) {
      c.AbortWithStatusJSON(400, gin.H{"error": "Item out of stock"})
      return
    }
  }

  c.Next()  // Continue to price calculation
}
```

### Example: Dynamic Pricing Middleware

```go
func calculateOrderTotal(c *gin.Context) {
  var order Order

  // Read and restore body
  bodyBytes, _ := io.ReadAll(c.Request.Body)
  c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
  json.Unmarshal(bodyBytes, &order)

  // Calculate total in smallest token units (USDC = 6 decimals)
  var total int64
  for _, item := range order.Items {
    price := prices[item.ProductCode]  // Your pricing logic
    total += price * int64(item.Quantity)
  }

  // Set dynamic amount for SignPayMiddleware
  c.Set("signpay:amount", fmt.Sprintf("%d", total))
  c.Next()
}
```

**Note**: If `signpay:amount` is set in the context, it overrides the amount parameter. Pass empty string `""` as the amount parameter when using dynamic pricing middleware.

### Example: Order Processing Handler

```go
func processOrder(c *gin.Context) {
  // Get verified payment data
  data := signpay.GetPaymentData(c)

  // Parse order from request body
  var order Order
  if err := data.UnmarshalOrderData(&order); err != nil {
    c.JSON(400, gin.H{"error": "Invalid order data"})
    return
  }

  // Process with payment confirmation
  log.Printf("Processing order for %s", order.CustomerEmail)
  log.Printf("Transaction: %s", data.SettleResponse.Transaction)

  // Save to database, send email, update inventory, etc.

  c.JSON(200, gin.H{
    "success":     true,
    "transaction": data.SettleResponse.Transaction,
  })
}
```

## CORS Configuration

If your frontend is on a different origin:

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

The middleware uses x402-compatible facilitators to verify signatures and execute transactions:

- Public Coinbase facilitator: `https://x402.org/facilitator`
- Any x402-compatible facilitator

Note: This package supports more chains than most facilitators. Verify chain support with your facilitator.

## Supported Networks

- Ethereum Mainnet (1) & Sepolia (11155111)
- Base Mainnet (8453) & Sepolia (84532)
- Optimism Mainnet (10) & Sepolia (11155420)
- Arbitrum Mainnet (42161) & Sepolia (421614)
- Polygon Mainnet (137) & Amoy (80002)
- Avalanche C-Chain (43114) & Fuji (43113)

Supports any ERC-3009 compatible token on these networks.

## Error Handling

Standard HTTP status codes:

- `402 Payment Required` - Payment verification failed or insufficient funds
- `400 Bad Request` - Invalid payment payload or missing X-PAYMENT header
- `500 Internal Server Error` - Facilitator communication error

Error responses include JSON details:

```json
{
  "error": "Payment verification failed: insufficient_funds"
}
```

## Complete Example

See the [Gin example](../../examples/go-gin/) for a working e-commerce server with validation, dynamic pricing, and order processing.

## License

MIT
