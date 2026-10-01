import { useRef, useState } from 'react';
import { Button, Input, Modal, Textarea, toast } from '@bricks/core';
import { FileText, Globe, Type, Upload, X } from 'lucide-react';
import { INGEST_STAGES, type IngestInput } from '@doi-kb/shared';
import { errorMessage } from '../../api/client';
import { hostOf, isWebUrl } from '../../lib/format';
import { useWorkspace } from '../../state/workspace';

type Mode = 'file' | 'url' | 'text';

const ACCEPT = '.txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.docx,.pptx,.xlsx,.hwp,.hwpx';
/** 데모에서 내용을 직접 읽는 형식(나머지는 서버가 붙은 뒤 읽는다) */
const TEXT_EXT = /\.(txt|md|markdown|csv|json|html?)$/i;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/** 자료 추가: 파일·웹 주소·텍스트 → 읽기 → 조각내기 → 임베딩 → 지식 후보 */
export function IngestDialog() {
  const open = useWorkspace((state) => state.ingestOpen);
  const setOpen = useWorkspace((state) => state.setIngestOpen);
  const startIngest = useWorkspace((state) => state.startIngest);
  const openHome = useWorkspace((state) => state.openHome);
  const spaceName = useWorkspace((state) => state.spaces.find((space) => space.id === state.spaceId)?.name ?? '');
  const [mode, setMode] = useState<Mode>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const ready = mode === 'file' ? files.length > 0 : mode === 'url' ? isWebUrl(url.trim()) : !!text.trim();

  function close() {
    setOpen(false);
    setFiles([]);
    setUrl('');
    setTitle('');
    setText('');
    setBusy(false);
  }

  function addFiles(list: FileList | null) {
    const next = [...(list ?? [])];
    const tooBig = next.filter((file) => file.size > MAX_BYTES);
    if (tooBig.length) toast.error(`50MB가 넘는 파일은 올릴 수 없습니다: ${tooBig.map((file) => file.name).join(', ')}`);
    setFiles((current) => [...current, ...next.filter((file) => file.size <= MAX_BYTES && !current.some((item) => item.name === file.name && item.size === file.size))].slice(0, 10));
  }

  async function submit() {
    setBusy(true);
    try {
      const inputs: IngestInput[] = [];
      if (mode === 'file') {
        for (const file of files) {
          const readable = TEXT_EXT.test(file.name) && file.size <= MAX_TEXT_BYTES;
          inputs.push({ kind: 'file', name: file.name, text: readable ? await file.text() : undefined });
        }
      } else if (mode === 'url') {
        const address = url.trim();
        inputs.push({ kind: 'url', name: title.trim() || `${hostOf(address)}${new URL(address).pathname.replace(/\/$/, '')}`, url: address });
      } else {
        inputs.push({ kind: 'text', name: title.trim() || text.trim().split('\n')[0].slice(0, 40), text });
      }
      for (const input of inputs) await startIngest(input);
      toast.info(`자료 ${inputs.length}건 수집을 시작했습니다. 끝나면 검토 대기에 후보가 생깁니다.`);
      close();
      openHome();
    } catch (error) {
      toast.error(errorMessage(error, '수집을 시작하지 못했습니다.'));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={`자료 추가 · ${spaceName}`}
      footer={
        <>
          <Button variant="surface" onClick={close}>
            취소
          </Button>
          <Button color="primary" loading={busy} disabled={!ready} onClick={() => void submit()}>
            수집 시작
          </Button>
        </>
      }
    >
      <div className="kb-ingest">
        <ol className="kb-ingest-steps" aria-label="수집 단계">
          {INGEST_STAGES.map((stage, index) => (
            <li key={stage.value}>
              <span>{index + 1}</span>
              {stage.label}
            </li>
          ))}
          <li>
            <span>✓</span>검토 대기
          </li>
        </ol>
        <div className="kb-segment" role="radiogroup" aria-label="자료 종류">
          {(
            [
              ['file', '파일', FileText],
              ['url', '웹 주소', Globe],
              ['text', '텍스트', Type],
            ] as [Mode, string, typeof Globe][]
          ).map(([value, label, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} className="kb-segment-item" onClick={() => setMode(value)}>
              <Icon size={13} aria-hidden /> {label}
            </button>
          ))}
        </div>

        {mode === 'file' && (
          <>
            <button
              type="button"
              className="kb-dropzone"
              data-dropping={dropping || undefined}
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDropping(true);
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDropping(false);
                addFiles(event.dataTransfer.files);
              }}
            >
              <Upload size={22} aria-hidden />
              <strong>파일을 끌어 놓거나 눌러서 고르세요</strong>
              <span>PDF·Word·PowerPoint·Excel·한글·Markdown·텍스트 (최대 10개, 파일당 50MB)</span>
            </button>
            <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }} />
            {files.length > 0 && (
              <ul className="kb-file-list">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`}>
                    <FileText size={14} aria-hidden />
                    <span className="kb-file-name">{file.name}</span>
                    <span className="three-column-caption">{TEXT_EXT.test(file.name) ? '내용 읽기' : '서버 연결 후 읽기'}</span>
                    <Button size="xs" variant="ghost" shape="square" aria-label={`${file.name} 빼기`} onClick={() => setFiles((list) => list.filter((item) => item !== file))}>
                      <X size={12} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="three-column-caption">데모에서는 텍스트·Markdown 파일만 내용을 읽어 후보를 만듭니다. 다른 형식은 자리만 만들고, 서버가 붙으면 실제로 읽습니다.</p>
          </>
        )}

        {mode === 'url' && (
          <div className="kb-form">
            <label className="three-column-field">
              <span>웹 주소</span>
              <Input size="sm" type="url" placeholder="https://" value={url} color={url && !isWebUrl(url.trim()) ? 'error' : undefined} onChange={(event) => setUrl(event.target.value)} />
            </label>
            <label className="three-column-field">
              <span>이름 (선택)</span>
              <Input size="sm" placeholder="비우면 주소로 이름을 붙입니다" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <p className="three-column-caption">서버가 붙으면 페이지를 내려받아 본문을 읽습니다. 내부망·로컬 주소는 열지 않습니다.</p>
          </div>
        )}

        {mode === 'text' && (
          <div className="kb-form">
            <label className="three-column-field">
              <span>이름 (선택)</span>
              <Input size="sm" placeholder="예: 9월 운영회의 회의록" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="three-column-field">
              <span>내용</span>
              <Textarea size="sm" rows={9} placeholder="회의록·메일·메모를 붙여 넣으세요. 마크다운도 됩니다." value={text} onChange={(event) => setText(event.target.value)} />
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
