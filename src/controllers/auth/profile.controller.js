const supabase = require('../../config/supabase');

const getProfile = async (req, res) => {
    try {
        const userId = req.userId; // Always from userAuth middleware
        const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
        if (error) throw error;
        res.json({ success: true, user: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.userId; // Always from userAuth middleware
        const updates = req.body;

        // Don't allow updating the ID itself
        delete updates.userId;
        delete updates.id;

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        res.json({ success: true, user: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getProfile, updateProfile };
