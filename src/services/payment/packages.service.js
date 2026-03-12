const supabase = require('../../config/supabase');

async function getAllPackages(userId = null) {
    const { data, error } = await supabase
        .from(this.packagesTable)
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });
    if (error) throw error;

    // Apply 80% discount for new users (if userId provided)
    if (userId) {
        const isNew = await this.isNewUser(userId);
        if (isNew) {
            return data.map(pkg => ({
                ...pkg,
                original_price: pkg.price,
                price: Math.round(pkg.price * 0.2), // 80% discount
                has_discount: true,
                discount_percentage: 80
            }));
        }
    }

    return data || [];
}

async function getPackageById(packageId, userId = null) {
    const { data, error } = await supabase
        .from(this.packagesTable)
        .select('*')
        .eq('id', packageId)
        .single();
    if (error) throw error;

    // Apply 80% discount for new users (if userId provided)
    if (userId) {
        const isNew = await this.isNewUser(userId);
        if (isNew) {
            return {
                ...data,
                original_price: data.price,
                price: Math.round(data.price * 0.2), // 80% discount
                has_discount: true,
                discount_percentage: 80
            };
        }
    }

    return data;
}

async function getPackageByName(name) {
    const { data, error } = await supabase
        .from(this.packagesTable)
        .select('*')
        .eq('name', name)
        .single();
    if (error) return null;
    return data;
}

/**
 * Checks if a user is eligible for the new user discount.
 * A user is "new" if they have never had a non-trial (paid) subscription.
 */
async function isNewUser(userId) {
    const { data, error } = await supabase
        .from(this.subscriptionsTable)
        .select('id')
        .eq('user_id', userId)
        .neq('payment_method', 'trial') // Trial doesn't count as "paid"
        .eq('status', 'active')         // Or has had active one in past?
        // Better check if they EVER paid.
        .or('status.eq.active,status.eq.expired')
        .limit(1);

    if (error) return false;
    return !data || data.length === 0;
}

module.exports = {
    getAllPackages,
    getPackageById,
    getPackageByName,
    isNewUser
};
