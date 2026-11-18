import React, { useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import type { TutorMessage } from '../types/study';

interface TutorViewProps {
  topic: string;
  messages: TutorMessage[];
  isSending: boolean;
  onSendMessage: (question: string) => void;
  onClearChat: () => void;
}

const STARTER_PROMPTS = [
  'Explain the core concept in plain language',
  'Give me a step-by-step practice problem',
  'What are the most common exam mistakes here?',
  'Walk me through a real-world example',
];

function renderFormattedText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={idx} className="h-2" />;
    }
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
    const content = isBullet ? trimmed.slice(2) : line;

    // Lightweight inline **bold** and `code` parser
    const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    const renderedParts = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={pIdx} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={pIdx}
            className="font-mono text-xs bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-800"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={pIdx}>{part}</React.Fragment>;
    });

    if (isBullet) {
      return (
        <div key={idx} className="flex items-start gap-2 pl-1">
          <span className="text-slate-400 select-none" aria-hidden="true">
            •
          </span>
          <span className="flex-1">{renderedParts}</span>
        </div>
      );
    }

    return <p key={idx}>{renderedParts}</p>;
  });
}

export const TutorView: React.FC<TutorViewProps> = ({
  topic,
  messages,
  isSending,
  onSendMessage,
  onClearChat,
}) => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput('');
    onSendMessage(trimmed);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[640px]">
      <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-slate-900">
            AI Study Tutor
          </h2>
          <p className="text-xs text-slate-500 truncate">
            {topic.trim()
              ? `Context: ${topic.trim()}`
              : 'Ask any study question or enter a topic on the left'}
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClearChat}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear Chat</span>
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-5">
            <div className="space-y-2">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                Ask for step-by-step explanations
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Get hints on homework problems, clarify confusing definitions, or test your understanding with guided follow-up questions.
              </p>
            </div>

            <div className="w-full grid grid-cols-1 gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSendMessage(prompt)}
                  disabled={isSending}
                  className="text-left px-4 py-2.5 text-sm text-slate-700 bg-slate-50 hover:bg-sky-50 hover:text-sky-800 border border-slate-200 rounded-lg transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-xs font-medium text-slate-400 mb-1">
                    {isUser ? 'You' : 'Tutor'} · {msg.timestamp}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed space-y-1.5 ${
                      isUser
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-800'
                    }`}
                  >
                    {isUser ? <p>{msg.content}</p> : renderFormattedText(msg.content)}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex flex-col items-start">
                <span className="text-xs font-medium text-slate-400 mb-1">
                  Tutor
                </span>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-slate-200 bg-white rounded-b-xl flex items-center gap-3 shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this topic..."
          aria-label="Ask a question"
          className="flex-1 h-11 px-4 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="h-11 px-4 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
        >
          <span>Send</span>
          <Send className="w-4 h-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
};
