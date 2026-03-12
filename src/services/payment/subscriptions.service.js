const supabase = require('../../config/supabase');

async function getActiveSubscription(userId) {
    const { data, error } = await supabase
        .from(this.subscriptionsTable)
        .select('*, packages(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .single();
    if (error && error.code !== 'PGRST116') return null; // PGRST116 = no rows
    return data;
}

async function createSubscription(userId, packageId, orderId) {
    const { data, error } = await supabase
        .from(this.subscriptionsTable)
        .insert({
            user_id: userId,
            package_id: packageId,
            status: 'pending',
            midtrans_order_id: orderId,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function activateSubscription(orderId, transactionId, paymentMethod) {
    // 1. Get the pending subscription
    const { data: sub, error: fetchErr } = await supabase
        .from(this.subscriptionsTable)
        .select('*, packages(*)')
        .eq('midtrans_order_id', orderId)
        .single();
    if (fetchErr) throw fetchErr;
    if (!sub) throw new Error(`Subscription not found for order: ${orderId}`);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (sub.packages.duration_days * 24 * 60 * 60 * 1000));

    // 2. Update subscription to active
    const { error: updateErr } = await supabase
        .from(this.subscriptionsTable)
        .update({
            status: 'active',
            started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            midtrans_transaction_id: transactionId,
            payment_method: paymentMethod,
        })
        .eq('id', sub.id);
    if (updateErr) throw updateErr;

    // 3. Credit tokens
    await this.creditTokens(
        sub.user_id,
        sub.packages.token_amount,
        'subscription',
        `Paket ${sub.packages.display_name}`,
        orderId
    );

    // 4. Expire old active subscriptions (except this one)
    await supabase
        .from(this.subscriptionsTable)
        .update({ status: 'expired' })
        .eq('user_id', sub.user_id)
        .eq('status', 'active')
        .neq('id', sub.id);

    return { ...sub, status: 'active', expires_at: expiresAt.toISOString() };
}

async function expireSubscription(orderId) {
    const { error } = await supabase
        .from(this.subscriptionsTable)
        .update({ status: 'expired' })
        .eq('midtrans_order_id', orderId);
    if (error) throw error;
}

async function checkAndExpireSubscriptions() {
    const now = new Date().toISOString();
    const { data: expired, error } = await supabase
        .from(this.subscriptionsTable)
        .update({ status: 'expired' })
        .eq('status', 'active')
        .lt('expires_at', now)
        .select('user_id, midtrans_order_id, packages(display_name)');

    if (error) {
        console.error('[PaymentService] Expiry check error:', error.message);
        return [];
    }

    if (expired && expired.length > 0) {
        console.log(`[PaymentService] Expired ${expired.length} subscription(s)`);
    }
    return expired || [];
}

module.exports = {
    getActiveSubscription,
    createSubscription,
    activateSubscription,
    expireSubscription,
    checkAndExpireSubscriptions
};
