import type { AgentEvent, TranscriptBlock } from './agent';

/**
 * 응답 이벤트 하나를 assistant 턴의 블록 목록에 반영한다.
 * 화면(스트리밍 표시)과 저장소(대화 기록)가 같은 규칙을 쓰도록 한 곳에 둔다.
 */
export function applyAgentEvent(blocks: TranscriptBlock[], event: AgentEvent): TranscriptBlock[] {
  switch (event.type) {
    case 'text.delta':
    case 'thinking.delta': {
      const type = event.type === 'text.delta' ? 'text' : 'thinking';
      const last = blocks.at(-1);
      if (last && last.type === type) return [...blocks.slice(0, -1), { ...last, text: last.text + event.delta }];
      return [...blocks, { type, text: event.delta }];
    }
    case 'text.citations': {
      const index = blocks.findLastIndex((block) => block.type === 'text');
      if (index < 0) return blocks;
      const target = blocks[index] as Extract<TranscriptBlock, { type: 'text' }>;
      return blocks.map((block, at) => (at === index ? { ...target, citations: event.citations } : block));
    }
    case 'tool.start':
      return [...blocks, { type: 'tool', toolUseId: event.toolUseId, name: event.name, input: undefined }];
    case 'tool.input':
      return blocks.map((block) => (block.type === 'tool' && block.toolUseId === event.toolUseId ? { ...block, input: event.input } : block));
    case 'tool.result':
      return blocks.map((block) => (block.type === 'tool' && block.toolUseId === event.toolUseId ? { ...block, result: event.result } : block));
    case 'web.start':
      return [...blocks, { type: 'web', toolUseId: event.toolUseId, kind: event.kind, query: '' }];
    case 'web.input': {
      const exists = blocks.some((block) => block.type === 'web' && block.toolUseId === event.toolUseId);
      if (!exists) return [...blocks, { type: 'web', toolUseId: event.toolUseId, kind: event.kind, query: event.query }];
      return blocks.map((block) => (block.type === 'web' && block.toolUseId === event.toolUseId ? { ...block, query: event.query } : block));
    }
    case 'web.result':
      return blocks.map((block) =>
        block.type === 'web' && block.toolUseId === event.toolUseId ? { ...block, results: event.results, error: event.error } : block,
      );
    case 'candidate.proposed':
      return [
        ...blocks,
        {
          type: 'candidate',
          candidateId: event.candidate.id,
          title: event.candidate.title,
          summary: event.candidate.summary,
          knowledgeType: event.candidate.type,
        },
      ];
    default:
      return blocks;
  }
}
