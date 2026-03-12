function buildSubscriptionPayload(orderId, packageData, userData, frontendUrl) {
    return {
        transaction_details: {
            order_id: orderId,
            gross_amount: packageData.price,
        },
        item_details: [
            {
                id: packageData.id,
                price: packageData.price,
                quantity: 1,
                name: `Paket ${packageData.display_name} - ${packageData.token_amount} Token`,
            },
        ],
        customer_details: {
            first_name: userData.full_name || userData.username || 'User',
            phone: userData.phone || '',
            email: userData.email || '',
        },
        callbacks: {
            finish: `${frontendUrl}/billing?status=finish`,
            error: `${frontendUrl}/billing?status=error`,
            pending: `${frontendUrl}/billing?status=pending`,
        },
    };
}

function buildTopupPayload(orderId, tokenAmount, price, userData, frontendUrl) {
    return {
        transaction_details: {
            order_id: orderId,
            gross_amount: price,
        },
        item_details: [
            {
                id: `topup-${tokenAmount}`,
                price: price,
                quantity: 1,
                name: `Top-up ${tokenAmount} Token`,
            },
        ],
        customer_details: {
            first_name: userData.full_name || userData.username || 'User',
            phone: userData.phone || '',
            email: userData.email || '',
        },
        callbacks: {
            finish: `${frontendUrl}/billing?status=finish`,
            error: `${frontendUrl}/billing?status=error`,
            pending: `${frontendUrl}/billing?status=pending`,
        },
    };
}

module.exports = {
    buildSubscriptionPayload,
    buildTopupPayload
};