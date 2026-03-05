const supabase = require('../../config/supabase');

/**
 * Payment Service
 * Handles subscription, token balance, and package management logic.
 * Clean OOP structure for maintainability.
 */
class PaymentService {
    constructor() {
        this.packagesTable = 'packages';
        this.subscriptionsTable = 'subscriptions';
        this.tokenBalancesTable = 'token_balances';
        this.tokenTransactionsTable = 'token_transactions';
        this.topupOrdersTable = 'topup_orders';
        console.log('💳 [PaymentService] Initialized');
    }

    // ═══════════════════════════════════════════
    // PACKAGES
    // ═══════════════════════════════════════════

    async getAllPackages() {
        const { data, error } = await supabase
            .from(this.packagesTable)
            .select('*')
            .eq('is_active', true)
            .order('price', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async getPackageById(packageId) {
        const { data, error } = await supabase
            .from(this.packagesTable)
            .select('*')
            .eq('id', packageId)
            .single();
        if (error) throw error;
        return data;
    }

    async getPackageByName(name) {
        const { data, error } = await supabase
            .from(this.packagesTable)
            .select('*')
            .eq('name', name)
            .single();
        if (error) return null;
        return data;
    }

    // ═══════════════════════════════════════════
    // SUBSCRIPTIONS
    // ═══════════════════════════════════════════

    async getActiveSubscription(userId) {
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

    async createSubscription(userId, packageId, orderId) {
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

    async activateSubscription(orderId, transactionId, paymentMethod) {
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

    async expireSubscription(orderId) {
        const { error } = await supabase
            .from(this.subscriptionsTable)
            .update({ status: 'expired' })
            .eq('midtrans_order_id', orderId);
        if (error) throw error;
    }

    // ═══════════════════════════════════════════
    // TOKEN BALANCE
    // ═══════════════════════════════════════════

    async getTokenBalance(userId) {
        const { data, error } = await supabase
            .from(this.tokenBalancesTable)
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error && error.code === 'PGRST116') {
            // No balance row — create one
            const { data: newBalance } = await supabase
                .from(this.tokenBalancesTable)
                .insert({ user_id: userId, balance: 0, total_used: 0 })
                .select()
                .single();
            return newBalance;
        }
        if (error) throw error;
        return data;
    }

    async creditTokens(userId, amount, type, description, referenceId = null) {
        const balance = await this.getTokenBalance(userId);
        const newBalance = balance.balance + amount;

        // Update balance
        const { error: balErr } = await supabase
            .from(this.tokenBalancesTable)
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        if (balErr) throw balErr;

        // Log transaction
        await this._logTokenTransaction(userId, amount, type, description, referenceId, newBalance);

        console.log(`💰 [PaymentService] Credited ${amount} tokens to user ${userId}. New balance: ${newBalance}`);
        return newBalance;
    }

    async deductTokens(userId, amount, type, referenceId = null) {
        const balance = await this.getTokenBalance(userId);
        if (balance.balance < amount) {
            return { success: false, reason: 'insufficient_tokens', balance: balance.balance };
        }

        const newBalance = balance.balance - amount;
        const newTotalUsed = balance.total_used + amount;

        // Update balance
        const { error: balErr } = await supabase
            .from(this.tokenBalancesTable)
            .update({
                balance: newBalance,
                total_used: newTotalUsed,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
        if (balErr) throw balErr;

        // Log transaction
        await this._logTokenTransaction(userId, -amount, type, `Deducted: ${type}`, referenceId, newBalance);

        return { success: true, balance: newBalance };
    }

    async hasEnoughTokens(userId, required = 10) {
        const balance = await this.getTokenBalance(userId);
        return balance.balance >= required;
    }

    // ═══════════════════════════════════════════
    // TOP-UP ORDERS
    // ═══════════════════════════════════════════

    async createTopupOrder(userId, tokenAmount, price, orderId) {
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

    async activateTopup(orderId, transactionId, paymentMethod) {
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

    async expireTopup(orderId) {
        const { error } = await supabase
            .from(this.topupOrdersTable)
            .update({ status: 'expired' })
            .eq('midtrans_order_id', orderId);
        if (error) throw error;
    }

    // ═══════════════════════════════════════════
    // TRIAL (New User)
    // ═══════════════════════════════════════════

    async grantTrial(userId) {
        // Check if user already had a subscription
        const { data: existing } = await supabase
            .from(this.subscriptionsTable)
            .select('id')
            .eq('user_id', userId)
            .limit(1);

        if (existing && existing.length > 0) {
            console.log(`ℹ️ [PaymentService] User ${userId} already has subscription history. No trial.`);
            return null;
        }

        // Get Pro package for trial features
        const proPackage = await this.getPackageByName('pro');
        if (!proPackage) {
            console.error('❌ [PaymentService] Pro package not found for trial grant!');
            return null;
        }

        const now = new Date();
        const trialExpiry = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)); // 3 days

        // Create trial subscription
        const { data: trialSub, error: subErr } = await supabase
            .from(this.subscriptionsTable)
            .insert({
                user_id: userId,
                package_id: proPackage.id,
                status: 'active',
                started_at: now.toISOString(),
                expires_at: trialExpiry.toISOString(),
                midtrans_order_id: `TRIAL-${userId}-${Date.now()}`,
                payment_method: 'trial',
            })
            .select()
            .single();
        if (subErr) throw subErr;

        // Credit 1500 trial tokens
        await this.creditTokens(userId, 1500, 'subscription', 'Trial 3 hari - Pro Package', trialSub.midtrans_order_id);

        console.log(`🎉 [PaymentService] Trial granted to user ${userId}: 3 days Pro + 1500 tokens`);
        return trialSub;
    }

    // ═══════════════════════════════════════════
    // TOKEN TRANSACTION LOG
    // ═══════════════════════════════════════════

    async getTokenTransactions(userId, limit = 50) {
        const { data, error } = await supabase
            .from(this.tokenTransactionsTable)
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    }

    async _logTokenTransaction(userId, amount, type, description, referenceId, balanceAfter) {
        const { error } = await supabase
            .from(this.tokenTransactionsTable)
            .insert({
                user_id: userId,
                amount,
                type,
                description,
                reference_id: referenceId,
                balance_after: balanceAfter,
            });
        if (error) {
            console.error('❌ [PaymentService] Failed to log token transaction:', error.message);
        }
    }

    // ═══════════════════════════════════════════
    // FEATURE LIMITS (per package)
    // ═══════════════════════════════════════════

    async getUserFeatures(userId) {
        const sub = await this.getActiveSubscription(userId);
        if (!sub || !sub.packages) {
            // No active subscription — return minimal/free features
            return {
                has_subscription: false,
                max_prompts: 0,
                max_contacts: 0,
                max_api_keys: 0,
                proactive_enabled: false,
                max_delay_mins: 0,
                history_retention_days: 0,
                blocked_log_enabled: false,
                log_monitor_enabled: false,
                dashboard_level: 'none',
                package_name: null,
                expires_at: null,
            };
        }

        const features = sub.packages.features || {};
        return {
            has_subscription: true,
            max_prompts: features.max_prompts ?? 999,
            max_contacts: features.max_contacts ?? 999,
            max_api_keys: features.max_api_keys ?? 0,
            proactive_enabled: features.proactive_enabled ?? false,
            max_delay_mins: features.max_delay_mins ?? 5,
            history_retention_days: features.history_retention_days ?? 7,
            blocked_log_enabled: features.blocked_log_enabled ?? false,
            log_monitor_enabled: features.log_monitor_enabled ?? false,
            dashboard_level: features.dashboard_level ?? 'summary',
            package_name: sub.packages.display_name,
            expires_at: sub.expires_at,
        };
    }

    // ═══════════════════════════════════════════
    // SUBSCRIPTION EXPIRY CHECK (for cron)
    // ═══════════════════════════════════════════

    async checkAndExpireSubscriptions() {
        const now = new Date().toISOString();
        const { data: expired, error } = await supabase
            .from(this.subscriptionsTable)
            .update({ status: 'expired' })
            .eq('status', 'active')
            .lt('expires_at', now)
            .select('user_id, midtrans_order_id, packages(display_name)');

        if (error) {
            console.error('❌ [PaymentService] Expiry check error:', error.message);
            return [];
        }

        if (expired && expired.length > 0) {
            console.log(`⏰ [PaymentService] Expired ${expired.length} subscription(s)`);
        }
        return expired || [];
    }
}

module.exports = new PaymentService();
