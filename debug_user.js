const supabase = require('./src/config/supabase');
require('dotenv').config();

async function checkUser() {
    const userId = 'bfccbe71-7f5f-4d2c-b98b-1b1449341596';
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching user:', error);
    } else {
        console.log('User Record:', JSON.stringify(user, null, 2));
    }

    console.log('DEVELOPER_WA_NUMBER from env:', process.env.DEVELOPER_WA_NUMBER);
}

checkUser();
