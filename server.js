import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

const app = express();
app.use(express.json({ limit: '25mb' }));

// Allow requests from a GitHub Pages frontend (or any origin)
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Return clean JSON for oversized or invalid JSON requests
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Uploaded files are too large (keep total under 18 MB).' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON request.' });
  }
  next(err);
});

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
    // Ignore non-JSON error messages
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

async function askGeminiJson(parts, systemInstruction, responseSchema) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  async function runModel(model) {
    const config = { systemInstruction, responseMimeType: 'application/json', responseSchema };
    if (model === PRIMARY_MODEL) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    const response = await ai.models.generateContent({ model, contents: { parts }, config });
    const text = (response.text || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    if (!text) throw new Error('Gemini returned an empty response. Please try again.');
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

function sendError(res, err) {
  const status = getErrorStatus(err);
  let message = err?.message || 'Could not reach Gemini API.';
  try {
    message = JSON.parse(message)?.error?.message || message;
  } catch {
    // Plain string message
  }

  console.error(`API Error (${status}):`, message);

  if (status === 403 || message.includes('API_KEY_INVALID') || message.toLowerCase().includes('api key')) {
    return res.status(401).json({ error: 'Invalid or missing GEMINI_API_KEY.' });
  }
  if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({ error: 'Rate limit reached. Please wait a moment and try again.' });
  }
  return res.status(status).json({ error: message });
}

// Health check endpoint (open /api/health in browser to verify backend is live)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/study/notes', async (req, res) => {
  try {
    const parts = buildParts('Create clear, structured study notes based on the provided material.', req.body);
    if (!parts) {
      return res.status(400).json({ error: 'Please enter a topic, paste notes, or upload a non-empty file.' });
    }
    const notes = await askGeminiJson(
      parts,
      'You are a helpful academic tutor. Write concise, accurate study notes with concrete examples.',
      NOTES_SCHEMA
    );
    res.json({ notes });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/study/flashcards', async (req, res) => {
  try {
    const parts = buildParts('Create 8 active-recall study flashcards based on the provided material.', req.body);
    if (!parts) {
      return res.status(400).json({ error: 'Please enter a topic, paste notes, or upload a non-empty file.' });
    }
    const cards = await askGeminiJson(
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
    res.json({ flashcards });
  } catch (err) {
    sendError(res, err);
  }
});

// Serve frontend files directly when running locally or on a single host
app.get('/styles.css', (_req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`StudyDesk backend running on port ${PORT}`);
});
