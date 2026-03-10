const historyService = require('../services/common/history.service');
const configService = require('../services/common/config.service');
const supabase = require('../config/supabase');
const aiBotService = require('../services/ai/aiBot.service');
const paymentService = require('../services/payment/payment.service');

const getStats = async (req, res) => {
    try {
        const userId = req.userId; // Guaranteed by middleware
        const chats = await historyService.getAllChatStats(userId);
        const globalStats = await configService.getSetting(`global_stats:${userId}`) || { requests: 0, responses: 0 };

        const displayName = await configService.getUserDisplay(userId);
        console.log(`📊 [getStats] User: ${displayName} | Chats found: ${chats.length}`);

        res.json({
            success: true,
            stats: chats,
            global: globalStats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getPrompts = async (req, res) => {
    try {
        const userId = req.userId;
        const prompts = await configService.getAllPrompts(userId);
        const displayName = await configService.getUserDisplay(userId);
        console.log(`📜 [getPrompts] User: ${displayName} | Prompts found: ${prompts.length}`);
        res.json({ success: true, prompts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const upsertPrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { id, name, content, isActive } = req.body;

        const promptData = {
            name,
            content,
            is_active: isActive,
            user_id: userId
        };

        let result;
        if (id) {
            // Update existing
            result = await supabase
                .from('wa_bot_prompts')
                .update(promptData)
                .eq('id', id)
                .select();
        } else {
            // Insert new
            // Item #2: Feature limit check — max_prompts
            const features = await paymentService.getUserFeatures(userId);
            if (features.has_subscription && features.max_prompts < 999) {
                const { count } = await supabase
                    .from('wa_bot_prompts')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userId);
                if (count >= features.max_prompts) {
                    return res.status(403).json({
                        success: false,
                        error: `Batas prompt tercapai (${features.max_prompts}). Upgrade paket untuk menambah lebih banyak.`
                    });
                }
            }
            result = await supabase
                .from('wa_bot_prompts')
                .insert(promptData)
                .select();
        }

        if (result.error) {
            console.error(`❌ [upsertPrompt] DB Error:`, result.error.message);
            throw result.error;
        }
        res.json({ success: true, data: result.data });
    } catch (error) {
        console.error(`❌ [upsertPrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const activatePrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.body;
        const result = await configService.setActivePrompt(id, userId);
        if (result && result.error) {
            console.error(`❌ [activatePrompt] Error:`, result.error.message);
            throw result.error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [activatePrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const updatePrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { name, content } = req.body;
        let query = supabase.from('wa_bot_prompts').update({ name, content }).eq('id', id).eq('user_id', userId);
        const { error } = await query;
        if (error) {
            console.error(`❌ [updatePrompt] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [updatePrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const deletePrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        let query = supabase.from('wa_bot_prompts').delete().eq('id', id).eq('user_id', userId);
        const { error } = await query;
        if (error) {
            console.error(`❌ [deletePrompt] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [deletePrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getContacts = async (req, res) => {
    try {
        const userId = req.userId;
        const contacts = await configService.getAllowedContacts(userId);
        const mode = await configService.getTargetMode(userId);
        res.json({ success: true, contacts, mode });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addContact = async (req, res) => {
    try {
        const userId = req.userId;
        const { jid, name } = req.body;

        // LOG untuk debugging (Cek di terminal PM2/Node)
        console.log(`🔍 [addContact] Header ID: ${userId} | JID: ${jid}`);

        // 1. Validasi: Jangan biarkan userId kosong atau string "null"/"undefined"
        if (!userId || userId === 'null' || userId === 'undefined') {
            console.error("❌ [addContact] User ID is missing or invalid string");
            return res.status(400).json({
                success: false,
                error: 'Header x-session-id wajib diisi dengan UUID yang valid.'
            });
        }

        // Item #2: Feature limit check — max_contacts
        const features = await paymentService.getUserFeatures(userId);
        if (features.has_subscription && features.max_contacts < 999) {
            const { count } = await supabase
                .from('wa_bot_contacts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);
            if (count >= features.max_contacts) {
                return res.status(403).json({
                    success: false,
                    error: `Batas kontak tercapai (${features.max_contacts}). Upgrade paket untuk menambah lebih banyak.`
                });
            }
        }

        // 2. Panggil Service
        const result = await configService.addContact(jid, name, userId);

        // 3. Cek Error dari Supabase
        if (result.error) {
            console.error(`❌ [addContact] Supabase Error:`, result.error.message);

            // Jika error karena format UUID salah (bukan format 8-4-4-4-12)
            if (result.error.code === '22P02') {
                return res.status(400).json({
                    success: false,
                    error: 'Format ID User salah. Harus format UUID.'
                });
            }

            throw result.error;
        }

        const displayName = await configService.getUserDisplay(userId);
        console.log(`✅ [addContact] Berhasil nambahin kontak buat user: ${displayName}`);
        res.json({ success: true });

    } catch (error) {
        console.error(`❌ [addContact] Catch Exception:`, error.message);
        res.status(500).json({
            success: false,
            error: 'Gagal nambahin kontak. Cek log server.'
        });
    }
};

const updateContact = async (req, res) => {
    try {
        const userId = req.userId;
        const { jid } = req.params;
        const { name } = req.body;
        let query = supabase.from('wa_bot_contacts').update({ push_name: name }).eq('jid', jid).eq('user_id', userId);
        const { error } = await query;
        if (error) {
            console.error(`❌ [updateContact] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [updateContact] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteContact = async (req, res) => {
    try {
        const userId = req.userId;
        const { error } = await configService.removeContact(req.params.jid, userId);
        if (error) {
            console.error(`❌ [deleteContact] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [deleteContact] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateTargetMode = async (req, res) => {
    try {
        const userId = req.userId;
        const { mode } = req.body;
        await configService.updateSetting(userId ? `target_mode:${userId}` : 'target_mode', { mode });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getHistory = async (req, res) => {
    try {
        const userId = req.userId;
        const { jid } = req.params;
        const history = await historyService.getHistory(jid, userId);
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getSystemPrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const prompt = await configService.getSystemPrompt(userId);
        res.json({
            success: true,
            systemPrompt: prompt
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateSystemPrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { systemPrompt } = req.body;
        if (!systemPrompt) {
            return res.status(400).json({ success: false, error: 'systemPrompt is required' });
        }
        await aiBotService.updateConfig({ systemPrompt }, userId);
        res.json({
            success: true,
            message: 'System prompt updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getKeys = async (req, res) => {
    try {
        const userId = req.userId;
        const keys = await configService.getAllApiKeys(userId);
        const displayName = await configService.getUserDisplay(userId);
        console.log(`🔑 [getKeys] User: ${displayName} | Keys found: ${keys.length}`);
        res.json({ success: true, keys });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addKey = async (req, res) => {
    try {
        const userId = req.userId;
        const { name, key, model, version } = req.body;

        // Item #2: Feature limit check — max_api_keys
        const features = await paymentService.getUserFeatures(userId);
        if (features.max_api_keys === 0) {
            return res.status(403).json({
                success: false,
                error: 'Paket Anda tidak mendukung BYOK (Bring Your Own Key). Upgrade ke Premium atau Pro.'
            });
        }
        if (features.has_subscription && features.max_api_keys < 999) {
            const { count } = await supabase
                .from('wa_bot_api_keys')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);
            if (count >= features.max_api_keys) {
                return res.status(403).json({
                    success: false,
                    error: `Batas API Key tercapai (${features.max_api_keys}). Upgrade paket untuk menambah lebih banyak.`
                });
            }
        }

        const { error } = await configService.addApiKey(name, key, model, version, userId);
        if (error) {
            console.error(`❌ [addKey] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [addKey] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateKey = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { name, key, model, version } = req.body;
        const { error } = await configService.updateApiKey(id, name, key, model, version, userId);
        if (error) {
            console.error(`❌ [updateKey] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [updateKey] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteKey = async (req, res) => {
    try {
        const userId = req.userId;
        const { error } = await configService.removeApiKey(req.params.id, userId);
        if (error) {
            console.error(`❌ [deleteKey] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [deleteKey] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const activateKey = async (req, res) => {
    try {
        const userId = req.userId;
        const result = await configService.activateApiKey(req.params.id, userId);
        if (result.error) {
            console.error(`❌ [activateKey] Error:`, result.error.message);
            throw result.error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ [activateKey] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getAIControls = async (req, res) => {
    try {
        const userId = req.userId;
        const controls = await configService.getAIControls(userId);
        res.json({ success: true, controls });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateAIControls = async (req, res) => {
    try {
        const userId = req.userId;
        const { controls } = req.body;
        const success = await configService.updateAIControls(userId, controls);

        if (success) {
            const displayName = await configService.getUserDisplay(userId);
            console.log(`\n[CONFIGURATION-User]:\n✅ [Config] AI Controls updated for user: ${displayName}`);
        }

        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getBlockedAttempts = async (req, res) => {
    try {
        const userId = req.userId;
        const attempts = await configService.getBlockedAttempts(userId);
        res.json({ success: true, attempts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const whitelistBlockedAttempt = async (req, res) => {
    try {
        const userId = req.userId;
        const { jid, name } = req.body;

        // 1. Add to contacts
        const result = await configService.addContact(jid, name, userId);
        if (result.error) throw result.error;

        // 2. Remove from blocked attempts
        await configService.deleteBlockedAttempt(jid, userId);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteBlockedAttempt = async (req, res) => {
    try {
        const userId = req.userId;
        const { jid } = req.body;

        await configService.deleteBlockedAttempt(jid, userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteHistory = async (req, res) => {
    try {
        const userId = req.userId;
        const { jids } = req.body;

        if (!jids || !Array.isArray(jids)) {
            return res.status(400).json({ success: false, error: 'JIDs array is required' });
        }

        const { error } = await supabase
            .from(historyService.tableName)
            .delete()
            .in('jid', jids)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const wipeAccountData = async (req, res) => {
    const sessionManager = require('../services/whatsapp/session.manager');

    try {
        const userId = req.userId;
        const displayName = await configService.getUserDisplay(userId);

        console.log(`\n🔴 ============================================`);
        console.log(`🔴 [wipeAccountData] FULL ACCOUNT DELETION`);
        console.log(`🔴 User: ${displayName} (${userId})`);
        console.log(`🔴 ============================================\n`);

        // ── STEP 1: Disconnect & clear WhatsApp session ──
        const session = sessionManager.getSession(userId);
        if (session) {
            console.log(`📱 [wipeAccountData] Disconnecting WhatsApp session...`);
            if (session.socket) {
                try {
                    await session.socket.logout();
                    console.log(`✅ [wipeAccountData] WhatsApp socket logged out.`);
                } catch (e) {
                    console.warn(`⚠️ [wipeAccountData] Socket logout warning: ${e.message}`);
                }
            }
            // Clear WA auth state from database (session keys stored in wa_ai_sessions)
            if (session.clearSessionHandler) {
                try {
                    await session.clearSessionHandler();
                    console.log(`✅ [wipeAccountData] WA auth state cleared from database.`);
                } catch (e) {
                    console.warn(`⚠️ [wipeAccountData] Clear session warning: ${e.message}`);
                }
            }
            sessionManager.deleteSession(userId);
            console.log(`✅ [wipeAccountData] In-memory session removed.`);
        }

        // ── STEP 2: Delete files from Storage (whatsapp-media) ──
        console.log(`📂 [wipeAccountData] Cleaning up storage files...`);
        try {
            // List all files in the user's folder
            const { data: files, error: listError } = await supabase.storage
                .from('whatsapp-media')
                .list(userId);

            if (files && files.length > 0) {
                const pathsToDelete = files.map(file => `${userId}/${file.name}`);
                const { error: deleteError } = await supabase.storage
                    .from('whatsapp-media')
                    .remove(pathsToDelete);

                if (deleteError) {
                    console.warn(`⚠️ [wipeAccountData] Storage deletion warning: ${deleteError.message}`);
                } else {
                    console.log(`✅ [wipeAccountData] Deleted ${files.length} files from storage.`);
                }
            }
        } catch (e) {
            console.warn(`⚠️ [wipeAccountData] Storage cleanup exception: ${e.message}`);
        }

        // ── STEP 3: Manual Cascade Deletion (due to missing ON DELETE CASCADE) ──
        const tablesToDelete = [
            'wa_chat_history',
            'wa_chat_history_local',
            'wa_media',
            'wa_bot_logs',
            'wa_bot_contacts',
            'wa_bot_blocked_attempts',
            'wa_bot_api_keys',
            'wa_bot_prompts',
            'user_sessions',
            'topup_orders',
            'token_transactions',
            'token_balances',
            'subscriptions',
            'otp_codes',
            'wa_sessions' // Primary session record
        ];

        for (const table of tablesToDelete) {
            console.log(`🗑️  [wipeAccountData] Wiping table: ${table}...`);
            const { error: tblErr } = await supabase
                .from(table)
                .delete()
                .eq('user_id', userId);

            if (tblErr) {
                console.warn(`⚠️ [wipeAccountData] Warning deleting from ${table}: ${tblErr.message}`);
            }
        }

        // ── STEP 4: Delete wa_bot_settings (uses pattern in ID) ──
        console.log(`🗑️  [wipeAccountData] Wiping wa_bot_settings pattern...`);
        const { error: settingsErr } = await supabase
            .from('wa_bot_settings')
            .delete()
            .like('id', `%${userId}%`);

        if (settingsErr) {
            console.warn(`⚠️ [wipeAccountData] Warning deleting from wa_bot_settings: ${settingsErr.message}`);
        }

        // ── STEP 5: Delete user from public.users ──
        console.log(`👤 [wipeAccountData] Deleting user record from public.users...`);
        const { error: usersErr } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (usersErr) {
            console.error(`❌ [wipeAccountData] Failed to delete from public.users: ${usersErr.message}`);
            throw new Error(`Failed to delete user record: ${usersErr.message}`);
        }

        // ── STEP 6: Delete auth identity from Supabase Auth ──
        console.log(`🔑 [wipeAccountData] Deleting Supabase Auth user...`);
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
            console.error(`❌ [wipeAccountData] Failed to delete auth user: ${authError.message}`);
            // We proceed as public data is already wiped
        } else {
            console.log(`✅ [wipeAccountData] Supabase Auth user DELETED.`);
        }

        console.log(`\n🔴 [wipeAccountData] COMPLETE - Account ${displayName} fully removed.\n`);

        res.json({ success: true, message: 'Account and all data have been permanently deleted.' });
    } catch (error) {
        console.error(`❌ [wipeAccountData] FATAL ERROR:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getStats,
    getPrompts,
    upsertPrompt,
    activatePrompt,
    updatePrompt,
    deletePrompt,
    getContacts,
    addContact,
    updateContact,
    deleteContact,
    updateTargetMode,
    getHistory,
    getSystemPrompt,
    updateSystemPrompt,
    getKeys,
    addKey,
    updateKey,
    deleteKey,
    activateKey,
    getAIControls,
    updateAIControls,
    getBlockedAttempts,
    whitelistBlockedAttempt,
    deleteBlockedAttempt,
    deleteHistory,
    wipeAccountData
};
