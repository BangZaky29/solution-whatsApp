const paymentService = require('../../services/payment/payment.service');
const notificationService = require('../../services/payment/notification.service');
const midtransService = require('../../services/payment/midtrans.service');
const supabase = require('../../config/supabase');

const webhook = async (req, res) => {
    try {
        const notification = req.body;

        // Log full body for debugging production issues
        console.log(`\n?? [Webhook] Full Payload:`, JSON.stringify(notification, null, 2));

        const {
            order_id,
            transaction_status,
            fraud_status,
            transaction_id,
            payment_type
        } = notification;

        console.log(`\n?? ============================================`);
        console.log(`?? [Midtrans Webhook] Order: ${order_id}`);
        console.log(`?? Status: ${transaction_status} | Fraud: ${fraud_status}`);
        console.log(`?? ============================================\n`);

        // Handle Midtrans Test Pings / Connection Tests
        // These often lack order_id or use dummy data that fails signature check
        if (!order_id || (notification.status_message && notification.status_message.toLowerCase().includes('test'))) {
            console.log(`?? [Webhook] Acknowledging test notification/ping.`);
            return res.status(200).json({ success: true, message: 'Test notification received' });
        }

        // Verify signature
        if (!midtransService.verifySignature(notification)) {
            console.error('? [Webhook] Invalid signature!');
            // Return 200 even on invalid signature to satisfy Midtrans,
            // but don't process the order.
            return res.status(200).json({ success: false, error: 'Invalid signature' });
        }

        const isSubscription = order_id && order_id.startsWith('SUB-');
        const isTopup = order_id && order_id.startsWith('TOP-');

        // Handle specific GoPay Account Linking or Recurring notifications if they don't have our order_id format
        if (!isSubscription && !isTopup) {
            console.log(`?? [Webhook] Non-standard notification received:`, JSON.stringify(notification));
            // Just acknowledge to Midtrans
            return res.status(200).json({ success: true, message: 'Notification received' });
        }

        // Handle based on transaction status
        if (transaction_status === 'capture' || transaction_status === 'settlement') {
            if (fraud_status && fraud_status !== 'accept') {
                console.warn(`?? [Webhook] Fraud detected for ${order_id}`);
                return res.status(200).json({ success: true });
            }

            // Item #7: Idempotency  skip if already processed
            if (isSubscription) {
                const { data: existingSub } = await supabase
                    .from('subscriptions')
                    .select('status')
                    .eq('midtrans_order_id', order_id)
                    .single();
                if (existingSub && existingSub.status === 'active') {
                    console.log(`? [Webhook] Order ${order_id} already active. Skipping.`);
                    return res.status(200).json({ success: true });
                }
            }
            if (isTopup) {
                const { data: existingOrder } = await supabase
                    .from('topup_orders')
                    .select('status')
                    .eq('midtrans_order_id', order_id)
                    .single();
                if (existingOrder && existingOrder.status === 'paid') {
                    console.log(`? [Webhook] Order ${order_id} already paid. Skipping.`);
                    return res.status(200).json({ success: true });
                }
            }

            if (isSubscription) {
                const sub = await paymentService.activateSubscription(order_id, transaction_id, payment_type);

                // Get user for notification
                const { data: user } = await supabase
                    .from('users')
                    .select('phone, full_name, username')
                    .eq('id', sub.user_id)
                    .single();

                if (user?.phone) {
                    await notificationService.notifyPaymentSuccess(
                        user.phone,
                        user.full_name || user.username || 'User',
                        sub.packages.display_name,
                        sub.packages.token_amount,
                        sub.expires_at
                    );
                }
            } else if (isTopup) {
                const order = await paymentService.activateTopup(order_id, transaction_id, payment_type);

                // Get user & balance for notification
                const { data: user } = await supabase
                    .from('users')
                    .select('phone, full_name, username')
                    .eq('id', order.user_id)
                    .single();

                if (user?.phone) {
                    const balance = await paymentService.getTokenBalance(order.user_id);
                    await notificationService.notifyTopupSuccess(
                        user.phone,
                        user.full_name || user.username || 'User',
                        order.token_amount,
                        balance.balance
                    );
                }
            }
        } else if (transaction_status === 'deny' || transaction_status === 'cancel') {
            if (isSubscription) {
                await paymentService.expireSubscription(order_id);

                // Get user for notification
                const { data: sub } = await supabase
                    .from('subscriptions')
                    .select('user_id, packages(display_name)')
                    .eq('midtrans_order_id', order_id)
                    .single();

                if (sub) {
                    const { data: user } = await supabase
                        .from('users')
                        .select('phone, full_name, username')
                        .eq('id', sub.user_id)
                        .single();

                    if (user?.phone) {
                        await notificationService.notifyPaymentFailed(
                            user.phone,
                            user.full_name || user.username || 'User',
                            sub.packages?.display_name || 'Unknown'
                        );
                    }
                }
            } else if (isTopup) {
                await paymentService.expireTopup(order_id);
            }
        } else if (transaction_status === 'expire' || transaction_status === 'failure') {
            if (isSubscription) await paymentService.expireSubscription(order_id);
            if (isTopup) await paymentService.expireTopup(order_id);
        } else if (payment_type === 'recurring' || notification.recurring) {
            console.log(`?? [Webhook] Recurring payment notification for ${order_id}: ${transaction_status}`);
            // Core logic for recurring is usually handled by 'settlement' above
        } else {
            console.log(`?? [Webhook] Unhandled status: ${transaction_status} for ${order_id}`);
        }
        // 'pending'  no action needed, subscription already in pending state

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('? [Webhook] Processing error:', error.message);
        // Always return 200 to Midtrans to prevent retries on our errors
        res.status(200).json({ success: false, error: error.message });
    }
};

module.exports = { webhook };

