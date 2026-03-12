async function getTransactionStatus({ coreApiUrl, authHeader, orderId }) {
    try {
        const response = await fetch(`${coreApiUrl}/${orderId}/status`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': authHeader,
            },
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('âŒ [MidtransService] Status check failed:', error.message);
        throw error;
    }
}

module.exports = {
    getTransactionStatus
};
