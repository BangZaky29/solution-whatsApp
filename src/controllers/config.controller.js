const historyService = require('../services/common/history.service');
const configService = require('../services/common/config.service');
const supabase = require('../config/supabase');
const aiBotService = require('../services/ai/aiBot.service');

const getStats = async (req, res) => {
    try {
        const chats = await historyService.getAllChatStats();
        const globalStats = await configService.getSetting('global_stats') || { requests: 0, responses: 0 };

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
        const prompts = await configService.getAllPrompts();
        res.json({ success: true, prompts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const upsertPrompt = async (req, res) => {
    try {
        const { name, content, isActive } = req.body;
        const { data, error } = await supabase.from('wa_bot_prompts').upsert({ name, content, is_active: isActive });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const activatePrompt = async (req, res) => {
    try {
        const { id } = req.body;
        await configService.setActivePrompt(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updatePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, content } = req.body;
        const { error } = await supabase.from('wa_bot_prompts').update({ name, content }).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deletePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('wa_bot_prompts').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getContacts = async (req, res) => {
    try {
        const contacts = await configService.getAllowedContacts();
        const mode = await configService.getTargetMode();
        res.json({ success: true, contacts, mode });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addContact = async (req, res) => {
    try {
        const { jid, name } = req.body;
        await configService.addContact(jid, name);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateContact = async (req, res) => {
    try {
        const { jid } = req.params;
        const { name } = req.body;
        const { error } = await supabase.from('wa_bot_contacts').update({ push_name: name }).eq('jid', jid);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteContact = async (req, res) => {
    try {
        await configService.removeContact(req.params.jid);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const setTargetMode = async (req, res) => {
    try {
        const { mode } = req.body;
        await configService.updateSetting('target_mode', { mode });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getHistory = async (req, res) => {
    try {
        const { jid } = req.params;
        const history = await historyService.getHistory(jid);
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getSystemPrompt = (req, res) => {
    res.json({
        success: true,
        systemPrompt: aiBotService.config.systemPrompt
    });
};

const updateSystemPrompt = (req, res) => {
    const { systemPrompt } = req.body;
    if (!systemPrompt) {
        return res.status(400).json({ success: false, error: 'systemPrompt is required' });
    }
    aiBotService.updateConfig({ systemPrompt });
    res.json({
        success: true,
        message: 'System prompt updated successfully'
    });
};

const getKeys = async (req, res) => {
    try {
        const keys = await configService.getAllApiKeys();
        res.json({ success: true, keys });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addKey = async (req, res) => {
    try {
        const { name, key } = req.body;
        await configService.addApiKey(name, key);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateKey = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, key } = req.body;
        await configService.updateApiKey(id, name, key);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteKey = async (req, res) => {
    try {
        await configService.removeApiKey(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const activateKey = async (req, res) => {
    try {
        await configService.activateApiKey(req.params.id);
        res.json({ success: true });
    } catch (error) {
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
