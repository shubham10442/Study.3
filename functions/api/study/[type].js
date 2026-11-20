import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

const NOTES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    topicTitle: { type: Type.STRING },
    subject: { type: Type.STRING },
    overview: { type: Type.STRING },
    keyConcepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          explanation: { type: Type.STRING },
          example: { type: Type.STRING },
        },
        required: ['title', 'explanation', 'example'],
      },
    },
    commonMistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
    takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['topicTitle', 'subject', 'overview', 'keyConcepts', 'commonMistakes', 'takeaways'],
};

const FLASHCARDS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      front: { type: Type.STRING },
      back: { type: Type.STRING },
      hint: { type: Type.STRING },
    },
    required: ['front', 'back', 'hint'],
  },
};

function getErrorStatus(err) {
  if (typeof err?.status === 'number' && err.status >= 400) return err.status;
  if (typeof err?.code === 'number' && err.code >= 400) return err.code;
  try {
    const parsed = JSON.parse(err?.message || '');
    if (typeof parsed?.error?.code === 'number') return parsed.error.code;
  } catch {
    // Non-JSON message
  }
  return 500;
}

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

async function askGeminiJson(apiKey, parts, systemInstruction, responseSchema) {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  async function runModel(model) {
    const config = { systemInstruction, responseMimeType: 'application/json', responseSchema };
    if (model === PRIMARY_MODEL) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    const response = await ai.models.generateContent({ model, contents: { parts }, config });
    const text = (response.text || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    if (!text) throw new Error('Empty response from Gemini. Please try again.');
    return JSON.parse(text);
  }

  try {
    return await runModel(PRIMARY_MODEL);
  } catch (err) {
    const status = getErrorStatus(err);
    if (status === 429 || status === 503 || status === 404) {
      return await runModel(FALLBACK_MODEL);
    }
    throw err;
  }
}

export async function generateStudyResponse(type, body, apiKey) {
  if (type !== 'notes' && type !== 'flashcards') {
    return { status: 404, data: { error: 'API endpoint not found.' } };
  }

  if (!apiKey) {
    return { status: 401, data: { error: 'GEMINI_API_KEY is not configured.' } };
  }

  const instruction =
    type === 'notes'
      ? 'Create clear, structured study notes based on the provided material.'
      : 'Create 8 active-recall study flashcards based on the provided material.';

  const parts = buildParts(instruction, body);
  if (!parts) {
    return { status: 400, data: { error: 'Please enter a topic, paste notes, or upload a non-empty file.' } };
  }

  try {
    if (type === 'notes') {
      const notes = await askGeminiJson(
        apiKey,
        parts,
        'You are a helpful academic tutor. Write concise, accurate study notes with concrete examples.',
        NOTES_SCHEMA
      );
      return { status: 200, data: { notes } };
    }

    const cards = await askGeminiJson(
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
    return { status: 200, data: { flashcards } };
  } catch (err) {
    const status = getErrorStatus(err);
    let message = err?.message || 'Could not reach Gemini API.';
    try {
      message = JSON.parse(message)?.error?.message || message;
    } catch {
      // Plain string message
    }

    if (status === 403 || message.includes('API_KEY_INVALID') || message.toLowerCase().includes('api key')) {
      return { status: 401, data: { error: 'Invalid or missing GEMINI_API_KEY.' } };
    }
    if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
      return { status: 429, data: { error: 'Rate limit reached. Please wait a moment and try again.' } };
    }
    if (status === 503 || message.includes('UNAVAILABLE')) {
      return { status: 503, data: { error: 'Service temporarily busy. Please try again shortly.' } };
    }
    return { status, data: { error: message } };
  }
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  const { status, data } = await generateStudyResponse(
    context.params.type,
    body,
    context.env.GEMINI_API_KEY
  );
  return Response.json(data, { status });
}
