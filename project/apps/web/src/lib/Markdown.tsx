import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 마크다운 표시. 원시 HTML은 렌더하지 않고(react-markdown 기본), 링크는 새 탭으로 연다. */
export const Markdown = memo(function Markdown({ children, className = 'kb-markdown' }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
