const configService = require('../../services/common/config.service');
const supabase = require('../../config/supabase');
const paymentService = require('../../services/payment/payment.service');

const getPrompts = async (req, res) => {
    try {
        const userId = req.userId;
        const prompts = await configService.getAllPrompts(userId);
        const displayName = await configService.getUserDisplay(userId);
        console.log(`?? [getPrompts] User: ${displayName} | Prompts found: ${prompts.length}`);
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
                .from(configService.promptsTable)
                .update(promptData)
                .eq('id', id)
                .select();
        } else {
            // Insert new
            // Item #2: Feature limit check  max_prompts
            const features = await paymentService.getUserFeatures(userId);
            if (features.has_subscription && features.max_prompts < 999) {
                const { count } = await supabase
                    .from(configService.promptsTable)
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
                .from(configService.promptsTable)
                .insert(promptData)
                .select();
        }

        if (result.error) {
            console.error(`? [upsertPrompt] DB Error:`, result.error.message);
            throw result.error;
        }
        res.json({ success: true, data: result.data });
    } catch (error) {
        console.error(`? [upsertPrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const activatePrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.body;
        const result = await configService.setActivePrompt(id, userId);
        if (result && result.error) {
            console.error(`? [activatePrompt] Error:`, result.error.message);
            throw result.error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`? [activatePrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const updatePrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { name, content } = req.body;
        let query = supabase.from(configService.promptsTable).update({ name, content }).eq('id', id).eq('user_id', userId);
        const { error } = await query;
        if (error) {
            console.error(`? [updatePrompt] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`? [updatePrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const deletePrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        let query = supabase.from(configService.promptsTable).delete().eq('id', id).eq('user_id', userId);
        const { error } = await query;
        if (error) {
            console.error(`? [deletePrompt] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`? [deletePrompt] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getPrompts,
    upsertPrompt,
    activatePrompt,
    updatePrompt,
    deletePrompt
};

