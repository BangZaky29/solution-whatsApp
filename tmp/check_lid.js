const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUser() {
    const id = '244654826065990';
    console.log(`Checking user: ${id}`);
    
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`phone.eq.${id},id.eq.${id},username.eq.${id}`);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('User found:', data);
    }
}

checkUser();
