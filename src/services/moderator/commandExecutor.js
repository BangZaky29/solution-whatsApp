const supabase = require('../../config/supabase');
const { normalizePhone } = require('./moderatorGuard');

/**
 * Command Executor
 * Executes validated moderator commands against Supabase DB/Storage.
 * Each method returns { success, result, targetUser? }
 */

/**
 * Resolve target user from parsed target object
 * @param {{ phone?, username?, name? }} target
 * @returns {Promise<object|null>} user row from DB
 */
async function resolveUser(target) {
    let query = supabase.from('users').select('id, phone, email, full_name, username, role, created_at');

    if (target.phone) {
        const normalized = normalizePhone(target.phone);
        query = query.eq('phone', normalized);
    } else if (target.username) {
        query = query.eq('username', target.username);
    } else if (target.name) {
        query = query.ilike('full_name', `%${target.name}%`);
    } else {
        return null;
    }

    const { data, error } = await query.single();
    if (error || !data) return null;
    return data;
}

// ═══════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════

/**
 * Delete media files for a user
 */
async function executeDeleteMedia(target, params) {
    const user = await resolveUser(target);
    if (!user) return { success: false, result: '❌ User tidak ditemukan.' };

    const mediaType = params.mediaType || 'all';
    let query = supabase.from('wa_media').select('*').eq('user_id', user.id);
    if (mediaType !== 'all') {
        query = query.ilike('file_type', `%${mediaType}%`);
    }

    const { data: mediaFiles, error: fetchError } = await query;
    if (fetchError) return { success: false, result: `❌ Gagal mengambil data media: ${fetchError.message}` };
    if (!mediaFiles || mediaFiles.length === 0) {
        return { success: true, result: '📂 Tidak ada media yang ditemukan untuk dihapus.', targetUser: user };
    }

    // Delete from Supabase Storage bucket
    const bucketPaths = mediaFiles.map(m => m.bucket_path).filter(Boolean);
    if (bucketPaths.length > 0) {
        try {
            const { error: storageError } = await supabase.storage
                .from('wa-media')
                .remove(bucketPaths);
            if (storageError) {
                console.warn(`⚠️ [Executor] Storage delete partial error: ${storageError.message}`);
            }
        } catch (e) {
            console.warn(`⚠️ [Executor] Storage delete error: ${e.message}`);
        }
    }

    // Delete records from DB
    let deleteQuery = supabase.from('wa_media').delete().eq('user_id', user.id);
    if (mediaType !== 'all') {
        deleteQuery = deleteQuery.ilike('file_type', `%${mediaType}%`);
    }
    const { error: deleteError } = await deleteQuery;
    if (deleteError) return { success: false, result: `❌ Gagal menghapus record media: ${deleteError.message}` };

    return {
        success: true,
        result: `✅ ${mediaFiles.length} file media berhasil dihapus dari cloud.`,
        targetUser: user
    };
}

/**
 * Activate a package for a user
 */
async function executeActivatePackage(target, params) {
    const user = await resolveUser(target);
    if (!user) return { success: false, result: '❌ User tidak ditemukan.' };

    // Find package
    let pkgQuery = supabase.from('packages').select('*').eq('is_active', true);
    if (params.packageName) {
        pkgQuery = pkgQuery.ilike('name', `%${params.packageName}%`);
    }
    const { data: packages } = await pkgQuery.limit(1);
    const pkg = packages?.[0];

    if (!pkg) {
        // List available packages
        const { data: allPkgs } = await supabase.from('packages').select('name, display_name').eq('is_active', true);
        const pkgList = allPkgs?.map(p => `• ${p.display_name} (${p.name})`).join('\n') || 'Tidak ada paket aktif';
        return { success: false, result: `❌ Paket "${params.packageName || 'unknown'}" tidak ditemukan.\n\n📦 Paket tersedia:\n${pkgList}` };
    }

    // Create subscription
    const now = new Date();
    const expiresAt = new Date(now.getTime() + pkg.duration_days * 24 * 60 * 60 * 1000);

    const { error: subError } = await supabase.from('subscriptions').insert({
        user_id: user.id,
        package_id: pkg.id,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        payment_method: 'moderator_grant'
    });

    if (subError) return { success: false, result: `❌ Gagal mengaktifkan paket: ${subError.message}` };

    // Credit tokens
    try {
        // Check if token_balances exists for user
        const { data: existingBalance } = await supabase
            .from('token_balances')
            .select('id, balance')
            .eq('user_id', user.id)
            .single();

        if (existingBalance) {
            await supabase.from('token_balances')
                .update({ balance: existingBalance.balance + pkg.token_amount, updated_at: new Date().toISOString() })
                .eq('user_id', user.id);
        } else {
            await supabase.from('token_balances')
                .insert({ user_id: user.id, balance: pkg.token_amount, total_used: 0 });
        }

        // Log token transaction
        await supabase.from('token_transactions').insert({
            user_id: user.id,
            amount: pkg.token_amount,
            type: 'moderator_grant',
            description: `Paket ${pkg.display_name} diaktifkan oleh moderator`,
            balance_after: (existingBalance?.balance || 0) + pkg.token_amount
        });
    } catch (e) {
        console.warn(`⚠️ [Executor] Token credit error: ${e.message}`);
    }

    return {
        success: true,
        result: `✅ Paket *${pkg.display_name}* berhasil diaktifkan!\n🎫 Token: +${pkg.token_amount}\n📅 Berlaku hingga: ${expiresAt.toLocaleDateString('id-ID')}`,
        targetUser: user
    };
}

