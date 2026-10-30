// Public, read-only: is the site in maintenance mode, until when and which sections? Asked by the edge function
// (edge-functions/maintenance.ts) before serving pages, through functions/maintenance-state.js. Never exposes the
// owner's bypass token, only its hash. Netlify's CDN keeps the answer a few seconds so this runs rarely even with traffic.
const { readMaintenance, isActive, sha256, cleanPages } = require('./maintenance');

exports.handler = async () => {
    let body = { on: false, until: null, pages: null, bypassHash: null };
    try {
        const s = await readMaintenance();
        if (isActive(s)) body = { on: true, until: s.until || null, pages: cleanPages(s.pages), bypassHash: s.bypass ? sha256(s.bypass) : null };
    } catch (err) {
        console.error('maintenance-state', err); // answering "off" keeps the site up if the store fails
    }
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'public, s-maxage=5' },
        body: JSON.stringify(body)
    };
};
