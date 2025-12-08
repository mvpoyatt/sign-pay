package signpay

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

// debugFacilitatorError makes a direct HTTP call to get detailed error info
func debugFacilitatorError(facilitatorURL string, payload *types.PaymentPayload, requirements *types.PaymentRequirements, apiKey string) {
	type verifyRequest struct {
		PaymentPayload      *types.PaymentPayload      `json:"paymentPayload"`
		PaymentRequirements *types.PaymentRequirements `json:"paymentRequirements"`
	}

	reqBody := verifyRequest{
		PaymentPayload:      payload,
		PaymentRequirements: requirements,
	}

	reqJSON, _ := json.Marshal(reqBody)

	req, err := http.NewRequest("POST", facilitatorURL+"/verify", bytes.NewBuffer(reqJSON))
	if err != nil {
		return
	}

	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	fmt.Printf("[SignPay] Facilitator response: status=%d, body=%s\n", resp.StatusCode, string(bodyBytes))
}

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

// Options contains configuration for the payment middleware
type Options struct {
	APIKey string
}

// Option is a functional option for configuring the middleware
type Option func(*Options)

// WithAPIKey sets the API key for facilitator authentication
func WithAPIKey(apiKey string) Option {
	return func(o *Options) {
		o.APIKey = apiKey
	}
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
		// Build resource URL from request
		scheme := "http"
		if c.Request.TLS != nil {
			scheme = "https"
		}
		resourceURL := fmt.Sprintf("%s://%s%s", scheme, c.Request.Host, c.Request.URL.Path)

		paymentRequirements := &types.PaymentRequirements{
			Scheme:            "exact",
			Network:           network,
			MaxAmountRequired: tokenAmount,
			Resource:          resourceURL,
			Description:       "Payment for purchase",
			PayTo:             recipientAddress,
			Asset:             tokenAddress,
			MaxTimeoutSeconds: 300, // 5 minutes default timeout
			Extra:             nil,
		}

		payment := c.GetHeader("X-Payment")
		if payment == "" {
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error": "X-Payment header is required",
			})
			return
		}

		paymentPayload, err := types.DecodePaymentPayloadFromBase64(payment)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error": "Invalid payment payload: " + err.Error(),
			})
			return
		}
		paymentPayload.X402Version = x402Version

		// Verify payment
		verifyResponse, err := facilitatorClient.Verify(paymentPayload, paymentRequirements)
		if err != nil {
			// Try to get more details by making a direct HTTP call
			debugFacilitatorError(facilitatorURL, paymentPayload, paymentRequirements, options.APIKey)

			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": "Payment verification failed: " + err.Error(),
			})
			return
		}

		if !verifyResponse.IsValid {
			reason := "unknown reason"
			if verifyResponse.InvalidReason != nil {
				reason = *verifyResponse.InvalidReason
			}
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error": "Payment verification failed: " + reason,
			})
			return
		}

		// Settle payment
		settleResponse, err := facilitatorClient.Settle(paymentPayload, paymentRequirements)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": "Payment settlement failed: " + err.Error(),
			})
			return
		}

		if !settleResponse.Success {
			errorReason := "Settlement was not successful"
			if settleResponse.ErrorReason != nil {
				errorReason = *settleResponse.ErrorReason
			}
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error": "Payment settlement failed: " + errorReason,
			})
			return
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