/**
 * Add tokens to a user
 */
async function executeAddTokens(target, params) {
    const user = await resolveUser(target);
    if (!user) return { success: false, result: '❌ User tidak ditemukan.' };

    const amount = params.tokenAmount || 100;

    const { data: existing } = await supabase
        .from('token_balances')
        .select('id, balance')
        .eq('user_id', user.id)
        .single();

    const newBalance = (existing?.balance || 0) + amount;

    if (existing) {
        await supabase.from('token_balances')
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
    } else {
        await supabase.from('token_balances')
            .insert({ user_id: user.id, balance: amount, total_used: 0 });
    }

    await supabase.from('token_transactions').insert({
        user_id: user.id,
        amount: amount,
        type: 'moderator_grant',
        description: `+${amount} token dari moderator`,
        balance_after: newBalance
    });

    return {
        success: true,
        result: `✅ ${amount} token berhasil ditambahkan!\n💰 Saldo baru: ${newBalance} token`,
        targetUser: user
    };
}

/**
 * Reset tokens for a user
 */
async function executeResetTokens(target, params) {
    const user = await resolveUser(target);
    if (!user) return { success: false, result: '❌ User tidak ditemukan.' };

    const newAmount = params.tokenAmount || 0;

    const { data: existing } = await supabase
        .from('token_balances')
        .select('id, balance')
        .eq('user_id', user.id)
        .single();

    const oldBalance = existing?.balance || 0;

    if (existing) {
        await supabase.from('token_balances')
            .update({ balance: newAmount, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
    } else {
        await supabase.from('token_balances')
            .insert({ user_id: user.id, balance: newAmount, total_used: 0 });
    }

    await supabase.from('token_transactions').insert({
        user_id: user.id,
        amount: newAmount - oldBalance,
        type: 'moderator_reset',
        description: `Token direset oleh moderator (${oldBalance} → ${newAmount})`,
        balance_after: newAmount
    });

    return {
        success: true,
        result: `✅ Token berhasil direset!\n📊 Sebelum: ${oldBalance} → Sekarang: ${newAmount}`,
        targetUser: user
    };
}

/**
 * Get user info
 */
async function executeGetUserInfo(target) {
    const user = await resolveUser(target);
    if (!user) return { success: false, result: '❌ User tidak ditemukan.' };

    // Get token balance
    const { data: balance } = await supabase
        .from('token_balances')
        .select('balance, total_used')
        .eq('user_id', user.id)
        .single();

    // Get active subscription
    const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*, packages(name, display_name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    // Get media count
    const { count: mediaCount } = await supabase
        .from('wa_media')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

    const info = `📋 *User Info*

👤 *Nama:* ${user.full_name || '-'}
📱 *Phone:* ${user.phone}
📧 *Email:* ${user.email || '-'}
🏷️ *Username:* ${user.username || '-'}
🎭 *Role:* ${user.role}
📅 *Bergabung:* ${new Date(user.created_at).toLocaleDateString('id-ID')}

💰 *Token:* ${balance?.balance ?? 0} (Terpakai: ${balance?.total_used ?? 0})
📦 *Paket Aktif:* ${subscription?.packages?.display_name || 'Tidak ada'}
${subscription ? `📅 *Berlaku hingga:* ${new Date(subscription.expires_at).toLocaleDateString('id-ID')}` : ''}
📸 *Total Media:* ${mediaCount || 0} file`;

    return {
        success: true,
        result: info,
        targetUser: user
    };
}

/**
 * Block a contact from a user's bot
 */
async function executeBlockContact(target, params) {
    const user = await resolveUser(target);
    if (!user) return { success: false, result: '❌ User tidak ditemukan.' };

    const contactPhone = params.contactPhone || target.phone;
    if (!contactPhone) return { success: false, result: '❌ Nomor kontak yang akan diblokir harus disebutkan.' };

    const jid = normalizePhone(contactPhone) + '@s.whatsapp.net';

    const { error } = await supabase
        .from('wa_bot_contacts')
        .upsert({
            jid: jid,
            user_id: user.id,
            is_allowed: false,
            push_name: 'Blocked by moderator'
        }, { onConflict: 'jid,user_id' });

    if (error) return { success: false, result: `❌ Gagal memblokir: ${error.message}` };

    return {
        success: true,
        result: `✅ Kontak ${contactPhone} berhasil diblokir dari bot milik ${user.full_name || user.username}.`,
        targetUser: user
    };
}

/**
 * List all users
 */
async function executeListUsers() {
    const { data: users, error } = await supabase
        .from('users')
        .select('full_name, phone, username, role, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) return { success: false, result: `❌ Gagal mengambil daftar user: ${error.message}` };
    if (!users || users.length === 0) return { success: true, result: '📂 Belum ada user terdaftar.' };

    let list = `📋 *Daftar User* (${users.length} terbaru)\n\n`;
    users.forEach((u, i) => {
        list += `${i + 1}. *${u.full_name || u.username || 'N/A'}*\n`;
        list += `   📱 ${u.phone} | 🎭 ${u.role}\n`;
        list += `   📅 ${new Date(u.created_at).toLocaleDateString('id-ID')}\n\n`;
    });

    return { success: true, result: list };
}

/**
 * Deactivate/Activate a user's bot
 */
async function executeToggleBot(target, activate) {
    const user = await resolveUser(target);
    if (!user) return { success: false, result: '❌ User tidak ditemukan.' };

    const settingsId = `ai_controls:${user.id}`;

    // Get current settings
    const { data: current } = await supabase
        .from('wa_bot_settings')
        .select('value')
        .eq('id', settingsId)
        .single();

    const currentValue = current?.value || {};
    const newValue = { ...currentValue, is_ai_enabled: activate };

    const { error } = await supabase
        .from('wa_bot_settings')
        .upsert({ id: settingsId, value: newValue, updated_at: new Date().toISOString() });

    if (error) return { success: false, result: `❌ Gagal mengubah status bot: ${error.message}` };

    const status = activate ? 'AKTIF ✅' : 'NONAKTIF ❌';
    return {
        success: true,
        result: `✅ Bot milik *${user.full_name || user.username}* sekarang ${status}.`,
        targetUser: user
    };
}

// ═══════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════

/**
 * Execute a validated command
 * @param {object} parsedCommand
 * @returns {Promise<{ success: boolean, result: string, targetUser?: object }>}
 */
async function executeCommand(parsedCommand) {
    const { action, target, params } = parsedCommand;

    try {
        switch (action) {
            case 'delete_media':
                return await executeDeleteMedia(target, params);
            case 'activate_package':
                return await executeActivatePackage(target, params);
            case 'add_tokens':
                return await executeAddTokens(target, params);
            case 'reset_tokens':
                return await executeResetTokens(target, params);
            case 'get_user_info':
                return await executeGetUserInfo(target);
            case 'block_contact':
                return await executeBlockContact(target, params);
            case 'list_users':
                return await executeListUsers();
            case 'deactivate_bot':
                return await executeToggleBot(target, false);
            case 'activate_bot':
                return await executeToggleBot(target, true);
            default:
                return { success: false, result: `❌ Action "${action}" tidak dikenali.` };
        }
    } catch (error) {
        console.error(`❌ [Executor] Error executing ${action}:`, error.message);
        return { success: false, result: `❌ Terjadi error saat eksekusi: ${error.message}` };
    }
}

module.exports = { executeCommand, resolveUser };
