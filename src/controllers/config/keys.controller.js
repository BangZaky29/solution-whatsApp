const configService = require('../../services/common/config.service');
const paymentService = require('../../services/payment/payment.service');
const supabase = require('../../config/supabase');

const getKeys = async (req, res) => {
    try {
        const userId = req.userId;
        const keys = await configService.getAllApiKeys(userId);
        const displayName = await configService.getUserDisplay(userId);
        console.log(`✅ [getKeys] User: ${displayName} | Keys found: ${keys.length}`);
        res.json({ success: true, keys });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addKey = async (req, res) => {
    try {
        const userId = req.userId;
        const { name, key, model, version } = req.body;

        // Item #2: Feature limit check  max_api_keys
        const features = await paymentService.getUserFeatures(userId);
        if (features.max_api_keys === 0) {
            return res.status(403).json({
                success: false,
                error: 'Paket Anda tidak mendukung BYOK (Bring Your Own Key). Upgrade ke Premium atau Pro.'
            });
        }
        if (features.has_subscription && features.max_api_keys < 999) {
            const { count } = await supabase
                .from(configService.apiKeysTable)
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

module.exports = {
    getKeys,
    addKey,
    updateKey,
    deleteKey,
    activateKey
};

