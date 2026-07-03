import { useState, useRef } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { SaveSlotMeta, ScenarioFile } from '../../engine/types.js';
import { importFromJson, MAX_SLOTS } from '../../engine/persistence.js';

const SLOT_IDS = Array.from({ length: MAX_SLOTS }, (_, i) => String(i + 1));

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso.slice(0, 10); }
}

function SlotButton({
  slot_id,
  meta,
  onSave,
  onLoad,
  onDelete,
}: {
  slot_id: string;
  meta: SaveSlotMeta | undefined;
  onSave: (slot_id: string) => void;
  onLoad: (slot_id: string) => void;
  onDelete: (slot_id: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);

  if (!meta) {
    return (
      <button
        onClick={() => onSave(slot_id)}
        style={slotStyle(false)}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Slot {slot_id} — Empty</span>
        <span style={{ fontSize: 10, color: 'var(--teal)' }}>Save here</span>
      </button>
    );
  }

  if (confirm) {
    return (
      <div style={{ ...slotStyle(true), display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--amber, #f59e0b)', flex: 1 }}>Overwrite?</span>
        <button onClick={() => { onSave(slot_id); setConfirm(false); }} style={smallBtn('var(--teal-dim)')}>Yes</button>
        <button onClick={() => setConfirm(false)} style={smallBtn('transparent')}>No</button>
      </div>
    );
  }

  return (
    <div style={{ ...slotStyle(true), display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          Year {meta.year_reached} · {meta.scenario_name ?? 'Free Play'} · {fmtDate(meta.exported_at)}
        </div>
      </div>
      <button onClick={() => onLoad(slot_id)} style={smallBtn('var(--teal-dim)')}>Load</button>
      <button onClick={() => setConfirm(true)} style={smallBtn('transparent')}>Save</button>
      <button onClick={() => onDelete(slot_id)} style={{ ...smallBtn('transparent'), color: 'var(--deficit)' }}>✕</button>
    </div>
  );
}

function slotStyle(occupied: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-elevated)',
    border: `1px solid ${occupied ? 'var(--border)' : 'var(--border)'}`,
    borderRadius: 4,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'left',
  };
}

function smallBtn(bg: string): React.CSSProperties {
  return {
    padding: '3px 8px',
    background: bg,
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    cursor: 'pointer',
    flexShrink: 0,
  };
}

export function SaveLoadPanel({ onClose }: { onClose: () => void }) {
  const saveSlots = useTerraStore(s => s.saveSlots);
  const saveToSlot = useTerraStore(s => s.saveToSlot);
  const loadFromSlot = useTerraStore(s => s.loadFromSlot);
  const deleteSlot = useTerraStore(s => s.deleteSlot);
  const exportScenario = useTerraStore(s => s.exportScenario);
  const importScenario = useTerraStore(s => s.importScenario);
  const enterReplayMode = useTerraStore(s => s.enterReplayMode);
  const enterComparisonMode = useTerraStore(s => s.enterComparisonMode);

  const importRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; msg: string } | null>(null);
  const [importedFile, setImportedFile] = useState<ScenarioFile | null>(null);
  const [loading, setLoading] = useState(false);

  const slotMeta = (id: string) => saveSlots.find(s => s.slot_id === id);

  const handleLoad = async (slot_id: string) => {
    setLoading(true);
    await loadFromSlot(slot_id);
    setLoading(false);
    onClose();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const json = ev.target?.result as string;
      const parsed = importFromJson(json);
      if (!parsed) {
        setImportStatus({ kind: 'err', msg: 'Import failed: invalid JSON or incompatible version' });
        return;
      }
      setImportedFile(parsed);
      const result = await importScenario(json);
      if (!result.success) {
        setImportStatus({ kind: 'err', msg: `Import failed: ${result.error ?? 'unknown error'}` });
      } else if (!result.digest_match) {
        setImportStatus({ kind: 'warn', msg: 'Imported with digest warning — replay may differ from original engine version. Loaded anyway.' });
      } else {
        setImportStatus({ kind: 'ok', msg: 'Imported successfully — digest verified' });
      }
    };
    reader.readAsText(file);
  };

  const statusColor = importStatus?.kind === 'ok' ? 'var(--surplus)' : importStatus?.kind === 'warn' ? 'var(--amber, #f59e0b)' : 'var(--deficit)';
  const statusIcon = importStatus?.kind === 'ok' ? '✓' : importStatus?.kind === 'warn' ? '⚠' : '✗';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 380,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 250,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
        overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Save / Load</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Slots */}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Slots</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {SLOT_IDS.map(id => (
            <SlotButton
              key={id}
              slot_id={id}
              meta={slotMeta(id)}
              onSave={(sid) => saveToSlot(sid)}
              onLoad={handleLoad}
              onDelete={(sid) => deleteSlot(sid)}
            />
          ))}
        </div>

        {loading && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 12 }}>Loading…</div>
        )}

        {/* Export / Import */}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Export / Import</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={exportScenario} style={{ ...actionBtn(), flex: 1 }}>Export JSON</button>
          <button onClick={() => importRef.current?.click()} style={{ ...actionBtn(), flex: 1 }}>Import JSON</button>
          <input ref={importRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
        </div>

        {importStatus && (
          <div style={{ fontSize: 11, color: statusColor, background: 'var(--bg-elevated)', borderRadius: 4, padding: '8px 10px', marginBottom: 12, lineHeight: 1.4 }}>
            {statusIcon} {importStatus.msg}
          </div>
        )}

        {importedFile && importStatus?.kind !== 'err' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => { enterReplayMode(importedFile); onClose(); }}
              style={{ ...actionBtn(), flex: 1 }}
            >
              Enter Replay Mode
            </button>
          </div>
        )}

        {/* Comparison */}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Analysis</div>
        <button
          onClick={() => { enterComparisonMode(); onClose(); }}
          style={{ ...actionBtn(), width: '100%' }}
        >
          Open Comparison View
        </button>
      </div>
    </div>
  );
}

function actionBtn(): React.CSSProperties {
  return {
    padding: '8px 12px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    cursor: 'pointer',
  };
}
