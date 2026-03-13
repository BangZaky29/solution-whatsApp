const supabase = require('../config/supabase');

/**
 * Moderator Controller
 * Provides REST endpoints for the moderator dashboard FE.
 */

// GET /api/moderator/users
async function getUsers(req, res) {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, phone, email, full_name, username, role, created_at')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        // Enrich with token balances, subscriptions, media count
        const enriched = await Promise.all((users || []).map(async (user) => {
            const { data: balance } = await supabase
                .from('token_balances')
                .select('balance, total_used')
                .eq('user_id', user.id)
                .single();

            const { data: sub } = await supabase
                .from('subscriptions')
                .select('*, packages(display_name)')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const { count } = await supabase
                .from('wa_media')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id);

            return {
                ...user,
                token_balance: balance?.balance ?? 0,
                total_used: balance?.total_used ?? 0,
                active_package: sub?.packages?.display_name || null,
                media_count: count || 0,
            };
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// GET /api/moderator/logs
async function getLogs(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const { data, error } = await supabase
            .from('moderator_logs')
            .select('*')
            .order('executed_at', { ascending: false })
            .limit(limit);

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// GET /api/moderator/stats
async function getStats(req, res) {
    try {
        const [users, media, transactions, subs, modLogs] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('wa_media').select('id', { count: 'exact', head: true }),
            supabase.from('token_transactions').select('id', { count: 'exact', head: true }),
            supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('moderator_logs').select('id', { count: 'exact', head: true }),
        ]);

        const { data: tokenSum } = await supabase
            .from('token_transactions')
            .select('amount')
            .gt('amount', 0);

        const totalTokens = tokenSum?.reduce((sum, t) => sum + t.amount, 0) || 0;

        res.json({
            totalUsers: users.count || 0,
            totalMedia: media.count || 0,
            totalTransactions: transactions.count || 0,
            activeSubscriptions: subs.count || 0,
            totalTokensDistributed: totalTokens,
            totalModeratorActions: modLogs.count || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// GET /api/moderator/role/:phone
async function getUserRole(req, res) {
    try {
        let phone = req.params.phone.replace(/\D/g, '');
        if (phone.startsWith('0')) phone = '62' + phone.substring(1);

        const { data, error } = await supabase
            .from('users')
            .select('role')
            .eq('phone', phone)
            .maybeSingle();

        if (error) throw error;
        
        const role = data?.role || 'user';
        res.json({ role });
    } catch (err) {
        console.error(`[ModeratorController] getUserRole error:`, err.message);
        res.json({ role: 'user', error: err.message });
    }
}

module.exports = { getUsers, getLogs, getStats, getUserRole };
