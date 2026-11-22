// "Save diagnostics": writes the diagnostics file (see support.ts) and says where it went. The same button on
// Diagnostics, on the fault screen and beside a failure on Build & Flash.

import { useState } from 'react';
import { saveDiagnostics } from './support';

export function SaveDiagnostics({ small = false }: { small?: boolean }) {
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; file: string } | { kind: 'failed'; error: string }>({ kind: 'idle' });
  const save = async () => {
    setState({ kind: 'saving' });
    try { setState({ kind: 'saved', file: await saveDiagnostics() }); } catch (err) {
      setState({ kind: 'failed', error: String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '') });
    }
  };
  return (
    <span className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
      <button type="button" className={`btn${small ? ' sm' : ''}`} disabled={state.kind === 'saving'} onClick={() => void save()}>
        <span className="b"><span className="i">{state.kind === 'saving' ? 'Saving…' : 'Save diagnostics'}</span></span>
      </button>
      {state.kind === 'saved' && <span className="hint" role="status">Saved {state.file}. Its folder is open; you can read the file before sending it.</span>}
      {state.kind === 'failed' && <span className="hint" role="status">Could not save diagnostics: {state.error}</span>}
    </span>
  );
}
