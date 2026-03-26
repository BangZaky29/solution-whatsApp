const { createClient } = require('@supabase/supabase-js');

// Project 1: Gateway/Bot DB (For Sessions)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Project 2: Warlok App DB (For Payments & Referral Codes)
const warlokUrl = process.env.WARLOK_SUPABASE_URL;
const warlokKey = process.env.WARLOK_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials for Gateway DB.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

// Attach warlokSupabase as a property for backward compatibility or named export
let warlokSupabase = supabase; // Fallback

if (warlokUrl && warlokKey) {
    warlokSupabase = createClient(warlokUrl, warlokKey, {
        auth: { persistSession: false }
    });
    console.log('✅ Warlok Supabase Client Initialized');
}

// Export the primary client as the main module
module.exports = supabase;

// Also export named versions
module.exports.supabase = supabase;
module.exports.warlokSupabase = warlokSupabase;
