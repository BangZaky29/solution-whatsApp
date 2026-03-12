const historyService = require('../../services/common/history.service');
const supabase = require('../../config/supabase');

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

module.exports = { getHistory, deleteHistory };
