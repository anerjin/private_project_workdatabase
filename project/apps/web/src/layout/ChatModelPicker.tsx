// Ported from jake-doi/design_system apps/gallery/src/layouts/ChatModelPicker.tsx @ 99d7ac2 (DOI-L-THREE-COLUMN) via jake-doi/cad. Submodule: anerjin/design_system @ f54ecbe (same layout code). Keep in sync when the layout changes upstream.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Badge, Button, Icon, Input, Select } from '@bricks/core';
import { readModelPreferences, saveModelPreferences, type ChatModel } from './chatModels';
import './chat-model-picker.css';

const FAVORITES = 'doi-chat-model-favorites';
const RECENT = 'doi-chat-model-recent';
const PAGE_SIZE = 20;

export function ChatModelPicker({
  models,
  value,
  onChange,
  sourceLabel = '예시 모델 목록',
  pinned,
  shortName,
}: {
  models: ChatModel[];
  value: string;
  onChange: (model: ChatModel) => void;
  sourceLabel?: string;
  /** (DOI CAD 추가) 정렬과 상관없이 목록 맨 위에 둘 모델 */
  pinned?: (model: ChatModel) => boolean;
  /** (지식베이스 추가) 좁은 채팅 칸에서 버튼에 보일 짧은 이름 */
  shortName?: (model: ChatModel) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [developer, setDeveloper] = useState('all');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState('name');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [favorites, setFavorites] = useState(() => readModelPreferences(FAVORITES));
  const [recent, setRecent] = useState(() => readModelPreferences(RECENT));
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = models.find((model) => model.id === value);
  const developers = useMemo(() => [...new Set(models.map((model) => model.developer))].sort(), [models]);
  const activeDeveloper = developers.includes(developer) ? developer : 'all';
  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return models
      .filter(
        (model) =>
          (activeDeveloper === 'all' || model.developer === activeDeveloper) &&
          (scope === 'all' || (scope === 'favorites' ? favorites : recent).includes(model.id)) &&
          terms.every((term) => `${model.name} ${model.id} ${model.developer}`.toLowerCase().includes(term)),
      )
      .sort((a, b) => {
        if (scope === 'recent') return recent.indexOf(a.id) - recent.indexOf(b.id);
        const pin = Number(!!pinned?.(b)) - Number(!!pinned?.(a));
        if (pin) return pin;
        if (sort === 'context')
          return (b.contextLength ?? -1) - (a.contextLength ?? -1) || a.name.localeCompare(b.name);
        if (sort === 'price')
          return (a.inputPrice ?? Infinity) - (b.inputPrice ?? Infinity) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
  }, [models, query, activeDeveloper, scope, sort, favorites, recent, pinned]);
  useEffect(() => {
    setLimit(PAGE_SIZE);
    list.current?.scrollTo({ top: 0 });
  }, [query, activeDeveloper, scope, sort, models]);
  useEffect(() => saveModelPreferences(FAVORITES, favorites), [favorites]);
  useEffect(() => saveModelPreferences(RECENT, recent), [recent]);

  function choose(model: ChatModel) {
    onChange(model);
    setRecent((current) => [model.id, ...current.filter((id) => id !== model.id)].slice(0, 10));
    setOpen(false);
  }
  function clearFilters() {
    setQuery('');
    setDeveloper('all');
    setScope('all');
    setSort('name');
  }
  const price = (number: number) =>
    '$' + (number * 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 4 });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          clearFilters();
          setLimit(PAGE_SIZE);
        }
      }}
    >
      <Dialog.Trigger
        render={<Button size="xs" variant="surface" />}
        className="chat-model-trigger"
        aria-label="AI 모델 선택"
        title={selected?.id}
      >
        <span>{selected ? (shortName?.(selected) ?? selected.name) : '모델 선택'}</span>
        <Icon name="chevron-down" size={14} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="chat-model-backdrop" />
        <Dialog.Popup className="chat-model-picker" initialFocus={search}>
          <header className="chat-model-picker-header">
            <div>
              <Dialog.Title>AI 모델 선택</Dialog.Title>
              <Dialog.Description>
                모델을 검색하거나 자주 쓰는 모델을 즐겨찾기에 모아 보세요.
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={<Button shape="circle" size="sm" variant="ghost" />}
              aria-label="모델 선택창 닫기"
            >
              <Icon name="x" size={18} />
            </Dialog.Close>
          </header>
          <div className="chat-model-controls">
            <Input
              ref={search}
              size="sm"
              aria-label="모델 검색"
              placeholder="모델명, 개발사 또는 모델 ID 검색"
              leftIcon={<Icon name="search" size={16} />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  list.current?.querySelector<HTMLButtonElement>('.chat-model-choice')?.focus();
                }
              }}
            />
            <div className="chat-model-filter-row">
              <div className="chat-model-scopes" role="group" aria-label="모델 목록 필터">
                {[
                  ['all', '전체'],
                  ['favorites', '즐겨찾기'],
                  ['recent', '최근 선택'],
                ].map(([id, label]) => (
                  <Button
                    key={id}
                    size="xs"
                    variant={scope === id ? 'solid' : 'ghost'}
                    color={scope === id ? 'primary' : undefined}
                    aria-pressed={scope === id}
                    onClick={() => setScope(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Select
                size="sm"
                aria-label="모델 개발사"
                value={activeDeveloper}
                onChange={(event) => setDeveloper(event.target.value)}
                options={[
                  { value: 'all', label: '모든 개발사' },
                  ...developers.map((name) => ({ value: name, label: name })),
                ]}
              />
            </div>
          </div>
          <div className="chat-model-result-bar">
            <span role="status">{filtered.length}개 모델</span>
            <Select
              size="xs"
              aria-label="모델 정렬"
              value={sort}
              disabled={scope === 'recent'}
              onChange={(event) => setSort(event.target.value)}
              options={[
                { value: 'name', label: '이름순' },
                { value: 'context', label: '컨텍스트 큰 순' },
                { value: 'price', label: '입력 가격 낮은 순' },
              ]}
            />
          </div>
          <ul
            className="chat-model-results"
            ref={list}
            aria-label="AI 모델 목록"
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              const choices = [
                ...(list.current?.querySelectorAll<HTMLButtonElement>('.chat-model-choice') ?? []),
              ];
              const index = choices.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? choices.length - 1
                    : Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
              choices[next]?.focus();
            }}
          >
            {filtered.slice(0, limit).map((model) => (
              <li key={model.id} className="chat-model-row" data-selected={model.id === value}>
                <button
                  className="chat-model-choice"
                  type="button"
                  aria-label={`${model.name} 선택`}
                  aria-pressed={model.id === value}
                  onClick={() => choose(model)}
                >
                  <span className="chat-model-row-title">
                    <strong>{model.name}</strong>
                    {model.id === value && <Icon name="check" size={16} />}
                  </span>
                  <span className="chat-model-id">{model.id}</span>
                  <span className="chat-model-meta">
                    <Badge variant="outline" size="xs">
                      {model.developer}
                    </Badge>
                    {model.contextLength !== null && (
                      <span>컨텍스트 {model.contextLength.toLocaleString()} 토큰</span>
                    )}
                    {model.inputPrice !== null && model.outputPrice !== null && (
                      <span>
                        입력 {price(model.inputPrice)} · 출력 {price(model.outputPrice)}
                      </span>
                    )}
                  </span>
                </button>
                <Button
                  size="sm"
                  shape="circle"
                  variant="ghost"
                  className="chat-model-favorite"
                  aria-label={`${model.name} 즐겨찾기`}
                  aria-pressed={favorites.includes(model.id)}
                  onClick={() =>
                    setFavorites((current) =>
                      current.includes(model.id)
                        ? current.filter((id) => id !== model.id)
                        : [...current, model.id],
                    )
                  }
                >
                  <Icon name="star" size={16} fill={favorites.includes(model.id) ? 'currentColor' : 'none'} />
                </Button>
              </li>
            ))}
            {!filtered.length && (
              <li className="chat-model-empty">
                <Icon name="search" size={24} />
                <strong>
                  {scope === 'favorites'
                    ? '즐겨찾는 모델이 없습니다.'
                    : scope === 'recent'
                      ? '최근 선택한 모델이 없습니다.'
                      : '검색 결과가 없습니다.'}
                </strong>
                <p>다른 검색어나 필터를 사용해 보세요.</p>
                <Button size="sm" variant="surface" onClick={clearFilters}>
                  전체 모델 보기
                </Button>
              </li>
            )}
            {filtered.length > limit && (
              <li className="chat-model-more">
                <Button
                  size="sm"
                  variant="surface"
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}
                >
                  모델 더 보기 ({filtered.length - limit}개 남음)
                </Button>
              </li>
            )}
          </ul>
          <footer className="chat-model-picker-footer">
            <span>{sourceLabel}</span>
            <span>가격 제공 시 USD / 100만 토큰</span>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
