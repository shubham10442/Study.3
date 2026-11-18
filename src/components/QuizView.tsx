import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import type { QuizQuestion } from '../types/study';

interface QuizViewProps {
  questions: QuizQuestion[];
  isLoading: boolean;
  hasInput: boolean;
  onGenerate: () => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export const QuizView: React.FC<QuizViewProps> = ({
  questions,
  isLoading,
  hasInput,
  onGenerate,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSelectedAnswers({});
    setSubmitted(false);
  }, [questions]);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded" />
        <div className="space-y-4">
          <div className="h-32 bg-slate-100 rounded-lg" />
          <div className="h-32 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center">
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Practice Quiz
        </h2>
        <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-lg mx-auto leading-relaxed">
          Check your comprehension with diagnostic multiple-choice questions tailored to your topic, complete with explanations for every answer.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!hasInput}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          >
            Generate Practice Quiz
          </button>
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = questions.reduce((total, q) => {
    return total + (selectedAnswers[q.id] === q.correctIndex ? 1 : 0);
  }, 0);
  const scorePercent = Math.round((correctCount / questions.length) * 100);

  const handleRetake = () => {
    setSelectedAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-8">
      <header className="pb-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            Practice Quiz
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 tabular-nums">
            <span>{questions.length} Questions</span>
            <span aria-hidden="true">·</span>
            <span>
              {answeredCount} of {questions.length} Answered
            </span>
            {submitted && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-sky-700 font-semibold">
                  Score: {correctCount} / {questions.length} ({scorePercent}%)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {submitted && (
            <button
              type="button"
              onClick={handleRetake}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retake</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Questions</span>
          </button>
        </div>
      </header>

      <div className="divide-y divide-slate-200">
        {questions.map((q, qIndex) => {
          const selected = selectedAnswers[q.id];
          const isCorrect = selected === q.correctIndex;

          return (
            <section key={q.id} className="py-7 first:pt-0 last:pb-0 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-slate-900 leading-snug">
                  <span className="font-mono text-sm text-sky-700 mr-2 tabular-nums">
                    {String(qIndex + 1).padStart(2, '0')}.
                  </span>
                  {q.question}
                </h3>

                {submitted && (
                  <span
                    className={`shrink-0 text-xs font-semibold flex items-center gap-1 whitespace-nowrap ${
                      isCorrect ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>Correct</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                        <span>Incorrect</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {q.options.map((optionText, optIndex) => {
                  const isChosen = selected === optIndex;
                  const isRightAnswer = q.correctIndex === optIndex;

                  let stateStyle =
                    'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100';
                  if (!submitted && isChosen) {
                    stateStyle =
                      'bg-sky-50 border-sky-600 text-sky-900 ring-1 ring-sky-600';
                  } else if (submitted && isRightAnswer) {
                    stateStyle =
                      'bg-emerald-50 border-emerald-500 text-emerald-950';
                  } else if (submitted && isChosen && !isRightAnswer) {
                    stateStyle = 'bg-red-50 border-red-400 text-red-950';
                  }

                  return (
                    <button
                      key={optIndex}
                      type="button"
                      disabled={submitted}
                      onClick={() =>
                        setSelectedAnswers((prev) => ({ ...prev, [q.id]: optIndex }))
                      }
                      className={`w-full min-h-[44px] px-4 py-2.5 text-left text-sm border rounded-lg transition-colors flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${stateStyle}`}
                    >
                      <span className="font-mono text-xs font-semibold mt-0.5 shrink-0">
                        {OPTION_LETTERS[optIndex] || optIndex + 1}.
                      </span>
                      <span className="flex-1 leading-relaxed">{optionText}</span>
                    </button>
                  );
                })}
              </div>

              {submitted && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-900 mr-1.5">
                    Explanation:
                  </span>
                  <span>{q.explanation}</span>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!submitted && (
        <footer className="pt-6 border-t border-slate-200 flex items-center justify-between gap-4">
          <span className="text-sm text-slate-600 tabular-nums">
            {answeredCount === questions.length
              ? 'All questions answered. Ready to check your score.'
              : `Answer all ${questions.length} questions or submit anytime.`}
          </span>
          <button
            type="button"
            disabled={answeredCount === 0}
            onClick={() => setSubmitted(true)}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap"
          >
            Check Answers
          </button>
        </footer>
      )}
    </div>
  );
};
