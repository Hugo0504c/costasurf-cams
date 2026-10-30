// Runs a Lambda-style handler (exports.handler(event) → { statusCode, headers, body }) as a modern (v2) Netlify
// function. v2 functions get the Netlify Blobs context automatically, with strong consistency available.
export const asV2 = handler => async req => {
    const url = new URL(req.url);
    const event = {
        httpMethod: req.method,
        headers: Object.fromEntries(req.headers), // keys come lowercase
        queryStringParameters: Object.fromEntries(url.searchParams),
        body: req.method === 'GET' || req.method === 'HEAD' ? null : await req.text()
    };
    const res = await handler(event);
    return new Response(res.body ?? null, { status: res.statusCode, headers: res.headers });
};
