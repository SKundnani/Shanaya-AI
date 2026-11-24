const MODELS = [
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({
            ok: true,
            hasApiKey: Boolean(process.env.GEMINI_API_KEY)
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel Environment Variables' });
    }

    let parsedBody;
    try {
        parsedBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (parseError) {
        return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    let lastStatus = 500;
    let lastError = { error: 'Failed to reach Gemini API' };

    for (let i = 0; i < MODELS.length; i++) {
        const model = MODELS[i];
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsedBody),
                    signal: AbortSignal.timeout(12000),
                }
            );

            const data = await response.json().catch(() => ({
                error: { message: `Non-JSON response from Gemini API (${response.status} ${response.statusText})` }
            }));

            if (response.ok) {
                return res.status(200).json(data);
            }

            lastStatus = response.status;
            lastError = data;

            // If 503 (overloaded), 429 (rate limit), or 404 (unavailable), wait 600ms and try next model
            if ([404, 429, 503].includes(response.status)) {
                if (i < MODELS.length - 1) {
                    await sleep(600);
                }
                continue;
            }

            // For other client errors (like 400 Bad Request), return immediately
            return res.status(response.status).json(data);
        } catch (error) {
            lastStatus = error.name === 'TimeoutError' ? 504 : 500;
            lastError = { error: error.message || 'Request failed' };
            if (i < MODELS.length - 1) {
                await sleep(600);
            }
        }
    }

    return res.status(lastStatus).json(lastError);
};
