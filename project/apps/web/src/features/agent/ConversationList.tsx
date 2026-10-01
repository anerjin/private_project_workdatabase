import { useState } from 'react';
import { Button, Modal, toast } from '@bricks/core';
import { MessageSquarePlus, MessagesSquare, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { timeAgo } from '../../lib/format';
import { useWorkspace } from '../../state/workspace';

/** 채팅 창 안에서 여는 대화 목록. 대화는 공간별로 쌓인다. */
export function ConversationList({ onClose }: { onClose: () => void }) {
  const conversations = useWorkspace((state) => state.conversations);
  const conversationId = useWorkspace((state) => state.conversationId);
  const setConversation = useWorkspace((state) => state.setConversation);
  const spaceName = useWorkspace((state) => state.spaces.find((space) => space.id === state.spaceId)?.name ?? '');
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  function pick(id: string | null) {
    setConversation(id);
    onClose();
  }

  async function remove() {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.deleteConversation(confirm.id);
      if (conversationId === confirm.id) setConversation(null);
      setConfirm(null);
    } catch (error) {
      toast.error(errorMessage(error, '대화를 지우지 못했습니다.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="kb-conversations">
      <div className="kb-conversations-head">
        <span className="three-column-caption">{spaceName} 대화 · {conversations.length}</span>
        <Button size="xs" variant="soft" color="primary" leftIcon={<MessageSquarePlus size={13} />} onClick={() => pick(null)}>
          새 대화
        </Button>
      </div>
      {!conversations.length && <p className="kb-chat-hint">아직 대화가 없습니다. 질문을 보내면 대화가 시작됩니다.</p>}
      <ul aria-label="대화 목록">
        {conversations.map((item) => (
          <li key={item.id} data-active={item.id === conversationId}>
            <button type="button" className="kb-conversation" aria-current={item.id === conversationId ? 'true' : undefined} onClick={() => pick(item.id)}>
              <MessagesSquare size={14} aria-hidden />
              <span className="kb-conversation-title">{item.title}</span>
              <time dateTime={item.updatedAt}>{timeAgo(item.updatedAt)}</time>
            </button>
            <Button size="xs" variant="ghost" shape="square" aria-label={`${item.title} 대화 지우기`} title="대화 지우기" onClick={() => setConfirm({ id: item.id, title: item.title })}>
              <Trash2 size={13} />
            </Button>
          </li>
        ))}
      </ul>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="대화 지우기"
        size="sm"
        footer={
          <>
            <Button variant="surface" onClick={() => setConfirm(null)}>
              취소
            </Button>
            <Button color="error" loading={deleting} onClick={() => void remove()}>
              지우기
            </Button>
          </>
        }
      >
        <p>"{confirm?.title}" 대화를 지웁니다. 이 대화에서 저장한 지식은 그대로 남습니다.</p>
      </Modal>
    </div>
  );
}
