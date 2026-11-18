import React, { useEffect, useState } from 'react';
import { BookOpen, Pause, Play, RotateCcw } from 'lucide-react';
import type { StudyLevel } from '../types/study';

interface TopicSidebarProps {
  topic: string;
  sourceNotes: string;
  level: StudyLevel;
  isGenerating: boolean;
  onTopicChange: (value: string) => void;
  onSourceNotesChange: (value: string) => void;
  onLevelChange: (level: StudyLevel) => void;
  onGenerateCurrent: () => void;
  onSelectSample: (sampleTopic: string, sampleNotes: string) => void;
}

const STUDY_LEVELS: StudyLevel[] = ['High School', 'Undergraduate', 'Quick Review'];

const SAMPLE_TOPICS: Array<{ label: string; topic: string; notes: string }> = [
  {
    label: 'Cellular Respiration',
    topic: 'Cellular Respiration & ATP Production',
    notes:
      'Focus on glycolysis, the citric acid cycle (Krebs cycle), and oxidative phosphorylation in mitochondria. Include net ATP yields and the role of NADH and FADH2 as electron carriers.',
  },
  {
    label: 'Supply & Demand',
    topic: 'Supply, Demand, and Market Equilibrium',
    notes:
      'Cover determinants of demand vs. quantity demanded, supply curve shifts, equilibrium price, consumer surplus, and effects of price ceilings and price floors.',
  },
  {
    label: 'Derivatives & Chain Rule',
    topic: 'Calculus: Derivatives & The Chain Rule',
    notes:
      'Instantaneous rate of change, power rule, product rule, quotient rule, and differentiating composite functions f(g(x)) with step-by-step examples.',
  },
  {
    label: 'HTTP & REST APIs',
    topic: 'Web Architecture: HTTP Methods & REST APIs',
    notes:
      'Explain stateless client-server architecture, GET/POST/PUT/DELETE methods, status codes (2xx, 4xx, 5xx), JSON payloads, and idempotency.',
  },
];

export const TopicSidebar: React.FC<TopicSidebarProps> = ({
  topic,
  sourceNotes,
  level,
  isGenerating,
  onTopicChange,
  onSourceNotesChange,
  onLevelChange,
  onGenerateCurrent,
  onSelectSample,
}) => {
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  const switchTimerMode = (mode: 'focus' | 'break') => {
    setIsRunning(false);
    setTimerMode(mode);
    setSecondsLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(timerMode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <aside className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Study Material
        </h2>
        <p className="mt-1 text-sm text-slate-600 leading-relaxed">
          Enter a subject topic or paste lecture notes to build notes, flashcards, and practice quizzes.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="study-topic"
            className="block text-sm font-medium text-slate-800 mb-1.5"
          >
            Topic or Chapter
          </label>
          <input
            id="study-topic"
            type="text"
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="e.g., Photosynthesis, Linear Algebra"
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15 transition-colors"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-800 mb-1.5">
            Study Depth
          </span>
          <div
            role="group"
            aria-label="Study depth"
            className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {STUDY_LEVELS.map((option) => {
              const active = level === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onLevelChange(option)}
                  className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="source-notes"
            className="block text-sm font-medium text-slate-800 mb-1.5"
          >
            Lecture Notes or Text (Optional)
          </label>
          <textarea
            id="source-notes"
            rows={5}
            value={sourceNotes}
            onChange={(e) => onSourceNotesChange(e.target.value)}
            placeholder="Paste textbook excerpts, syllabus points, or class notes here..."
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg resize-y focus:outline-none focus:bg-white focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15 transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={onGenerateCurrent}
          disabled={isGenerating || (!topic.trim() && !sourceNotes.trim())}
          className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
        >
          <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{isGenerating ? 'Generating...' : 'Generate Study Material'}</span>
        </button>
      </div>

      <div className="pt-5 border-t border-slate-200">
        <p className="text-xs font-medium text-slate-500 mb-2.5">
          Try a sample topic
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {SAMPLE_TOPICS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => onSelectSample(sample.topic, sample.notes)}
              className="text-left px-3 py-2 text-sm text-slate-700 hover:text-sky-700 hover:bg-sky-50/70 rounded-lg transition-colors truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-5 border-t border-slate-200">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-sm font-medium text-slate-800">
            Focus Timer
          </span>
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => switchTimerMode('focus')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                timerMode === 'focus'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              25m Focus
            </button>
            <button
              type="button"
              onClick={() => switchTimerMode('break')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                timerMode === 'break'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              5m Break
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <span className="font-mono text-2xl font-medium tracking-tight text-slate-900 tabular-nums">
            {minutes}:{seconds}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRunning((r) => !r)}
              aria-label={isRunning ? 'Pause timer' : 'Start timer'}
              className="h-9 px-3 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              {isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Start</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={resetTimer}
              aria-label="Reset timer"
              className="h-9 w-9 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
