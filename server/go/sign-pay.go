package signpay

// Portions of this code are derived from Coinbase x402
// Copyright 2024 Coinbase, Inc.
// Licensed under Apache License 2.0
// Original source: https://github.com/coinbase/x402/blob/main/go/pkg/gin/middleware.go

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/coinbase/x402/go/pkg/facilitatorclient"
	"github.com/coinbase/x402/go/pkg/types"
	"github.com/gin-gonic/gin"
)

const x402Version = 1
const PaymentDataKey = "signPaymentData"

// Chain ID to network name mapping for supported chains
var chainIDToNetwork = map[int]string{
	1:        "ethereum",
	11155111: "sepolia",
	8453:     "base",
	84532:    "base-sepolia",
	10:       "optimism",
	11155420: "optimism-sepolia",
	42161:    "arbitrum",
	421614:   "arbitrum-sepolia",
	137:      "polygon",
	80002:    "polygon-amoy",
	43114:    "avalanche",
	43113:    "avalanche-fuji",
	59144:    "linea",
	59141:    "linea-sepolia",
	324:      "zksync",
	300:      "zksync-sepolia",
}

// PaymentData contains all verified payment information made available to handlers
type PaymentData struct {
	PaymentPayload      *types.PaymentPayload
	SettleResponse      *types.SettleResponse
	PaymentRequirements *types.PaymentRequirements
	VerifyResponse      *types.VerifyResponse
	RequestBody         json.RawMessage // Raw JSON from request body
}

// UnmarshalOrderData unmarshals the request body into the provided struct
func (p *PaymentData) UnmarshalOrderData(v interface{}) error {
	if len(p.RequestBody) == 0 {
		return nil
	}
	return json.Unmarshal(p.RequestBody, v)
}

// Options contains configuration for the payment middleware
type Options struct {
	APIKey   string
	Resource string
}

// Option is a functional option for configuring the middleware
type Option func(*Options)

// WithAPIKey sets the API key for facilitator authentication
func WithAPIKey(apiKey string) Option {
	return func(o *Options) {
		o.APIKey = apiKey
	}
}

// WithResource sets a custom resource URL for the payment requirements.
// If not provided, the resource URL is automatically constructed from the request.
func WithResource(resource string) Option {
	return func(o *Options) {
		o.Resource = resource
	}
}

// GetPaymentData retrieves verified payment data from the Gin context
func GetPaymentData(c *gin.Context) *PaymentData {
	data, _ := c.Get(PaymentDataKey)
	return data.(*PaymentData)
}

