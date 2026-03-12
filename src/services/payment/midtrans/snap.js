async function createSnapTransaction({
    baseUrl,
    authHeader,
    payload,
    isDevelopment,
    serverKey
}) {
    try {
        if (!serverKey) {
            if (isDevelopment) {
                console.log('ðŸ§ª [MidtransService] Mocking transaction for development (No Server Key)');
                return {
                    token: `mock-snap-token-${Date.now()}`,
                    redirect_url: `https://app.sandbox.midtrans.com/snap/v1/transactions/mock-redirect-${Date.now()}`,
                    is_mock: true
                };
            }
            throw new Error('Midtrans Server Key is missing');
        }

        const response = await fetch(`${baseUrl}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('âŒ [MidtransService] Snap API Error:', data);
            throw new Error(data.error_messages?.join(', ') || 'Midtrans API error');
        }

        console.log(`âœ… [MidtransService] Snap token created for order: ${payload.transaction_details.order_id}`);
        return {
            token: data.token,
            redirect_url: data.redirect_url,
        };
    } catch (error) {
        console.error('âŒ [MidtransService] Transaction creation failed:', error.message);
        throw error;
    }
}

module.exports = {
    createSnapTransaction
};
