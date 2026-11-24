const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRY_DELAYS = [1000, 2000];
const MAX_ATTEMPTS = 3;

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

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsedBody),
                    signal: AbortSignal.timeout(15000),
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

            // Retry specifically on 503 (high demand) or 429 (rate limit)
            if (response.status === 503 || response.status === 429) {
                if (attempt < MAX_ATTEMPTS - 1) {
                    await sleep(RETRY_DELAYS[attempt]);
                    continue;
                }
            } else {
                // For other non-retryable errors (e.g. 400, 401, 403), return immediately
                return res.status(response.status).json(data);
            }
        } catch (error) {
            lastStatus = error.name === 'TimeoutError' ? 504 : 500;
            lastError = { error: error.message || 'Request failed' };
            if (attempt < MAX_ATTEMPTS - 1) {
                await sleep(RETRY_DELAYS[attempt]);
                continue;
            }
        }
    }

    return res.status(lastStatus).json(lastError);
};
