const supabase = require('../../config/supabase');

async function createTopupOrder(userId, tokenAmount, price, orderId) {
    const { data, error } = await supabase
        .from(this.topupOrdersTable)
        .insert({
            user_id: userId,
            token_amount: tokenAmount,
            price: price,
            status: 'pending',
            midtrans_order_id: orderId,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function activateTopup(orderId, transactionId, paymentMethod) {
    // 1. Get the topup order
    const { data: order, error: fetchErr } = await supabase
        .from(this.topupOrdersTable)
        .select('*')
        .eq('midtrans_order_id', orderId)
        .single();
    if (fetchErr) throw fetchErr;
    if (!order) throw new Error(`Topup order not found for: ${orderId}`);

    // 2. Update order to paid
    const { error: updateErr } = await supabase
        .from(this.topupOrdersTable)
        .update({
            status: 'paid',
            midtrans_transaction_id: transactionId,
            payment_method: paymentMethod,
        })
        .eq('id', order.id);
    if (updateErr) throw updateErr;

    // 3. Credit tokens
    await this.creditTokens(
        order.user_id,
        order.token_amount,
        'topup',
        `Top-up ${order.token_amount} token`,
        orderId
    );

    return order;
}

async function expireTopup(orderId) {
    const { error } = await supabase
        .from(this.topupOrdersTable)
        .update({ status: 'expired' })
        .eq('midtrans_order_id', orderId);
    if (error) throw error;
}

module.exports = {
    createTopupOrder,
    activateTopup,
    expireTopup
};
