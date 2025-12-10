package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	signpay "github.com/mvpoyatt/sign-pay/server/go"

	"github.com/gin-gonic/gin"
)

// Order data structures
type OrderItem struct {
	ProductCode string `json:"productCode"`
	ProductName string `json:"productName"`
	Quantity    int    `json:"quantity"`
	Size        string `json:"size"`
}

type Order struct {
	CustomerEmail string      `json:"customerEmail"`
	Items         []OrderItem `json:"items"`
}

// Product pricing in smallest token units (USDC has 6 decimals)
var prices = map[string]int64{
	"TSH-001":   99900,  // $9.99
	"JEANS-042": 199900, // $19.99
}

func main() {
	r := gin.Default() // Creates a Gin router with default middleware (logger and recovery)

	// Add CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Payment")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Define a GET route for health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy"})
	})

	// Example: POST endpoint with dynamic pricing and signature-based payment
	r.POST(
		"/api/purchase",
		calculateOrderTotal, // Calculate dynamic price from order
		signpay.SignPayMiddleware(
			84532, // Chain ID (Base Sepolia testnet)
			"0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
			"", // Empty string = use dynamic amount from context
			"0xB8E124eaA317761CF8E4C63EB445fA3d21deD759", // Your recipient address
			"https://x402.org/facilitator",               // Facilitator URL
		),
		processOrder, // Process order after payment verified
	)

	// Run the server on port 8080
	r.Run(":8080")
}

// Middleware to calculate dynamic order total
func calculateOrderTotal(c *gin.Context) {
	var order Order

	// Read and restore request body
	bodyBytes, _ := io.ReadAll(c.Request.Body)
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	json.Unmarshal(bodyBytes, &order)

	// Calculate total from items
	var total int64
	for _, item := range order.Items {
		price := prices[item.ProductCode]
		total += price * int64(item.Quantity)
	}

	// Set dynamic amount in context
	c.Set("signpay:amount", fmt.Sprintf("%d", total))
	c.Next()
}

// Handler to process order after payment verified
func processOrder(c *gin.Context) {
	// Get verified payment data
	data := signpay.GetPaymentData(c)

	var order Order

	// Parse the order data from request body
	if err := data.UnmarshalOrderData(&order); err != nil {
		c.JSON(400, gin.H{"error": "Invalid order data"})
		return
	}

	// Process the payment and order
	// In a real application, you would:
	// - Save order to database
	// - Send confirmation email to order.CustomerEmail
	// - Process each item in order.Items
	// - Update inventory, etc.

	c.JSON(200, gin.H{
		"success":       true,
		"message":       "Payment verified and order processed",
		"transaction":   data.SettleResponse.Transaction,
		"customerEmail": order.CustomerEmail,
		"itemCount":     len(order.Items),
	})
}
