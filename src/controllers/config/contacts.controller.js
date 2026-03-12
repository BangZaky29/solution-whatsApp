const configService = require('../../services/common/config.service');
const paymentService = require('../../services/payment/payment.service');
const supabase = require('../../config/supabase');

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
        console.log(`?? [addContact] Header ID: ${userId} | JID: ${jid}`);

        // 1. Validasi: Jangan biarkan userId kosong atau string "null"/"undefined"
        if (!userId || userId === 'null' || userId === 'undefined') {
            console.error("? [addContact] User ID is missing or invalid string");
            return res.status(400).json({
                success: false,
                error: 'Header x-session-id wajib diisi dengan UUID yang valid.'
            });
        }

        // Item #2: Feature limit check  max_contacts
        const features = await paymentService.getUserFeatures(userId);
        if (features.max_contacts < 999) {
            const { count } = await supabase
                .from(configService.contactsTable)
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
            console.error(`? [addContact] Supabase Error:`, result.error.message);

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
        console.log(`? [addContact] Berhasil nambahin kontak buat user: ${displayName}`);
        res.json({ success: true });

    } catch (error) {
        console.error(`? [addContact] Catch Exception:`, error.message);
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
        let query = supabase.from(configService.contactsTable).update({ push_name: name }).eq('jid', jid).eq('user_id', userId);
        const { error } = await query;
        if (error) {
            console.error(`? [updateContact] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`? [updateContact] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteContact = async (req, res) => {
    try {
        const userId = req.userId;
        const { error } = await configService.removeContact(req.params.jid, userId);
        if (error) {
            console.error(`? [deleteContact] Error:`, error.message);
            throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error(`? [deleteContact] Catch:`, error.message);
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

module.exports = {
    getContacts,
    addContact,
    updateContact,
    deleteContact,
    updateTargetMode
};

