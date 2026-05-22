package phoenixd

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/getAlby/hub/events"
	"github.com/getAlby/hub/logger"
	"github.com/getAlby/hub/tests"
)

func TestPhoenixInvoiceToTransactionFallsBackWithoutBolt11(t *testing.T) {
	logger.Init("debug")

	completedAt := time.Now().UnixMilli()
	createdAt := time.Now().Add(-time.Minute).UnixMilli()

	transaction, err := phoenixInvoiceToTransaction(&InvoiceResponse{
		PaymentHash: "payment-hash",
		Preimage:    "preimage",
		Description: "BOLT12 incoming payment",
		Invoice:     "",
		ReceivedSat: 42,
		FeesSat:     1,
		CreatedAt:   createdAt,
		CompletedAt: completedAt,
	})
	require.NoError(t, err)

	assert.Equal(t, int64(42_000), transaction.AmountMsat)
	assert.Equal(t, int64(1_000), transaction.FeesPaidMsat)
	assert.Equal(t, "BOLT12 incoming payment", transaction.Description)
	assert.Nil(t, transaction.ExpiresAt)
	require.NotNil(t, transaction.SettledAt)
	assert.Equal(t, time.UnixMilli(completedAt).Unix(), *transaction.SettledAt)
}

func TestSyncIncomingPaymentsPublishesReceivedEvents(t *testing.T) {
	logger.Init("debug")

	eventPublisher := events.NewEventPublisher()
	mockConsumer := tests.NewMockEventConsumer()
	eventPublisher.RegisterSubscriber(mockConsumer)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/payments/incoming":
			assert.Equal(t, "Basic "+base64.StdEncoding.EncodeToString([]byte(":secret")), r.Header.Get("Authorization"))
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[
				{
					"paymentHash": "hash-1",
					"preimage": "preimage-1",
					"description": "Offer payment",
					"invoice": "",
					"isPaid": true,
					"receivedSat": 21,
					"fees": 0,
					"completedAt": 1710000001000,
					"createdAt": 1710000000000
				}
			]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	svc := &PhoenixService{
		ctx:            context.Background(),
		Address:        server.URL,
		Authorization:  base64.StdEncoding.EncodeToString([]byte(":secret")),
		eventPublisher: eventPublisher,
		syncFromMs:     1709999999000,
	}

	err := svc.syncIncomingPayments(context.Background())
	require.NoError(t, err)

	consumedEvents := mockConsumer.GetConsumedEvents()
	require.Len(t, consumedEvents, 1)
	assert.Equal(t, "nwc_lnclient_payment_received", consumedEvents[0].Event)
	assert.GreaterOrEqual(t, svc.getSyncFromMs(), int64(1709999999000))
}
