const paymentService = require('../services/payment/payment.service');
const midtransService = require('../services/payment/midtrans.service');
const notificationService = require('../services/payment/notification.service');
const supabase = require('../config/supabase');

/**
 * Payment Controller
 * Handles HTTP endpoints for packages, subscriptions, top-ups, and Midtrans webhook.
 */

// ═══════════════════════════════════════════
// PACKAGES
// ═══════════════════════════════════════════

const getPackages = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || req.headers['X-Session-Id'];
        const packages = await paymentService.getAllPackages(userId);
        res.json({ success: true, packages });
    } catch (error) {
        console.error('❌ [PaymentController] getPackages error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ═══════════════════════════════════════════
// SUBSCRIPTIONS
// ═══════════════════════════════════════════

const subscribe = async (req, res) => {
    try {
        const userId = req.userId;
        const { packageId } = req.body;

        if (!packageId) {
            return res.status(400).json({ success: false, error: 'packageId is required' });
        }

        // 1. Get package details
        const pkg = await paymentService.getPackageById(packageId, userId);
        if (!pkg) {
            return res.status(404).json({ success: false, error: 'Package not found' });
        }

        // Item #3: Check for existing pending subscription
        const { data: pendingSub } = await supabase
            .from('subscriptions')
            .select('midtrans_order_id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .eq('package_id', packageId)
            .limit(1)
            .maybeSingle();

        if (pendingSub) {
            // Return existing pending order's Snap token
            try {
                const existingStatus = await midtransService.getTransactionStatus(pendingSub.midtrans_order_id);
                if (existingStatus.status_code === '201') {
                    // Still pending at Midtrans — redirect to same payment
                    return res.json({
                        success: true,
                        orderId: pendingSub.midtrans_order_id,
                        redirectUrl: existingStatus.redirect_url || null,
                        message: 'Anda sudah memiliki pesanan menunggu pembayaran.',
                    });
                }
            } catch (e) {
                // If status check fails, expire old and create new
                await paymentService.expireSubscription(pendingSub.midtrans_order_id);
            }
        }

        // 2. Get user info for Midtrans
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        // 3. Generate order ID
        const orderId = `SUB-${userId.substring(0, 8)}-${Date.now()}`;

        // 4. Create Midtrans transaction
        const snapResult = await midtransService.createSubscriptionTransaction(orderId, pkg, user);

        // 5. Create pending subscription in DB
        await paymentService.createSubscription(userId, packageId, orderId);

        // 6. Notify user via WhatsApp
        if (user?.phone) {
            await notificationService.notifyPaymentPending(
                user.phone,
                user.full_name || user.username || 'User',
                pkg.display_name,
                orderId
            );
        }

        console.log(`💳 [PaymentController] Subscription order created: ${orderId} for user ${userId}`);

        res.json({
            success: true,
            orderId,
            snapToken: snapResult.token,
            redirectUrl: snapResult.redirect_url,
        });
    } catch (error) {
        console.error('❌ [PaymentController] subscribe error details:', {
            message: error.message,
            stack: error.stack,
            userId: req.userId
        });
        res.status(500).json({ success: false, error: error.message });
    }
};

const getMySubscription = async (req, res) => {
    try {
        const userId = req.userId;
        const subscription = await paymentService.getActiveSubscription(userId);
        const features = await paymentService.getUserFeatures(userId);

        res.json({
            success: true,
            subscription,
            features,
        });
    } catch (error) {
        console.error('❌ [PaymentController] getMySubscription error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ═══════════════════════════════════════════
// TOKEN
// ═══════════════════════════════════════════

const TOPUP_TIERS = [
    { token_amount: 1000, price: 15000 },
    { token_amount: 5000, price: 65000 },
    { token_amount: 10000, price: 120000 },
    { token_amount: 25000, price: 275000 },
];

const topup = async (req, res) => {
    try {
        const userId = req.userId;
        const { tokenAmount } = req.body;

        // 1. Validate tier
        const tier = TOPUP_TIERS.find(t => t.token_amount === tokenAmount);
        if (!tier) {
            return res.status(400).json({
                success: false,
                error: 'Invalid token amount. Choose: 1000, 5000, 10000, or 25000'
            });
        }

        // 2. Check active subscription (required for top-up)
        const activeSub = await paymentService.getActiveSubscription(userId);
        if (!activeSub) {
            return res.status(403).json({
                success: false,
                error: 'Anda harus memiliki paket aktif minimal Basic untuk melakukan top-up.'
            });
        }

        // 3. Get user info
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        // 4. Generate order ID
        const orderId = `TOP-${userId.substring(0, 8)}-${Date.now()}`;

        // 5. Create Midtrans transaction
        const snapResult = await midtransService.createTopupTransaction(
            orderId, tier.token_amount, tier.price, user
        );

        // 6. Create pending topup order
        await paymentService.createTopupOrder(userId, tier.token_amount, tier.price, orderId);

        console.log(`💳 [PaymentController] Topup order created: ${orderId} for ${tier.token_amount} token`);

        res.json({
            success: true,
            orderId,
            snapToken: snapResult.token,
            redirectUrl: snapResult.redirect_url,
        });
    } catch (error) {
        console.error('❌ [PaymentController] topup error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getMyTokens = async (req, res) => {
    try {
        const userId = req.userId;
        const balance = await paymentService.getTokenBalance(userId);
        const transactions = await paymentService.getTokenTransactions(userId, 30);

        res.json({
            success: true,
            balance: balance.balance,
            totalUsed: balance.total_used,
            transactions,
        });
    } catch (error) {
        console.error('❌ [PaymentController] getMyTokens error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getTopupTiers = async (req, res) => {
    res.json({ success: true, tiers: TOPUP_TIERS });
};

// ═══════════════════════════════════════════
// MIDTRANS WEBHOOK
// ═══════════════════════════════════════════

const webhook = async (req, res) => {
    try {
        const notification = req.body;

        // Log full body for debugging production issues
        console.log(`\n🔔 [Webhook] Full Payload:`, JSON.stringify(notification, null, 2));

        const {
            order_id,
            transaction_status,
            fraud_status,
            transaction_id,
            payment_type
        } = notification;

        console.log(`\n🔔 ============================================`);
        console.log(`🔔 [Midtrans Webhook] Order: ${order_id}`);
        console.log(`🔔 Status: ${transaction_status} | Fraud: ${fraud_status}`);
        console.log(`🔔 ============================================\n`);

        // Handle Midtrans Test Pings / Connection Tests
        // These often lack order_id or use dummy data that fails signature check
        if (!order_id || (notification.status_message && notification.status_message.toLowerCase().includes('test'))) {
            console.log(`ℹ️ [Webhook] Acknowledging test notification/ping.`);
            return res.status(200).json({ success: true, message: 'Test notification received' });
        }

        // Verify signature
        if (!midtransService.verifySignature(notification)) {
            console.error('❌ [Webhook] Invalid signature!');
            // Return 200 even on invalid signature to satisfy Midtrans, 
            // but don't process the order.
            return res.status(200).json({ success: false, error: 'Invalid signature' });
        }

        const isSubscription = order_id && order_id.startsWith('SUB-');
        const isTopup = order_id && order_id.startsWith('TOP-');

        // Handle specific GoPay Account Linking or Recurring notifications if they don't have our order_id format
        if (!isSubscription && !isTopup) {
            console.log(`ℹ️ [Webhook] Non-standard notification received:`, JSON.stringify(notification));
            // Just acknowledge to Midtrans
            return res.status(200).json({ success: true, message: 'Notification received' });
        }

        // Handle based on transaction status
        if (transaction_status === 'capture' || transaction_status === 'settlement') {
            if (fraud_status && fraud_status !== 'accept') {
                console.warn(`⚠️ [Webhook] Fraud detected for ${order_id}`);
                return res.status(200).json({ success: true });
            }

            // Item #7: Idempotency — skip if already processed
            if (isSubscription) {
                const { data: existingSub } = await supabase
                    .from('subscriptions')
                    .select('status')
                    .eq('midtrans_order_id', order_id)
                    .single();
                if (existingSub && existingSub.status === 'active') {
                    console.log(`✅ [Webhook] Order ${order_id} already active. Skipping.`);
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
                    console.log(`✅ [Webhook] Order ${order_id} already paid. Skipping.`);
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
            console.log(`📝 [Webhook] Recurring payment notification for ${order_id}: ${transaction_status}`);
            // Core logic for recurring is usually handled by 'settlement' above
        } else {
            console.log(`ℹ️ [Webhook] Unhandled status: ${transaction_status} for ${order_id}`);
        }
        // 'pending' — no action needed, subscription already in pending state

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ [Webhook] Processing error:', error.message);
        // Always return 200 to Midtrans to prevent retries on our errors
        res.status(200).json({ success: false, error: error.message });
    }
};

// ═══════════════════════════════════════════
// PAYMENT STATUS CHECK
// ═══════════════════════════════════════════

const getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const status = await midtransService.getTransactionStatus(orderId);
        res.json({ success: true, status });
    } catch (error) {
        console.error('❌ [PaymentController] getPaymentStatus error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ═══════════════════════════════════════════
// MIDTRANS CONFIG (for frontend)
// ═══════════════════════════════════════════

const getMidtransConfig = async (req, res) => {
    res.json({
        success: true,
        clientKey: midtransService.getClientKey(),
        snapJsUrl: midtransService.getSnapJsUrl(),
    });
};

const getUserFeatures = async (req, res) => {
    try {
        const userId = req.userId;
        const features = await paymentService.getUserFeatures(userId);
        res.json({ success: true, features });
    } catch (error) {
        console.error('❌ [getUserFeatures] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getPackages,
    subscribe,
    getMySubscription,
    topup,
    getMyTokens,
    getTopupTiers,
    webhook,
    getPaymentStatus,
    getMidtransConfig,
    getUserFeatures,
};
