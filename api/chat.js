module.exports = async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({
            ok: true,
            provider: 'groq',
            hasApiKey: Boolean(process.env.GROQ_API_KEY)
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Missing GROQ_API_KEY in Vercel Environment Variables' });
    }

    let parsedBody;
    try {
        parsedBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (parseError) {
        return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    const messages = [];

    // Convert Gemini systemInstruction to OpenAI system message
    if (parsedBody?.systemInstruction) {
        const sysText = Array.isArray(parsedBody.systemInstruction.parts)
            ? parsedBody.systemInstruction.parts.map(p => p.text || '').join('\n').trim()
            : (typeof parsedBody.systemInstruction === 'string' ? parsedBody.systemInstruction : '');
        if (sysText) {
            messages.push({ role: 'system', content: sysText });
        }
    }

    // Convert Gemini contents array to OpenAI messages array
    if (Array.isArray(parsedBody?.contents)) {
        for (const item of parsedBody.contents) {
            const role = item.role === 'model' ? 'assistant' : (item.role || 'user');
            const text = Array.isArray(item.parts)
                ? item.parts.map(p => p.text || '').join('\n').trim()
                : (typeof item.content === 'string' ? item.content : '');
            if (text) {
                messages.push({ role, content: text });
            }
        }
    } else if (Array.isArray(parsedBody?.messages)) {
        messages.push(...parsedBody.messages);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages,
                temperature: 0.8,
                max_tokens: 1024
            }),
            signal: AbortSignal.timeout(8000)
        });

        const data = await response.json().catch(() => ({
            error: { message: `Non-JSON response from Groq (${response.status} ${response.statusText})` }
        }));

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        const replyText = data?.choices?.[0]?.message?.content || '';
        return res.status(200).json({
            candidates: [
                {
                    content: {
                        parts: [{ text: replyText }]
                    }
                }
            ]
        });
    } catch (error) {
        const status = error.name === 'TimeoutError' ? 504 : 500;
        return res.status(status).json({
            error: { message: error.message || 'Failed to reach Groq API' }
        });
    }
};
