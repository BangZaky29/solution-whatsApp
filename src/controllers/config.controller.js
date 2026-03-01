const historyService = require('../services/common/history.service');
const configService = require('../services/common/config.service');
const supabase = require('../config/supabase');
const aiBotService = require('../services/ai/aiBot.service');

const getStats = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || null;
        const chats = await historyService.getAllChatStats(userId);
        const globalStats = await configService.getSetting(userId ? `global_stats:${userId}` : 'global_stats') || { requests: 0, responses: 0 };

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
        const userId = req.headers['x-session-id'] || null;
        const prompts = await configService.getAllPrompts(userId);
        res.json({ success: true, prompts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const upsertPrompt = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || null;
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
        const userId = req.headers['x-session-id'] || null;
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
        const userId = req.headers['x-session-id'] || null;
        const { id } = req.params;
        const { name, content } = req.body;
        let query = supabase.from('wa_bot_prompts').update({ name, content }).eq('id', id);
        if (userId) query = query.eq('user_id', userId);
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
        const userId = req.headers['x-session-id'] || null;
        const { id } = req.params;
        let query = supabase.from('wa_bot_prompts').delete().eq('id', id);
        if (userId) query = query.eq('user_id', userId);
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
        const userId = req.headers['x-session-id'] || null;
        const contacts = await configService.getAllowedContacts(userId);
        const mode = await configService.getTargetMode(userId);
        res.json({ success: true, contacts, mode });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addContact = async (req, res) => {
    try {
        // Node.js otomatis baca header jadi lowercase, 
        // tapi kita pastiin lagi ambil dari x-session-id
        const userId = req.headers['x-session-id'];
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

        console.log(`✅ [addContact] Berhasil nambahin kontak buat user: ${userId}`);
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
        const userId = req.headers['x-session-id'] || null;
        const { jid } = req.params;
        const { name } = req.body;
        let query = supabase.from('wa_bot_contacts').update({ push_name: name }).eq('jid', jid);
        if (userId) query = query.eq('user_id', userId);
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
        const userId = req.headers['x-session-id'] || null;
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

const setTargetMode = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || null;
        const { mode } = req.body;
        await configService.updateSetting(userId ? `target_mode:${userId}` : 'target_mode', { mode });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getHistory = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || null;
        const { jid } = req.params;
        const history = await historyService.getHistory(jid, userId);
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getSystemPrompt = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || null;
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
        const userId = req.headers['x-session-id'] || null;
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
        const userId = req.headers['x-session-id'] || null;
        const keys = await configService.getAllApiKeys(userId);
        res.json({ success: true, keys });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addKey = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || null;
        const { name, key, model, version } = req.body;
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
        const userId = req.headers['x-session-id'] || null;
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
        const userId = req.headers['x-session-id'] || null;
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
        const userId = req.headers['x-session-id'] || null;
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
    setTargetMode,
    getHistory,
    getSystemPrompt,
    updateSystemPrompt,
    getKeys,
    addKey,
    updateKey,
    deleteKey,
    activateKey
};
