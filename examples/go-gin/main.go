package main

import (
	signpay "github.com/mvpoyatt/sign-pay/server/go"

	"github.com/gin-gonic/gin"
)

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

	// Example: POST endpoint with signature-based payment middleware
	// Frontend would send payment signature in X-Payment header
	// and order data in request body
	r.POST(
		"/api/purchase",
		signpay.SignPayMiddleware(
			84532, // Chain ID (Base Sepolia testnet)
			"0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
			"19990000", // 19.99 USDC (6 decimals)
			"0xB8E124eaA317761CF8E4C63EB445fA3d21deD759", // Your recipient address
			"https://x402.org/facilitator",               // Facilitator URL
		),
		func(c *gin.Context) {
			// Retrieve payment data from context
			paymentData, exists := c.Get(signpay.PaymentDataKey)
			if !exists {
				c.JSON(500, gin.H{"error": "Payment data not found"})
				return
			}

			// Access the order data sent from frontend
			data := paymentData.(*signpay.PaymentData)

			// Process the payment and order
			c.JSON(200, gin.H{
				"success": true,
				"message": "Payment verified and order processed",
				"tx_hash": data.SettleResponse.Transaction,
			})
		},
	)

	// Run the server on port 8080
	r.Run(":8080")
}
