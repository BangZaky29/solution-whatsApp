const paymentService = require('../../services/payment/payment.service');
const supabase = require('../../config/supabase');

const getLogs = async (req, res) => {
    try {
        const userId = req.userId; // userAuth middleware attaches it here
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const features = await paymentService.getUserFeatures(userId);
        const isDev = process.env.NODE_ENV === 'development';

        //  Bypass Check: Admins & Developer Numbers 
        const { data: user } = await supabase
            .from('users')
            .select('role, phone')
            .eq('id', userId)
            .single();

        const isAdmin = user?.role === 'admin';
        const isDeveloper = user?.phone === process.env.DEVELOPER_WA_NUMBER;
        const isExplicitAdmin = userId === 'bfccbe71-7f5f-4d2c-b98b-1b1449341596';

        if (!features.log_monitor_enabled && !isDev && !isAdmin && !isDeveloper && !isExplicitAdmin) {
            console.warn(`✅ [getLogs] Access Denied for ${userId}. Role: ${user?.role}, Phone: ${user?.phone}, DevNo: ${process.env.DEVELOPER_WA_NUMBER}`);
            return res.status(403).json({
                success: false,
                error: 'Feature not included in package',
                debug: isExplicitAdmin ? 'Unexpected bypass failure' : 'Permissions check failed'
            });
        }

        const { data, error } = await supabase
            .from('wa_bot_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Reverse to get chronological order for UI
        res.json({ success: true, logs: data.reverse() });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch logs' });
    }
};

module.exports = { getLogs };

