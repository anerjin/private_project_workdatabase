// Ported from jake-doi/design_system apps/gallery/src/layouts/chatModels.ts @ 99d7ac2 (DOI-L-THREE-COLUMN) via jake-doi/cad. Submodule: anerjin/design_system @ f54ecbe (same layout code).
// DOI CAD 변경(지식베이스도 같음): OpenRouter 정규화와 예시 목록은 빼고, 모델 목록은 API(aiModels)에서 받는다. 서버가 붙기 전에는 데모 API가 준다.
export type { ChatModel } from '@doi-kb/shared';

export function readModelPreferences(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === 'string'))].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

export function saveModelPreferences(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* Selection still works without storage. */
  }
}
