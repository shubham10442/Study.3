const DEFAULT_MODEL = 'gemini-4-hydrogen';

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

function getCorsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env?.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(payload, status, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
    },
  });
}

function parseStudyRequest(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const topic = typeof raw.topic === 'string' ? raw.topic : '';
  const sourceNotes = typeof raw.sourceNotes === 'string' ? raw.sourceNotes : '';
  const files = Array.isArray(raw.files)
    ? raw.files.filter((f) => f && typeof f.data === 'string' && f.data.trim().length > 0)
    : [];
  const hasValidContent = Boolean(topic.trim() || sourceNotes.trim() || files.length > 0);
  return { topic, sourceNotes, files, hasValidContent };
}

function buildStudyParts(instruction, topic = '', sourceNotes = '', files = []) {
  const parts = [];

  for (const file of files) {
    if (!file || typeof file.data !== 'string' || !file.data.trim()) continue;
    if (file.isText) {
      parts.push({ text: `File (${file.name || 'attachment'}):\n${file.data}` });
    } else if (typeof file.mimeType === 'string' && file.mimeType.trim()) {
      parts.push({ inlineData: { mimeType: file.mimeType.trim(), data: file.data } });
    }
  }

  const textLines = [instruction];
  if (topic.trim()) textLines.push(`Topic: ${topic.trim()}`);
  if (sourceNotes.trim()) textLines.push(`Notes:\n${sourceNotes.trim()}`);

  parts.push({ text: textLines.join('\n\n') });
  return parts;
}

async function callGemini({ apiKey, model, parts, systemInstruction, responseSchema }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const maxRetries = 3;
  let lastStatus = 500;
  let lastMessage = 'Could not reach Gemini API.';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: requestBody,
    });

    const data = await response.json().catch(() => null);

    if (response.ok) {
      const rawText = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();

      if (!rawText) {
        const err = new Error('Gemini returned an empty response. Please try again.');
        err.status = 502;
        throw err;
      }

      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch {
        const err = new Error('Gemini returned an unexpected format. Please try again.');
        err.status = 502;
        throw err;
      }
    }

    lastStatus = response.status;
    lastMessage = data?.error?.message || `Gemini API error (${response.status}).`;

    const retryable = lastStatus === 429 || lastStatus === 500 || lastStatus === 503;
    if (!retryable || attempt === maxRetries) {
      const err = new Error(lastMessage);
      err.status = lastStatus;
      throw err;
    }

    await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
  }

  const err = new Error(lastMessage);
  err.status = lastStatus;
  throw err;
}

function mapErrorResponse(error, corsHeaders) {
  const message = error?.message || 'Could not reach Gemini API.';
  const status = typeof error?.status === 'number' && error.status >= 400 ? error.status : 500;
  const lower = message.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    message.includes('API_KEY_INVALID') ||
    message.includes('PERMISSION_DENIED') ||
    lower.includes('api key')
  ) {
    return jsonResponse(
      { error: 'Invalid or missing GEMINI_API_KEY. Set it in Cloudflare Pages > Settings > Variables and Secrets.' },
      status === 500 ? 401 : status,
      corsHeaders
    );
  }
  if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
    return jsonResponse(
      { error: 'Rate limit reached. Please wait a moment and try again.' },
      429,
      corsHeaders
    );
  }
  if (status === 503 || message.includes('UNAVAILABLE')) {
    return jsonResponse(
      { error: 'Gemini is temporarily busy due to high demand. Please try again in a few seconds.' },
      503,
      corsHeaders
    );
  }
  return jsonResponse({ error: message }, status, corsHeaders);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.env),
  });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const corsHeaders = getCorsHeaders(env);
  const type = params?.type;

  if (type !== 'notes' && type !== 'flashcards') {
    return jsonResponse({ error: 'API endpoint not found.' }, 404, corsHeaders);
  }

  const apiKey = env?.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: 'GEMINI_API_KEY is missing. Add it in Cloudflare Pages > Settings > Variables and Secrets.' },
      401,
      corsHeaders
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request payload.' }, 400, corsHeaders);
  }

  const { topic, sourceNotes, files, hasValidContent } = parseStudyRequest(body);
  if (!hasValidContent) {
    return jsonResponse(
      { error: 'Please enter a topic, paste notes, or upload a non-empty file.' },
      400,
      corsHeaders
    );
  }

  const model = env?.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    if (type === 'notes') {
      const parts = buildStudyParts(
        'Create clear, structured study notes based on the provided material.',
        topic,
        sourceNotes,
        files
      );
      const notes = await callGemini({
        apiKey,
        model,
        parts,
        systemInstruction:
          'You are a helpful academic tutor. Write concise, accurate study notes with concrete examples.',
        responseSchema: NOTES_SCHEMA,
      });
      if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
        throw new Error('Could not generate valid study notes. Please try again.');
      }
      return jsonResponse({ notes }, 200, corsHeaders);
    }

    const parts = buildStudyParts(
      'Create 8 active-recall study flashcards based on the provided material.',
      topic,
      sourceNotes,
      files
    );
    const cards = await callGemini({
      apiKey,
      model,
      parts,
      systemInstruction:
        'Create clear study flashcards: a specific question on the front, a short 1-3 sentence answer on the back, and a brief hint.',
      responseSchema: FLASHCARDS_SCHEMA,
    });
    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('Could not generate flashcards. Please try again.');
    }

    const flashcards = cards.map((card, index) => ({
      id: `card-${Date.now()}-${index}`,
      front: String(card?.front ?? ''),
      back: String(card?.back ?? ''),
      hint: String(card?.hint ?? ''),
    }));
    return jsonResponse({ flashcards }, 200, corsHeaders);
  } catch (error) {
    return mapErrorResponse(error, corsHeaders);
  }
}
