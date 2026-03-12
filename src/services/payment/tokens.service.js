const supabase = require('../../config/supabase');

async function getTokenBalance(userId) {
    const { data, error } = await supabase
        .from(this.tokenBalancesTable)
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error && error.code === 'PGRST116') {
        // No balance row -- create one
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

async function creditTokens(userId, amount, type, description, referenceId = null) {
    const { data, error } = await supabase.rpc('credit_tokens_atomic', {
        p_user_id: userId,
        p_amount: amount,
        p_type: type,
        p_description: description,
        p_reference_id: referenceId,
    });
    if (error) throw error;
    const newBalance = data;
    console.log(`[PaymentService] Credited ${amount} tokens to user ${userId}. New balance: ${newBalance}`);
    return newBalance;
}

async function deductTokens(userId, amount, type, referenceId = null) {
    const { data, error } = await supabase.rpc('deduct_tokens_atomic', {
        p_user_id: userId,
        p_amount: amount,
        p_type: type,
        p_description: `Deducted: ${type}`,
        p_reference_id: referenceId,
    });
    if (error) throw error;

    // RPC returns [{new_balance, new_total_used}], -1 means insufficient
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.new_balance === -1) {
        const balance = await this.getTokenBalance(userId);
        return { success: false, reason: 'insufficient_tokens', balance: balance.balance };
    }

    return { success: true, balance: result.new_balance };
}

async function hasEnoughTokens(userId, required = 10) {
    const balance = await this.getTokenBalance(userId);
    return balance.balance >= required;
}

async function getTokenTransactions(userId, limit = 50) {
    const { data, error } = await supabase
        .from(this.tokenTransactionsTable)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

module.exports = {
    getTokenBalance,
    creditTokens,
    deductTokens,
    hasEnoughTokens,
    getTokenTransactions
};
