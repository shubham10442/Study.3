import React, { useState } from 'react';
import { AlertCircle, Check, Copy, RefreshCw } from 'lucide-react';
import type { StudyLevel, StudyNotes } from '../types/study';

interface NotesViewProps {
  notes: StudyNotes | null;
  level: StudyLevel;
  isLoading: boolean;
  hasInput: boolean;
  onGenerate: () => void;
  onSwitchToFlashcards: () => void;
  onSwitchToQuiz: () => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  level,
  isLoading,
  hasInput,
  onGenerate,
  onSwitchToFlashcards,
  onSwitchToQuiz,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyMarkdown = async () => {
    if (!notes) return;
    const md = [
      `# ${notes.topicTitle}`,
      `Subject: ${notes.subject} | Level: ${level}`,
      '',
      '## Overview',
      notes.overview,
      '',
      '## Key Concepts',
      ...notes.keyConcepts.flatMap((c, i) => [
        `### ${i + 1}. ${c.title}`,
        c.explanation,
        `Example: ${c.example}`,
        '',
      ]),
      '## Common Mistakes to Avoid',
      ...notes.commonMistakes.map((m) => `- ${m}`),
      '',
      '## Quick Takeaways',
      ...notes.takeaways.map((t) => `- ${t}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-40 bg-slate-200 rounded" />
          <div className="h-8 w-3/4 bg-slate-200 rounded" />
        </div>
        <div className="h-20 bg-slate-100 rounded-lg" />
        <div className="space-y-4">
          <div className="h-28 bg-slate-100 rounded-lg" />
          <div className="h-28 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!notes) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center">
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Structured Study Notes
        </h2>
        <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-lg mx-auto leading-relaxed">
          Enter any topic or paste your lecture notes on the left, then generate a concise breakdown with key concepts, examples, and exam takeaways.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!hasInput}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          >
            Generate Study Notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-8">
      <header className="pb-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span>{notes.subject}</span>
            <span aria-hidden="true">·</span>
            <span>{level}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{notes.keyConcepts.length} Key Concepts</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight text-balance">
            {notes.topicTitle}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy Notes</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onGenerate}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Regenerate</span>
          </button>
        </div>
      </header>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-slate-900">Overview</h3>
        <p className="text-[15px] text-slate-700 leading-relaxed max-w-prose">
          {notes.overview}
        </p>
      </section>

      <section className="space-y-5 pt-2 border-t border-slate-100">
        <h3 className="text-base font-semibold text-slate-900">Key Concepts</h3>
        <div className="divide-y divide-slate-100">
          {notes.keyConcepts.map((concept, index) => (
            <div key={concept.title} className="py-5 first:pt-0 last:pb-0 space-y-2.5">
              <h4 className="text-base font-semibold text-slate-900">
                <span className="font-mono text-sm text-sky-700 mr-2 tabular-nums">
                  {String(index + 1).padStart(2, '0')}.
                </span>
                {concept.title}
              </h4>
              <p className="text-[15px] text-slate-700 leading-relaxed max-w-prose">
                {concept.explanation}
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold text-slate-900 mr-1.5">Example:</span>
                <span>{concept.example}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-200">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span>Common Mistakes to Avoid</span>
          </h3>
          <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
            {notes.commonMistakes.map((mistake, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-mono text-xs text-slate-400 mt-1 tabular-nums">
                  {idx + 1}.
                </span>
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Quick Takeaways
          </h3>
          <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
            {notes.takeaways.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-600">
          Ready to test your recall?
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSwitchToFlashcards}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            Study Flashcards
          </button>
          <button
            type="button"
            onClick={onSwitchToQuiz}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap"
          >
            Take Practice Quiz
          </button>
        </div>
      </footer>
    </article>
  );
};
