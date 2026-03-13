const supabase = require('../config/supabase');
const commandExecutor = require('../services/moderator/commandExecutor');

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

// POST /api/moderator/execute
async function executeManualCommand(req, res) {
    try {
        const { action, target, params } = req.body;
        const moderatorIdentifier = 'DASHBOARD_UI'; // Traceable ID for UI actions

        console.log(`📡 [ModeratorController] Manual execution: ${action} for`, target);

        // 1. Execute using existing executor
        const executionResult = await commandExecutor.executeCommand({ action, target, params });

        // 2. Log the action manually since it didn't come through WhatsApp bot
        await supabase.from('moderator_logs').insert({
            moderator_phone: moderatorIdentifier,
            raw_command: `[UI] ${action} (${JSON.stringify(params)})`,
            parsed_action: action,
            target_identifier: target.phone || target.username || target.id,
            status: executionResult.success ? 'success' : 'failed',
            result_summary: executionResult.result,
            executed_at: new Date().toISOString()
        });

        res.json(executionResult);

    } catch (err) {
        console.error(`[ModeratorController] executeManualCommand error:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = { getUsers, getLogs, getStats, executeManualCommand };
