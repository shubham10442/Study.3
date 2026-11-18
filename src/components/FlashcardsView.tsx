import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  RefreshCw,
  RotateCw,
  Shuffle,
} from 'lucide-react';
import type { Flashcard } from '../types/study';

interface FlashcardsViewProps {
  flashcards: Flashcard[];
  isLoading: boolean;
  hasInput: boolean;
  onGenerate: () => void;
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  flashcards,
  isLoading,
  hasInput,
  onGenerate,
}) => {
  const [deck, setDeck] = useState<Flashcard[]>(flashcards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Record<string, boolean>>({});
  const [reviewIds, setReviewIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDeck(flashcards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setMasteredIds({});
    setReviewIds({});
  }, [flashcards]);

  useEffect(() => {
    if (deck.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (event.key === 'ArrowRight') {
        setCurrentIndex((prev) => Math.min(prev + 1, deck.length - 1));
        setIsFlipped(false);
        setShowHint(false);
      } else if (event.key === 'ArrowLeft') {
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
        setIsFlipped(false);
        setShowHint(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deck.length]);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded" />
        <div className="h-72 bg-slate-100 rounded-xl" />
        <div className="flex justify-between">
          <div className="h-10 w-28 bg-slate-200 rounded-lg" />
          <div className="h-10 w-28 bg-slate-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (deck.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center">
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Active-Recall Flashcards
        </h2>
        <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-lg mx-auto leading-relaxed">
          Generate a deck of question-and-answer flashcards from your topic or notes to practice active recall and track what you have mastered.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!hasInput}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          >
            Generate Flashcards
          </button>
        </div>
      </div>
    );
  }

  const currentCard = deck[currentIndex];
  const masteredCount = Object.values(masteredIds).filter(Boolean).length;
  const reviewCount = Object.values(reviewIds).filter(Boolean).length;
  const progressPercent = Math.round(((currentIndex + 1) / deck.length) * 100);
  const isCurrentMastered = Boolean(masteredIds[currentCard.id]);
  const isCurrentReview = Boolean(reviewIds[currentCard.id]);

  const goToIndex = (nextIndex: number) => {
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
    setShowHint(false);
  };

  const handleMarkMastered = () => {
    setMasteredIds((prev) => ({ ...prev, [currentCard.id]: true }));
    setReviewIds((prev) => ({ ...prev, [currentCard.id]: false }));
    if (currentIndex < deck.length - 1) {
      goToIndex(currentIndex + 1);
    }
  };

  const handleMarkReview = () => {
    setReviewIds((prev) => ({ ...prev, [currentCard.id]: true }));
    setMasteredIds((prev) => ({ ...prev, [currentCard.id]: false }));
    if (currentIndex < deck.length - 1) {
      goToIndex(currentIndex + 1);
    }
  };

  const handleShuffle = () => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setDeck(shuffled);
    goToIndex(0);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            Flashcards
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 tabular-nums">
            <span>
              Card {currentIndex + 1} of {deck.length}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700">{masteredCount} Mastered</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-700">{reviewCount} Needs Review</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShuffle}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Shuffle</span>
          </button>
          <button
            type="button"
            onClick={onGenerate}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Deck</span>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-sky-600 transition-all duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Interactive 3D Flashcard */}
      <div className="perspective-1000">
        <div
          role="button"
          tabIndex={0}
          aria-pressed={isFlipped}
          aria-label={isFlipped ? 'Flashcard answer side. Press to show question.' : 'Flashcard question side. Press to reveal answer.'}
          onClick={() => setIsFlipped((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setIsFlipped((prev) => !prev);
            }
          }}
          className={`relative w-full min-h-[290px] sm:min-h-[320px] cursor-pointer transition-transform duration-300 transform-style-3d focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 rounded-xl ${
            isFlipped ? 'rotate-y-180' : ''
          }`}
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Question</span>
              {isCurrentMastered && (
                <span className="text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Mastered
                </span>
              )}
              {isCurrentReview && (
                <span className="text-amber-700">Marked for review</span>
              )}
            </div>

            <div className="my-auto py-4 text-center">
              <p className="font-display text-xl sm:text-2xl font-medium text-slate-900 leading-snug text-balance max-w-xl mx-auto">
                {currentCard.front}
              </p>
              {showHint && (
                <p className="mt-4 text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-4 py-2.5 max-w-md mx-auto">
                  Hint: {currentCard.hint}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Click card or press Space to flip</span>
              <span className="flex items-center gap-1 font-medium text-slate-700">
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                Flip
              </span>
            </div>
          </div>

          {/* Back */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white border border-sky-200 rounded-xl p-6 sm:p-10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-sky-700">
              <span>Answer</span>
              <span className="text-slate-400">Card {currentIndex + 1}</span>
            </div>

            <div className="my-auto py-4 text-center">
              <p className="text-base sm:text-lg text-slate-800 leading-relaxed max-w-xl mx-auto">
                {currentCard.back}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Click card or press Space to see question</span>
              <span className="flex items-center gap-1 font-medium text-sky-700">
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                Flip back
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToIndex(Math.max(currentIndex - 1, 0))}
            disabled={currentIndex === 0}
            className="h-10 px-3.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={() => goToIndex(Math.min(currentIndex + 1, deck.length - 1))}
            disabled={currentIndex === deck.length - 1}
            className="h-10 px-3.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          {!isFlipped && (
            <button
              type="button"
              onClick={() => setShowHint((h) => !h)}
              className="h-10 px-3.5 text-sm font-medium text-sky-700 hover:bg-sky-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <HelpCircle className="w-4 h-4" aria-hidden="true" />
              <span>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkReview}
            className={`h-10 px-4 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap ${
              isCurrentReview
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Review Again
          </button>
          <button
            type="button"
            onClick={handleMarkMastered}
            className={`h-10 px-4 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              isCurrentMastered
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>Got It</span>
          </button>
        </div>
      </div>
    </div>
  );
};
