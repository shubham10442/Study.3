import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { FlashcardsView } from './components/FlashcardsView';
import { NotesView } from './components/NotesView';
import { QuizView } from './components/QuizView';
import { StudyHeader } from './components/StudyHeader';
import { TopicSidebar } from './components/TopicSidebar';
import { TutorView } from './components/TutorView';
import type {
  Flashcard,
  QuizQuestion,
  StudyLevel,
  StudyMode,
  StudyNotes,
  TutorMessage,
} from './types/study';

const STORAGE_KEY = 'studydesk_session_v1';

interface PersistedSession {
  topic: string;
  sourceNotes: string;
  level: StudyLevel;
  notes: StudyNotes | null;
  flashcards: Flashcard[];
  questions: QuizQuestion[];
  messages: TutorMessage[];
}

function loadSession(): PersistedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export default function App() {
  const saved = loadSession();

  const [activeMode, setActiveMode] = useState<StudyMode>('notes');
  const [topic, setTopic] = useState(saved?.topic ?? '');
  const [sourceNotes, setSourceNotes] = useState(saved?.sourceNotes ?? '');
  const [level, setLevel] = useState<StudyLevel>(saved?.level ?? 'Undergraduate');

  const [notes, setNotes] = useState<StudyNotes | null>(saved?.notes ?? null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(saved?.flashcards ?? []);
  const [questions, setQuestions] = useState<QuizQuestion[]>(saved?.questions ?? []);
  const [messages, setMessages] = useState<TutorMessage[]>(saved?.messages ?? []);

  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingFlashcards, setLoadingFlashcards] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [sendingTutor, setSendingTutor] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const payload: PersistedSession = {
        topic,
        sourceNotes,
        level,
        notes,
        flashcards,
        questions,
        messages,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [topic, sourceNotes, level, notes, flashcards, questions, messages]);

  const hasInput = Boolean(topic.trim() || sourceNotes.trim());
  const isAnyGenerating = loadingNotes || loadingFlashcards || loadingQuiz;

  const generateNotes = async (overrideTopic?: string, overrideSource?: string) => {
    const targetTopic = overrideTopic ?? topic;
    const targetSource = overrideSource ?? sourceNotes;
    if (!targetTopic.trim() && !targetSource.trim()) return;

    setErrorMessage(null);
    setLoadingNotes(true);
    try {
      const res = await fetch('/api/study/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: targetTopic,
          sourceNotes: targetSource,
          level,
        }),
      });
      const data = (await res.json()) as { notes?: StudyNotes; error?: string };
      if (!res.ok || !data.notes) {
        throw new Error(data.error || 'Could not generate study notes.');
      }
      setNotes(data.notes);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not generate study notes.'
      );
    } finally {
      setLoadingNotes(false);
    }
  };

  const generateFlashcards = async (overrideTopic?: string, overrideSource?: string) => {
    const targetTopic = overrideTopic ?? topic;
    const targetSource = overrideSource ?? sourceNotes;
    if (!targetTopic.trim() && !targetSource.trim()) return;

    setErrorMessage(null);
    setLoadingFlashcards(true);
    try {
      const res = await fetch('/api/study/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: targetTopic,
          sourceNotes: targetSource,
          level,
          count: 8,
        }),
      });
      const data = (await res.json()) as { flashcards?: Flashcard[]; error?: string };
      if (!res.ok || !data.flashcards) {
        throw new Error(data.error || 'Could not generate flashcards.');
      }
      setFlashcards(data.flashcards);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not generate flashcards.'
      );
    } finally {
      setLoadingFlashcards(false);
    }
  };

  const generateQuiz = async (overrideTopic?: string, overrideSource?: string) => {
    const targetTopic = overrideTopic ?? topic;
    const targetSource = overrideSource ?? sourceNotes;
    if (!targetTopic.trim() && !targetSource.trim()) return;

    setErrorMessage(null);
    setLoadingQuiz(true);
    try {
      const res = await fetch('/api/study/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: targetTopic,
          sourceNotes: targetSource,
          level,
          count: 5,
        }),
      });
      const data = (await res.json()) as { questions?: QuizQuestion[]; error?: string };
      if (!res.ok || !data.questions) {
        throw new Error(data.error || 'Could not generate practice quiz.');
      }
      setQuestions(data.questions);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not generate practice quiz.'
      );
    } finally {
      setLoadingQuiz(false);
    }
  };

  const handleGenerateCurrent = () => {
    if (activeMode === 'notes') {
      void generateNotes();
    } else if (activeMode === 'flashcards') {
      void generateFlashcards();
    } else if (activeMode === 'quiz') {
      void generateQuiz();
    } else {
      setActiveMode('notes');
      void generateNotes();
    }
  };

  const handleSelectSample = (sampleTopic: string, sampleNotes: string) => {
    setTopic(sampleTopic);
    setSourceNotes(sampleNotes);
    setNotes(null);
    setFlashcards([]);
    setQuestions([]);
    setMessages([]);
    setErrorMessage(null);

    if (activeMode === 'flashcards') {
      void generateFlashcards(sampleTopic, sampleNotes);
    } else if (activeMode === 'quiz') {
      void generateQuiz(sampleTopic, sampleNotes);
    } else {
      setActiveMode('notes');
      void generateNotes(sampleTopic, sampleNotes);
    }
  };

  const handleSendTutorMessage = async (question: string) => {
    const nowLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const userMsg: TutorMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: question,
      timestamp: nowLabel,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setSendingTutor(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/study/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          sourceNotes,
          level,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          question,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Tutor could not respond right now.');
      }
      const replyMsg: TutorMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Tutor could not respond right now.'
      );
    } finally {
      setSendingTutor(false);
    }
  };

  const handleResetSession = () => {
    setTopic('');
    setSourceNotes('');
    setNotes(null);
    setFlashcards([]);
    setQuestions([]);
    setMessages([]);
    setErrorMessage(null);
    setActiveMode('notes');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const handleSwitchToFlashcards = () => {
    setActiveMode('flashcards');
    if (flashcards.length === 0 && hasInput && !loadingFlashcards) {
      void generateFlashcards();
    }
  };

  const handleSwitchToQuiz = () => {
    setActiveMode('quiz');
    if (questions.length === 0 && hasInput && !loadingQuiz) {
      void generateQuiz();
    }
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <StudyHeader
        activeMode={activeMode}
        onSelectMode={setActiveMode}
        onResetSession={handleResetSession}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 text-balance">
              Focused study notes, flashcards, and quizzes from your course material
            </h1>
            <p className="text-sm sm:text-base text-slate-600">
              Turn any topic or lecture excerpt into structured study guides, active-recall decks, and practice exams.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss error"
              className="text-red-700 hover:text-red-900 p-1 rounded"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
          <TopicSidebar
            topic={topic}
            sourceNotes={sourceNotes}
            level={level}
            isGenerating={isAnyGenerating}
            onTopicChange={setTopic}
            onSourceNotesChange={setSourceNotes}
            onLevelChange={setLevel}
            onGenerateCurrent={handleGenerateCurrent}
            onSelectSample={handleSelectSample}
          />

          <div className="min-w-0">
            {activeMode === 'notes' && (
              <NotesView
                notes={notes}
                level={level}
                isLoading={loadingNotes}
                hasInput={hasInput}
                onGenerate={() => void generateNotes()}
                onSwitchToFlashcards={handleSwitchToFlashcards}
                onSwitchToQuiz={handleSwitchToQuiz}
              />
            )}

            {activeMode === 'flashcards' && (
              <FlashcardsView
                flashcards={flashcards}
                isLoading={loadingFlashcards}
                hasInput={hasInput}
                onGenerate={() => void generateFlashcards()}
              />
            )}

            {activeMode === 'quiz' && (
              <QuizView
                questions={questions}
                isLoading={loadingQuiz}
                hasInput={hasInput}
                onGenerate={() => void generateQuiz()}
              />
            )}

            {activeMode === 'tutor' && (
              <TutorView
                topic={topic}
                messages={messages}
                isSending={sendingTutor}
                onSendMessage={(q) => void handleSendTutorMessage(q)}
                onClearChat={() => setMessages([])}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>StudyDesk · Student Study Workspace</span>
          <span>Verify key facts and formulas against your course syllabus.</span>
        </div>
      </footer>
    </div>
  );
}
