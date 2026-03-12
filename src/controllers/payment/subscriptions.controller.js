const paymentService = require('../../services/payment/payment.service');
const midtransService = require('../../services/payment/midtrans.service');
const notificationService = require('../../services/payment/notification.service');
const supabase = require('../../config/supabase');

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
                    // Still pending at Midtrans  redirect to same payment
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

        console.log(`?? [PaymentController] Subscription order created: ${orderId} for user ${userId}`);

        res.json({
            success: true,
            orderId,
            snapToken: snapResult.token,
            redirectUrl: snapResult.redirect_url,
        });
    } catch (error) {
        console.error('? [PaymentController] subscribe error details:', {
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
        console.error('? [PaymentController] getMySubscription error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { subscribe, getMySubscription };

