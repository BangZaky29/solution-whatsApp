function startSubscriptionExpiryJob() {
    return setInterval(async () => {
        try {
            const paymentService = require('../services/payment/payment.service');
            const notificationService = require('../services/payment/notification.service');
            const supabase = require('../config/supabase');

            // 1. Expire overdue subscriptions
            const expired = await paymentService.checkAndExpireSubscriptions();
            for (const sub of expired) {
                try {
                    const { data: user } = await supabase
                        .from('users')
                        .select('phone, full_name, username')
                        .eq('id', sub.user_id)
                        .single();

                    if (user?.phone) {
                        await notificationService.notifySubscriptionExpired(
                            user.phone,
                            user.full_name || user.username || 'User',
                            sub.packages?.display_name || 'Unknown'
                        );
                    }
                } catch (e) {
                    console.error(`[Cron] Notification error for expired sub:`, e.message);
                }
            }

            // Item #4: Notify subscriptions expiring within 3 days
            const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
            const now = new Date().toISOString();
            const { data: expiringSoon } = await supabase
                .from('subscriptions')
                .select('user_id, expires_at, payment_method, packages(display_name)')
                .eq('status', 'active')
                .gt('expires_at', now)
                .lte('expires_at', threeDaysLater);

            if (expiringSoon) {
                for (const sub of expiringSoon) {
                    try {
                        const { data: user } = await supabase
                            .from('users')
                            .select('phone, full_name, username')
                            .eq('id', sub.user_id)
                            .single();

                        if (!user?.phone) continue;

                        const daysLeft = Math.ceil((new Date(sub.expires_at) - new Date()) / (1000 * 60 * 60 * 24));

                        if (sub.payment_method === 'trial') {
                            await notificationService.notifyTrialExpiring(
                                user.phone,
                                user.full_name || user.username || 'User'
                            );
                        } else {
                            await notificationService.notifySubscriptionExpiringSoon(
                                user.phone,
                                user.full_name || user.username || 'User',
                                sub.packages?.display_name || 'Unknown',
                                daysLeft
                            );
                        }
                    } catch (e) {
                        console.error(`[Cron] Expiring-soon notification error:`, e.message);
                    }
                }
            }
        } catch (err) {
            console.error(`[Cron] Subscription expiry check error:`, err.message);
        }
    }, 60 * 60 * 1000); // Every 1 hour
}

module.exports = { startSubscriptionExpiryJob };
