// Deletes the logged-in user's account: their favourites and their Supabase auth user (email, name, alert settings).
// Only the server can delete an auth user (needs the service role key). The user is taken from their own session
// token, never from anything else in the request, so nobody can delete someone else's account.
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
});

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Not logged in' });
    const { data, error: authError } = await supabase.auth.getUser(token);
    if (authError || !data.user) return json(401, { error: 'Not logged in' });
    const userId = data.user.id;

    try {
        const { error: favError } = await supabase.from('favorites').delete().eq('user_id', userId);
        if (favError) throw new Error('favorites: ' + favError.message);
        const { error: delError } = await supabase.auth.admin.deleteUser(userId);
        if (delError) throw new Error('auth: ' + delError.message);
        console.log('Cuenta borrada:', userId);
        return json(200, { ok: true });
    } catch (err) {
        console.error('delete-account', userId, err);
        return json(500, { error: 'Could not delete the account' });
    }
};