// SignPayMiddleware creates Gin middleware that handles signature-based payment verification and settlement.
// After successful payment verification and settlement, payment data is stored in the Gin context
// under the key "signPaymentData" and can be accessed via c.Get(signpay.PaymentDataKey).
// The request body is also captured and included in PaymentData.RequestBody.
//
// Parameters:
//   - chainId: The blockchain network chain ID (e.g., 8453 for Base, 84532 for Base Sepolia)
//   - tokenAddress: The ERC-3009 token contract address
//   - tokenAmount: The payment amount in smallest token units (e.g., "19990000" for 19.99 USDC with 6 decimals)
//   - recipientAddress: The recipient address for payments
//   - facilitatorURL: The URL of the x402 facilitator service
//   - opts: Optional configuration options (e.g., WithAPIKey for facilitator authentication)
func SignPayMiddleware(chainId int, tokenAddress string, tokenAmount string, recipientAddress string, facilitatorURL string, opts ...Option) gin.HandlerFunc {
	// Apply options
	options := &Options{}
	for _, opt := range opts {
		opt(options)
	}

	// Get network name from chain ID
	network, ok := chainIDToNetwork[chainId]
	if !ok {
		panic(fmt.Sprintf("unsupported chain ID: %d", chainId))
	}

	// Configure facilitator client
	facilitatorConfig := &types.FacilitatorConfig{
		URL: facilitatorURL,
	}

	// Add API key authentication if configured
	if options.APIKey != "" {
		apiKey := options.APIKey
		facilitatorConfig.CreateAuthHeaders = func() (map[string]map[string]string, error) {
			authHeader := map[string]string{
				"Authorization": "Bearer " + apiKey,
			}
			return map[string]map[string]string{
				"verify": authHeader,
				"settle": authHeader,
			}, nil
		}
	}

	facilitatorClient := facilitatorclient.NewFacilitatorClient(facilitatorConfig)

	return func(c *gin.Context) {
		// Read and preserve request body
		var requestBody json.RawMessage
		if c.Request.Body != nil {
			bodyBytes, err := io.ReadAll(c.Request.Body)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error": "Failed to read request body",
				})
				return
			}
			// Restore the body so it can be read again if needed
			c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

			if len(bodyBytes) > 0 {
				requestBody = json.RawMessage(bodyBytes)
			}
		}

		// Create payment requirements for verification
		// Determine resource URL (use provided or auto-construct)
		var resourceURL string
		if options.Resource != "" {
			resourceURL = options.Resource
		} else {
			// Auto-construct resource URL from request
			scheme := "http"
			if c.Request.TLS != nil {
				scheme = "https"
			}
			resourceURL = fmt.Sprintf("%s://%s%s", scheme, c.Request.Host, c.Request.URL.Path)
		}

		// Determine payment amount (context overrides configured amount)
		amount := tokenAmount
		if dynamicAmount, exists := c.Get("signpay:amount"); exists {
			amount = dynamicAmount.(string)
		}

		// Validate amount is configured
		if amount == "" {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       "Payment amount not configured. Set amount parameter or use c.Set(\"signpay:amount\", amount) in preceding middleware.",
				"x402Version": x402Version,
			})
			return
		}

		paymentRequirements := &types.PaymentRequirements{
			Scheme:            "exact",
			Network:           network,
			MaxAmountRequired: amount,
			Resource:          resourceURL,
			Description:       "Payment for purchase",
			PayTo:             recipientAddress,
			Asset:             tokenAddress,
			MaxTimeoutSeconds: 300, // 5 minutes default timeout
			Extra:             nil,
		}

		payment := c.GetHeader("X-PAYMENT")
		if payment == "" {
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error":       "X-PAYMENT header is required",
				"accepts":     []*types.PaymentRequirements{paymentRequirements},
				"x402Version": x402Version,
			})
			return
		}

		paymentPayload, err := types.DecodePaymentPayloadFromBase64(payment)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":       "Invalid payment payload: " + err.Error(),
				"x402Version": x402Version,
			})
			return
		}
		paymentPayload.X402Version = x402Version

		// Verify payment
		verifyResponse, err := facilitatorClient.Verify(paymentPayload, paymentRequirements)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       "Payment verification failed: " + err.Error(),
				"x402Version": x402Version,
			})
			return
		}

		if !verifyResponse.IsValid {
			reason := "unknown reason"
			if verifyResponse.InvalidReason != nil {
				reason = *verifyResponse.InvalidReason
			}
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error":       "Payment verification failed: " + reason,
				"accepts":     []*types.PaymentRequirements{paymentRequirements},
				"x402Version": x402Version,
			})
			return
		}

		// Settle payment
		settleResponse, err := facilitatorClient.Settle(paymentPayload, paymentRequirements)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       "Payment settlement failed: " + err.Error(),
				"x402Version": x402Version,
			})
			return
		}

		if !settleResponse.Success {
			errorReason := "Settlement was not successful"
			if settleResponse.ErrorReason != nil {
				errorReason = *settleResponse.ErrorReason
			}
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error":       "Payment settlement failed: " + errorReason,
				"accepts":     []*types.PaymentRequirements{paymentRequirements},
				"x402Version": x402Version,
			})
			return
		}

		// Add X-PAYMENT-RESPONSE header
		settleResponseHeader, err := settleResponse.EncodeToBase64String()
		if err == nil {
			c.Header("X-PAYMENT-RESPONSE", settleResponseHeader)
		}

		// Store payment data in context for handler access
		paymentData := &PaymentData{
			PaymentPayload:      paymentPayload,
			SettleResponse:      settleResponse,
			PaymentRequirements: paymentRequirements,
			VerifyResponse:      verifyResponse,
			RequestBody:         requestBody,
		}
		c.Set(PaymentDataKey, paymentData)

		// Continue to next handler
		c.Next()
	}
}
