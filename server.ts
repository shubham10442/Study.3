import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = 'gemini-4-hydrogen';

function createGeminiClient(): GoogleGenAI {
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

interface UploadedFile {
  name: string;
  mimeType: string;
  data: string;
  isText?: boolean;
}

type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const retryable = status === 429 || status === 500 || status === 503;
      if (!retryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 800 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function generateStructuredJson(
  parts: ContentPart[],
  systemInstruction: string,
  responseSchema: Record<string, unknown>
) {
  const ai = createGeminiClient();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
      },
    })
  );

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

function extractCleanErrorMessage(rawMessage: string): string {
  try {
    const parsed = JSON.parse(rawMessage) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not JSON
  }
  return rawMessage;
}

function handleApiError(res: Response, error: unknown) {
  const err = (error || {}) as { status?: number; message?: string };
  const rawMessage = err.message || 'Could not reach Gemini API.';
  const cleanMessage = extractCleanErrorMessage(rawMessage);
  const status = typeof err.status === 'number' && err.status >= 400 ? err.status : 500;

  if (status === 400 || status === 403 || cleanMessage.includes('API_KEY_INVALID') || cleanMessage.includes('PERMISSION_DENIED')) {
    return res.status(status).json({ error: 'Invalid or missing Gemini API key. Check Settings > Secrets.' });
  }
  if (status === 429 || cleanMessage.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({ error: 'Rate limit reached. Please wait a moment and try again.' });
  }
  if (status === 503 || cleanMessage.includes('UNAVAILABLE')) {
    return res.status(503).json({ error: 'Gemini is temporarily busy due to high demand. Please try again in a few seconds.' });
  }
  return res.status(status).json({ error: cleanMessage });
}

function buildStudyParts(
  instruction: string,
  topic = '',
  sourceNotes = '',
  files: UploadedFile[] = []
): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const file of files) {
    if (!file || !file.data) continue;
    if (file.isText) {
      parts.push({ text: `File (${file.name}):\n${file.data}` });
    } else if (file.mimeType) {
      parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    }
  }

  const textLines: string[] = [instruction];
  if (topic.trim()) textLines.push(`Topic: ${topic.trim()}`);
  if (sourceNotes.trim()) textLines.push(`Notes:\n${sourceNotes.trim()}`);

  parts.push({ text: textLines.join('\n\n') });
  return parts;
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

  app.post('/api/study/notes', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        topic?: string;
        sourceNotes?: string;
        files?: UploadedFile[];
      };
      const topic = typeof body.topic === 'string' ? body.topic : '';
      const sourceNotes = typeof body.sourceNotes === 'string' ? body.sourceNotes : '';
      const files = Array.isArray(body.files) ? body.files : [];

      if (!topic.trim() && !sourceNotes.trim() && files.length === 0) {
        return res.status(400).json({ error: 'Please enter a topic, paste notes, or upload a file.' });
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
      return res.json({ notes });
    } catch (error) {
      return handleApiError(res, error);
    }
  });

  app.post('/api/study/flashcards', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        topic?: string;
        sourceNotes?: string;
        files?: UploadedFile[];
      };
      const topic = typeof body.topic === 'string' ? body.topic : '';
      const sourceNotes = typeof body.sourceNotes === 'string' ? body.sourceNotes : '';
      const files = Array.isArray(body.files) ? body.files : [];

      if (!topic.trim() && !sourceNotes.trim() && files.length === 0) {
        return res.status(400).json({ error: 'Please enter a topic, paste notes, or upload a file.' });
      }

      const parts = buildStudyParts(
        'Create 8 active-recall study flashcards based on the provided material.',
        topic,
        sourceNotes,
        files
      );
      const cards = (await generateStructuredJson(
        parts,
        'Create clear study flashcards: a specific question on the front, a short 1-3 sentence answer on the back, and a brief hint.',
        FLASHCARDS_SCHEMA
      )) as Array<{ front: string; back: string; hint: string }>;

      const flashcards = cards.map((card, index) => ({
        id: `card-${Date.now()}-${index}`,
        front: card.front,
        back: card.back,
        hint: card.hint,
      }));
      return res.json({ flashcards });
    } catch (error) {
      return handleApiError(res, error);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      res.status(fs.existsSync(indexFile) ? 200 : 404).sendFile(indexFile);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyDesk running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
