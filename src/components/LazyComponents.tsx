/**
 * 지연 로딩 컴포넌트들
 * 코드 스플리팅을 통한 초기 번들 크기 최적화
 */

import { lazy } from 'react';

// 메인 페이지 관련
export const NewMainPage = lazy(() => import('./NewMainPage'));
export const NewPlayerSetup = lazy(() => import('./NewPlayerSetup'));

// 게임 관련
export const NewGameHost = lazy(() => import('./NewGameHost'));
export const GamePlayer = lazy(() => import('./GamePlayer'));
export const NewAdminPanel = lazy(() => import('./NewAdminPanel'));

// 모달 관련 (사용 시에만 로드)
export const QuestionModal = lazy(() => import('./QuestionModal'));
export const AiQuestionModal = lazy(() => import('./AiQuestionModal'));
export const EditQuestionModal = lazy(() => import('./EditQuestionModal'));

// 최적화된 컴포넌트들
export const OptimizedPlayerGrid = lazy(() => import('./OptimizedPlayerGrid'));

// 테스트 컴포넌트 (개발 환경에서만)
export const FirestoreTest = lazy(() => import('./FirestoreTest'));

