import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function createGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Please set it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

function getErrorStatus(err) {
  const errorObj = err || {};
  if (typeof errorObj.status === 'number' && errorObj.status >= 400) return errorObj.status;
  if (typeof errorObj.code === 'number' && errorObj.code >= 400) return errorObj.code;
  if (typeof errorObj.message === 'string') {
    try {
      const parsed = JSON.parse(errorObj.message);
      if (typeof parsed?.error?.code === 'number') return parsed.error.code;
    } catch {
      // Not JSON
    }
  }
  return 500;
}

async function withRetry(fn, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = getErrorStatus(err);
      const retryable = status === 500 || status === 503 || (status === 429 && attempt === 0);
      if (!retryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 800 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function callModelJson(ai, model, parts, systemInstruction, responseSchema) {
  const config = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema,
  };
  if (model === PRIMARY_MODEL) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config,
    })
  );

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned an unexpected format. Please try again.');
  }
}

async function generateStructuredJson(parts, systemInstruction, responseSchema) {
  const ai = createGeminiClient();
  try {
    return await callModelJson(ai, PRIMARY_MODEL, parts, systemInstruction, responseSchema);
  } catch (err) {
    const status = getErrorStatus(err);
    const shouldFallback = status === 429 || status === 503 || status === 404;
    if (!shouldFallback) {
      throw err;
    }
    console.warn(`Primary model ${PRIMARY_MODEL} returned ${status}; falling back to ${FALLBACK_MODEL}.`);
    return await callModelJson(ai, FALLBACK_MODEL, parts, systemInstruction, responseSchema);
  }
}

function extractCleanErrorMessage(rawMessage) {
  try {
    const parsed = JSON.parse(rawMessage);
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not JSON
  }
  return rawMessage;
}

function handleApiError(res, error) {
  const rawMessage = error?.message || 'Could not reach Gemini API.';
  const cleanMessage = extractCleanErrorMessage(rawMessage);
  const status = getErrorStatus(error);
  const lower = cleanMessage.toLowerCase();

  console.error(`Gemini API error (${status}):`, cleanMessage);

  if (
    status === 403 ||
    cleanMessage.includes('API_KEY_INVALID') ||
    cleanMessage.includes('PERMISSION_DENIED') ||
    lower.includes('api key')
  ) {
    return res.status(status === 500 ? 401 : status).json({
      error: 'Invalid or missing Gemini API key. Check Settings > Secrets.',
    });
  }
  if (status === 429 || cleanMessage.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({
      error:
        'Gemini API quota or rate limit reached. Wait a moment and try again, or select a billing-enabled API key in Settings > Secrets.',
    });
  }
  if (status === 503 || cleanMessage.includes('UNAVAILABLE')) {
    return res.status(503).json({
      error: 'Gemini is temporarily busy due to high demand. Please try again in a few seconds.',
    });
  }
  return res.status(status).json({ error: cleanMessage });
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'Uploaded files are too large. Please keep total upload size under 18 MB.',
      });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON request payload.' });
    }
    return next(err);
  });

  app.post('/api/study/notes', async (req, res) => {
    try {
      const { topic, sourceNotes, files, hasValidContent } = parseStudyRequest(req.body);
      if (!hasValidContent) {
        return res.status(400).json({ error: 'Please enter a topic, paste notes, or upload a non-empty file.' });
      }

      const parts = buildStudyParts(
        'Create clear, structured study notes based on the provided material.',
        topic,
        sourceNotes,
        files
      );
      const notes = await generateStructuredJson(
        parts,
        'You are a helpful academic tutor. Write concise, accurate study notes with concrete examples.',
        NOTES_SCHEMA
      );
      if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
        throw new Error('Could not generate valid study notes. Please try again.');
      }
      return res.json({ notes });
    } catch (error) {
      return handleApiError(res, error);
    }
  });

  app.post('/api/study/flashcards', async (req, res) => {
    try {
      const { topic, sourceNotes, files, hasValidContent } = parseStudyRequest(req.body);
      if (!hasValidContent) {
        return res.status(400).json({ error: 'Please enter a topic, paste notes, or upload a non-empty file.' });
      }

      const parts = buildStudyParts(
        'Create 8 active-recall study flashcards based on the provided material.',
        topic,
        sourceNotes,
        files
      );
      const cards = await generateStructuredJson(
        parts,
        'Create clear study flashcards: a specific question on the front, a short 1-3 sentence answer on the back, and a brief hint.',
        FLASHCARDS_SCHEMA
      );
      if (!Array.isArray(cards) || cards.length === 0) {
        throw new Error('Could not generate flashcards. Please try again.');
      }

      const flashcards = cards.map((card, index) => ({
        id: `card-${Date.now()}-${index}`,
        front: String(card?.front ?? ''),
        back: String(card?.back ?? ''),
        hint: String(card?.hint ?? ''),
      }));
      return res.json({ flashcards });
    } catch (error) {
      return handleApiError(res, error);
    }
  });

  app.get('/styles.css', (_req, res) => {
    res.sendFile(path.join(__dirname, 'styles.css'));
  });

  app.get('/app.js', (_req, res) => {
    res.sendFile(path.join(__dirname, 'app.js'));
  });

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found.' });
    }
    return res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyDesk running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
