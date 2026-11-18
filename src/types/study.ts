export type StudyLevel = 'High School' | 'Undergraduate' | 'Quick Review';

export type StudyMode = 'notes' | 'flashcards' | 'quiz' | 'tutor';

export interface KeyConcept {
  title: string;
  explanation: string;
  example: string;
}

export interface StudyNotes {
  topicTitle: string;
  subject: string;
  overview: string;
  keyConcepts: KeyConcept[];
  commonMistakes: string[];
  takeaways: string[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  hint: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
