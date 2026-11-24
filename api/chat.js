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

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsedBody),
            }
        );

        const data = await response.json().catch(() => ({
            error: { message: `Non-JSON response from Gemini API (${response.status} ${response.statusText})` }
        }));

        return res.status(response.status).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to reach Gemini API' });
    }
};
