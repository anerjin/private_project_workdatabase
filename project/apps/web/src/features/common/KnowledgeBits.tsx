import { Badge } from '@bricks/core';
import { BookOpen, FileText, Gavel, ListChecks, Lightbulb, StickyNote, type LucideIcon } from 'lucide-react';
import { knowledgeStatusLabel, knowledgeTypeLabel, type KnowledgeStatus, type KnowledgeType } from '@doi-kb/shared';

export const TYPE_ICON: Record<KnowledgeType, LucideIcon> = {
  fact: Lightbulb,
  procedure: ListChecks,
  decision: Gavel,
  reference: BookOpen,
  note: StickyNote,
};

export function TypeIcon({ type, size = 14, className }: { type: KnowledgeType; size?: number; className?: string }) {
  const Icon = TYPE_ICON[type] ?? FileText;
  return <Icon size={size} className={className} aria-hidden />;
}

export function TypeBadge({ type }: { type: KnowledgeType }) {
  return (
    <Badge variant="outline" size="sm" className="kb-type-badge">
      <TypeIcon type={type} size={12} />
      {knowledgeTypeLabel(type)}
    </Badge>
  );
}

const STATUS_COLOR = { draft: undefined, verified: 'success', stale: 'warning' } as const;

export function StatusBadge({ status }: { status: KnowledgeStatus }) {
  return (
    <Badge variant="soft" size="sm" color={STATUS_COLOR[status]}>
      {knowledgeStatusLabel(status)}
    </Badge>
  );
}
