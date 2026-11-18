import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      const isRetryable = status === 429 || status === 503 || status === 500;
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function formatApiError(error: unknown): { status: number; message: string } {
  const err = error as { status?: number; message?: string };
  const rawMessage = err?.message || 'An unexpected error occurred while contacting Gemini.';
  const status = typeof err?.status === 'number' && err.status >= 400 ? err.status : 500;

  if (status === 400 || rawMessage.includes('API_KEY_INVALID')) {
    return {
      status: 400,
      message: 'API key is invalid or missing. Please verify your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (status === 403 || rawMessage.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message: 'Permission denied by Gemini API. Please check your API key in Settings > Secrets.',
    };
  }
  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Rate limit reached. Please wait a few seconds and try again.',
    };
  }
  return { status, message: rawMessage };
}

function buildMaterialPrompt(topic: string, sourceNotes: string, level: string): string {
  const cleanTopic = topic.trim();
  const cleanNotes = sourceNotes.trim();
  if (cleanTopic && cleanNotes) {
    return `Topic: ${cleanTopic}\nTarget Level: ${level}\n\nStudent Source Notes:\n${cleanNotes}`;
  }
  if (cleanNotes) {
    return `Target Level: ${level}\n\nStudent Source Notes:\n${cleanNotes}`;
  }
  return `Topic: ${cleanTopic}\nTarget Level: ${level}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/study/notes', async (req: Request, res: Response) => {
    try {
      const { topic = '', sourceNotes = '', level = 'Undergraduate' } = req.body as {
        topic?: string;
        sourceNotes?: string;
        level?: string;
      };

      if (!topic.trim() && !sourceNotes.trim()) {
        res.status(400).json({ error: 'Please enter a study topic or paste your notes.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = buildMaterialPrompt(topic, sourceNotes, level);

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Create clear, well-structured study notes for a student based on the following material:\n\n${prompt}`,
          config: {
            systemInstruction:
              'You are an expert academic tutor creating concise, accurate, easy-to-review study notes for students. Keep explanations clear, concrete, and tailored to the requested target level. Avoid fluff.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topicTitle: { type: Type.STRING, description: 'Clean concise title of the study topic.' },
                subject: { type: Type.STRING, description: 'Academic subject area (e.g., Biology, Calculus, History).' },
                overview: { type: Type.STRING, description: '2-3 sentence plain-language summary of what this topic covers and why it matters.' },
                keyConcepts: {
                  type: Type.ARRAY,
                  description: '4 to 5 core concepts.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      explanation: { type: Type.STRING, description: 'Clear 2-3 sentence explanation.' },
                      example: { type: Type.STRING, description: 'Concrete example or equation demonstrating the concept.' },
                    },
                    required: ['title', 'explanation', 'example'],
                  },
                },
                commonMistakes: {
                  type: Type.ARRAY,
                  description: '2 to 3 common student misconceptions to avoid.',
                  items: { type: Type.STRING },
                },
                takeaways: {
                  type: Type.ARRAY,
                  description: '3 quick bullet takeaways for last-minute review.',
                  items: { type: Type.STRING },
                },
              },
              required: ['topicTitle', 'subject', 'overview', 'keyConcepts', 'commonMistakes', 'takeaways'],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ notes: parsed });
    } catch (error) {
      const { status, message } = formatApiError(error);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/study/flashcards', async (req: Request, res: Response) => {
    try {
      const { topic = '', sourceNotes = '', level = 'Undergraduate', count = 8 } = req.body as {
        topic?: string;
        sourceNotes?: string;
        level?: string;
        count?: number;
      };

      if (!topic.trim() && !sourceNotes.trim()) {
        res.status(400).json({ error: 'Please enter a study topic or paste your notes.' });
        return;
      }

      const cardCount = Math.min(Math.max(Number(count) || 8, 4), 12);
      const ai = getGeminiClient();
      const prompt = buildMaterialPrompt(topic, sourceNotes, level);

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Generate ${cardCount} active-recall flashcards for a student studying:\n\n${prompt}`,
          config: {
            systemInstruction:
              'You design active-recall study flashcards. Each front should ask a clear, specific question or name a term. Each back should give a crisp, accurate 1-3 sentence answer. Include a helpful memory hint for each card.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING, description: 'Question or term on the front of the card.' },
                  back: { type: Type.STRING, description: 'Clear, concise answer on the back.' },
                  hint: { type: Type.STRING, description: 'Short mnemonic or clue without giving away the full answer.' },
                },
                required: ['front', 'back', 'hint'],
              },
            },
          },
        })
      );

      const rawCards = JSON.parse((response.text ?? '[]').trim()) as Array<{
        front: string;
        back: string;
        hint: string;
      }>;
      const flashcards = rawCards.map((card, index) => ({
        id: `fc-${Date.now()}-${index}`,
        front: card.front,
        back: card.back,
        hint: card.hint,
      }));
      res.json({ flashcards });
    } catch (error) {
      const { status, message } = formatApiError(error);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/study/quiz', async (req: Request, res: Response) => {
    try {
      const { topic = '', sourceNotes = '', level = 'Undergraduate', count = 5 } = req.body as {
        topic?: string;
        sourceNotes?: string;
        level?: string;
        count?: number;
      };

      if (!topic.trim() && !sourceNotes.trim()) {
        res.status(400).json({ error: 'Please enter a study topic or paste your notes.' });
        return;
      }

      const questionCount = Math.min(Math.max(Number(count) || 5, 3), 10);
      const ai = getGeminiClient();
      const prompt = buildMaterialPrompt(topic, sourceNotes, level);

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Generate ${questionCount} multiple-choice practice quiz questions for a student studying:\n\n${prompt}`,
          config: {
            systemInstruction:
              'You write fair, diagnostic multiple-choice questions that test real understanding rather than trivia. Always provide exactly 4 distinct options, a valid 0-based correctIndex (0-3), and a clear explanation of why the correct option is right.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctIndex: {
                    type: Type.INTEGER,
                    description: 'Zero-based index (0, 1, 2, or 3) of the correct option.',
                  },
                  explanation: { type: Type.STRING, description: 'Clear 1-2 sentence explanation of the answer.' },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
        })
      );

      const rawQuestions = JSON.parse((response.text ?? '[]').trim()) as Array<{
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>;

      const questions = rawQuestions.map((q, index) => {
        const safeOptions = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
        const safeIndex =
          typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < safeOptions.length
            ? q.correctIndex
            : 0;
        return {
          id: `qq-${Date.now()}-${index}`,
          question: q.question,
          options: safeOptions,
          correctIndex: safeIndex,
          explanation: q.explanation,
        };
      });
      res.json({ questions });
    } catch (error) {
      const { status, message } = formatApiError(error);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/study/tutor', async (req: Request, res: Response) => {
    try {
      const {
        topic = '',
        sourceNotes = '',
        level = 'Undergraduate',
        messages = [],
        question = '',
      } = req.body as {
        topic?: string;
        sourceNotes?: string;
        level?: string;
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
        question?: string;
      };

      if (!question.trim()) {
        res.status(400).json({ error: 'Please enter a question for your tutor.' });
        return;
      }

      const ai = getGeminiClient();
      const contextBlock = buildMaterialPrompt(topic, sourceNotes, level);

      const historyContents = messages
        .slice(-10)
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      historyContents.push({
        role: 'user',
        parts: [{ text: question }],
      });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: historyContents,
          config: {
            systemInstruction: `You are a patient, encouraging academic study tutor helping a student at the ${level} level. Use the student's study context below when relevant. Break complex ideas into clear steps, use short paragraphs or bullet points, and check understanding when helpful.\n\nStudy Context:\n${contextBlock || 'General student Q&A'}`,
          },
        })
      );

      const reply = response.text?.trim();
      if (!reply) {
        res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
        return;
      }
      res.json({ reply });
    } catch (error) {
      const { status, message } = formatApiError(error);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyDesk server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start StudyDesk server:', err);
  process.exit(1);
});
