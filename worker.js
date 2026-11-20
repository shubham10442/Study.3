const MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

const NOTES_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topicTitle: { type: 'STRING' },
    subject: { type: 'STRING' },
    overview: { type: 'STRING' },
    keyConcepts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          explanation: { type: 'STRING' },
          example: { type: 'STRING' },
        },
        required: ['title', 'explanation', 'example'],
      },
    },
    commonMistakes: { type: 'ARRAY', items: { type: 'STRING' } },
    takeaways: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['topicTitle', 'subject', 'overview', 'keyConcepts', 'commonMistakes', 'takeaways'],
};

const FLASHCARDS_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      front: { type: 'STRING' },
      back: { type: 'STRING' },
      hint: { type: 'STRING' },
    },
    required: ['front', 'back', 'hint'],
  },
};

function buildParts(instruction, body = {}) {
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const sourceNotes = typeof body.sourceNotes === 'string' ? body.sourceNotes.trim() : '';
  const files = Array.isArray(body.files)
    ? body.files.filter((f) => f && typeof f.data === 'string' && f.data.trim())
    : [];

  if (!topic && !sourceNotes && files.length === 0) return null;

  const parts = [];
  for (const file of files) {
    if (file.isText) {
      parts.push({ text: `File (${file.name || 'attachment'}):\n${file.data}` });
    } else if (typeof file.mimeType === 'string' && file.mimeType.trim()) {
      parts.push({ inlineData: { mimeType: file.mimeType.trim(), data: file.data } });
    }
  }

  const lines = [instruction];
  if (topic) lines.push(`Topic: ${topic}`);
  if (sourceNotes) lines.push(`Notes:\n${sourceNotes}`);
  parts.push({ text: lines.join('\n\n') });
  return parts;
}

async function callGeminiModel(model, apiKey, parts, systemInstruction, responseSchema) {
  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema,
  };
  if (model === 'gemini-4-hydrogen') {
    generationConfig.thinkingConfig = { thinkingLevel: 'LOW' };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig,
      }),
    }
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error?.message || `Gemini API error (${res.status})`);
    err.status = res.status;
    throw err;
  }

  const responseParts = payload?.candidates?.[0]?.content?.parts || [];
  const rawText = responseParts
    .filter((p) => typeof p?.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/, '')
    .trim();

  if (!rawText) {
    const err = new Error('Gemini returned an empty response. Please try again.');
    err.status = 502;
    throw err;
  }

  return JSON.parse(rawText);
}

async function askGeminiWithFallback(apiKey, parts, systemInstruction, responseSchema) {
  let lastError;
  for (const model of MODELS) {
    try {
      return await callGeminiModel(model, apiKey, parts, systemInstruction, responseSchema);
    } catch (err) {
      lastError = err;
      const status = err?.status || 500;
      if (status !== 404 && status !== 429 && status !== 503) {
        throw err;
      }
    }
  }
  throw lastError;
}

async function handleStudyApi(type, request, env) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }

  const apiKey = (env?.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return Response.json(
      { error: 'GEMINI_API_KEY is missing. Add it under Worker Settings > Variables and Secrets.' },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  const instruction =
    type === 'notes'
      ? 'Create clear, structured study notes based on the provided material.'
      : 'Create 8 active-recall study flashcards based on the provided material.';

  const parts = buildParts(instruction, body);
  if (!parts) {
    return Response.json(
      { error: 'Please enter a topic, paste notes, or upload a non-empty file.' },
      { status: 400 }
    );
  }

  try {
    if (type === 'notes') {
      const notes = await askGeminiWithFallback(
        apiKey,
        parts,
        'You are a helpful academic tutor. Write concise, accurate study notes with concrete examples.',
        NOTES_SCHEMA
      );
      return Response.json({ notes });
    }

    const cards = await askGeminiWithFallback(
      apiKey,
      parts,
      'Create clear study flashcards: a specific question on the front, a short 1-3 sentence answer on the back, and a brief hint.',
      FLASHCARDS_SCHEMA
    );
    const flashcards = (Array.isArray(cards) ? cards : []).map((card, i) => ({
      id: `card-${Date.now()}-${i}`,
      front: String(card?.front ?? ''),
      back: String(card?.back ?? ''),
      hint: String(card?.hint ?? ''),
    }));
    return Response.json({ flashcards });
  } catch (err) {
    const status = err?.status || 500;
    const message = err?.message || 'Could not reach Gemini API.';

    if (status === 401 || status === 403 || message.includes('API_KEY_INVALID') || message.toLowerCase().includes('api key')) {
      return Response.json({ error: 'Invalid GEMINI_API_KEY. Check your Worker Settings > Variables and Secrets.' }, { status: 401 });
    }
    if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
      return Response.json({ error: 'Rate limit reached. Please wait a moment and try again.' }, { status: 429 });
    }
    if (status === 503 || message.includes('UNAVAILABLE')) {
      return Response.json({ error: 'Gemini is temporarily busy. Please try again shortly.' }, { status: 503 });
    }
    return Response.json({ error: message }, { status });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/study/notes') {
      return handleStudyApi('notes', request, env);
    }
    if (url.pathname === '/api/study/flashcards') {
      return handleStudyApi('flashcards', request, env);
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'API endpoint not found.' }, { status: 404 });
    }

    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
};
