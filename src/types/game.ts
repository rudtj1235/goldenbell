export interface Player {
  id: string;
  nickname: string;
  avatar: any; // AvatarOptions from avatar.ts
  team?: string; // A-Z or undefined for individual
  score: number;
  isEliminated: boolean;
  currentAnswer?: string;
  hasSubmitted: boolean;
  awarded?: { [questionId: string]: boolean };
}

export interface Question {
  id: string;
  type: 'ox' | 'multiple' | 'short';
  question: string;
  image?: string;
  score: number;
  timeLimit: number; // seconds
  options?: string[]; // for multiple choice
  correctAnswer: string | number; // answer index for multiple choice, text for others
}

export type GameState = 'waiting' | 'playing' | 'paused' | 'showingAnswer' | 'finished';

export interface Room {
  id: string;
  code: string;
  subject: string;
  isPublic: boolean;
  hostId: string;
  players: Player[];
  questions: Question[];
  currentQuestionIndex: number;
  gameState: GameState;
  eliminationMode: boolean;
  eliminationThreshold: number;
  autoMode: boolean;
  answerRevealTime: number; // seconds
}

export interface GameSettings {
  timeLimit: number;
  answerRevealTime: number;
  eliminationMode: boolean;
  eliminationThreshold: number;
  autoMode: boolean;
}

export type QuestionType = 'ox' | 'multiple' | 'short';
