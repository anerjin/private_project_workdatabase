import { useEffect } from 'react';
import { useWorkspace } from '../state/workspace';
import { Workspace } from './Workspace';

export function App() {
  const init = useWorkspace((state) => state.init);
  useEffect(() => init(), [init]);
  return (
    <div className="kb-shell">
      <Workspace />
    </div>
  );
}
