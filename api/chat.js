module.exports = async function handler(req, res) {
    if (req.method === 'GET') {
        const isTest = req.query?.test === '1' || (req.url && new URL(req.url, 'http://localhost').searchParams.get('test') === '1');
        if (isTest) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel Environment Variables' });
            }
            try {
                const testRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
                        signal: AbortSignal.timeout(7000),
                    }
                );
                const testData = await testRes.json().catch(() => ({
                    error: { message: `Non-JSON response (${testRes.status} ${testRes.statusText})` }
                }));
                return res.status(testRes.status).json(testData);
            } catch (err) {
                return res.status(err.name === 'TimeoutError' ? 504 : 500).json({
                    error: { message: err.message || 'Test request failed' }
                });
            }
        }

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

    const callGemini = async (model) => {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsedBody),
                signal: AbortSignal.timeout(7000),
            }
        );

        const data = await response.json().catch(() => ({
            error: { message: `Non-JSON response from Gemini API (${response.status} ${response.statusText})` }
        }));

        return { response, data };
    };

    let primaryResult;
    try {
        primaryResult = await callGemini('gemini-3.8-flash');
        if (primaryResult.response.ok) {
            return res.status(200).json(primaryResult.data);
        }
    } catch (err) {
        primaryResult = {
            response: { status: err.name === 'TimeoutError' ? 504 : 500, ok: false },
            data: { error: { message: err.message || 'Request timed out' } }
        };
    }

    // If 503 or 429, immediately try gemini-3.8-flash-lite as fast fallback
    if (primaryResult.response.status === 503 || primaryResult.response.status === 429) {
        try {
            const fallbackResult = await callGemini('gemini-3.8-flash-lite');
            return res.status(fallbackResult.response.status).json(fallbackResult.data);
        } catch (err) {
            return res.status(err.name === 'TimeoutError' ? 504 : 500).json({
                error: { message: err.message || 'Fallback request failed' }
            });
        }
    }

    // For other failures (400, 401, 403, etc.), return the exact status and error JSON
    return res.status(primaryResult.response.status).json(primaryResult.data);
};
