const paymentService = require('../../services/payment/payment.service');
const midtransService = require('../../services/payment/midtrans.service');
const supabase = require('../../config/supabase');

const TOPUP_TIERS = [
    { token_amount: 1000, price: 15000 },
    { token_amount: 5000, price: 75000 },
    { token_amount: 10000, price: 150000 },
    { token_amount: 25000, price: 375000 },
];

const topup = async (req, res) => {
    try {
        const userId = req.userId;
        const { tokenAmount } = req.body;

        // 1. Determine price
        let price = 0;
        const tier = TOPUP_TIERS.find(t => t.token_amount === tokenAmount);

        if (tier) {
            price = tier.price;
        } else {
            // Custom amount: Rp 150 per 10 tokens (Rp 15 per token)
            if (!tokenAmount || tokenAmount < 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Minimal top-up custom adalah 100 token.'
                });
            }
            price = Math.ceil(tokenAmount * 15);
        }

        const pkg = { display_name: `${tokenAmount} Tokens`, price };

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
            orderId, tokenAmount, price, user
        );

        // 6. Create pending topup order
        await paymentService.createTopupOrder(userId, tokenAmount, price, orderId);

        console.log(`?? [PaymentController] Topup order created: ${orderId} for ${tokenAmount} token`);

        res.json({
            success: true,
            orderId,
            snapToken: snapResult.token,
            redirectUrl: snapResult.redirect_url,
        });
    } catch (error) {
        console.error('? [PaymentController] topup error:', error.message);
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
        console.error('? [PaymentController] getMyTokens error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getTopupTiers = async (req, res) => {
    res.json({ success: true, tiers: TOPUP_TIERS });
};

module.exports = {
    TOPUP_TIERS,
    topup,
    getMyTokens,
    getTopupTiers
};
