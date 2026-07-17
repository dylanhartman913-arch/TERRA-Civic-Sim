/* eslint-disable react-hooks/set-state-in-effect -- preserve existing campaign-overlay state transition. */
import { useState, useEffect, useCallback, useRef } from 'react';
import { MapView } from './ui/map/MapView.js';
import { ActionPalette } from './ui/panels/ActionPalette.js';
import { CountyCardDrawer } from './ui/panels/CountyCardDrawer.js';
import { MetricSelector } from './ui/panels/MetricSelector.js';
import { LayerToggle } from './ui/panels/LayerToggle.js';
import { BuildQueue } from './ui/panels/BuildQueue.js';
import { YearControls } from './ui/panels/YearControls.js';
import { QuestTracker } from './ui/panels/QuestTracker.js';
import { EesGauges } from './ui/panels/EesGauges.js';
import { OraclePanel } from './ui/panels/OraclePanel.js';
import { EventLog } from './ui/panels/EventLog.js';
import { AutoPauseModal } from './ui/panels/AutoPauseModal.js';
import { StressTestPanel } from './ui/panels/StressTestPanel.js';
import { DebugParityCheck } from './ui/panels/DebugParityCheck.js';
import { ReplayControls } from './ui/panels/ReplayControls.js';
import { SaveLoadPanel } from './ui/panels/SaveLoadPanel.js';
import { ComparisonView } from './ui/panels/ComparisonView.js';
import { CampaignSelect } from './ui/campaigns/CampaignSelect.js';
import { NarrationOverlay } from './ui/campaigns/NarrationOverlay.js';
import { ConfiguratorScreen } from './ui/campaigns/ConfiguratorScreen.js';
import { HintToast } from './ui/campaigns/HintToast.js';
import { CampaignOutcome } from './ui/campaigns/CampaignOutcome.js';
import { OnboardingTooltips } from './ui/onboarding/OnboardingTooltips.js';
import { MethodsPage } from './ui/pages/MethodsPage.js';
import { ResourceHUD } from './ui/panels/ResourceHUD.js';
import { ReflectionCard } from './ui/panels/ReflectionCard.js';
import { DebriefView } from './ui/panels/DebriefView.js';
import { AnalyzeView } from './ui/panels/AnalyzeView.js';
import { useTerraStore } from './state/store.js';
import type { SessionConfig } from './engine/types.js';

type AppState = 'title' | 'session_start' | 'campaign_select' | 'playing' | 'outcome' | 'debrief' | 'analyze';

const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

/** Read ?session=<code> from URL; returns empty string if absent. */
function getUrlSessionCode(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('session') ?? '';
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: '8px 10px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function App() {
  const urlSessionCode = getUrlSessionCode();
  const [appState, setAppState] = useState<AppState>(urlSessionCode ? 'session_start' : 'title');
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showMethods, setShowMethods] = useState(false);

  // Session start screen local state
  const [sessionCodeInput, setSessionCodeInput] = useState(urlSessionCode);
  const [participantLabel, setParticipantLabel] = useState('');
  const [sessionConfigRaw, setSessionConfigRaw] = useState('');
  const [sessionConfigError, setSessionConfigError] = useState('');
  const sessionFileRef = useRef<HTMLInputElement>(null);

  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem('terra_reduced_motion');
      if (stored !== null) return stored === 'true';
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });

  const replayMode = useTerraStore(s => s.replayMode);
  const comparisonMode = useTerraStore(s => s.comparisonMode);
  const sessionMeta = useTerraStore(s => s.sessionMeta);
  const sessionConfig = useTerraStore(s => s.sessionConfig);
  const showReflectionCard = useTerraStore(s => s.showReflectionCard);
  const setShowReflectionCard = useTerraStore(s => s.setShowReflectionCard);
  const enterSessionMode = useTerraStore(s => s.enterSessionMode);
  const activeCampaign = useTerraStore(s => s.activeCampaign);
  const campaignAct = useTerraStore(s => s.campaignAct);
  const campaignOutcome = useTerraStore(s => s.campaignOutcome);
  const placementMode = useTerraStore(s => s.placementMode);
  const pendingAutoPause = useTerraStore(s => s.pendingAutoPause);
  const canUndo = useTerraStore(s => s.canUndo);
  const canRedo = useTerraStore(s => s.canRedo);
  const freePlayUnlocked = useTerraStore(s => s.freePlayUnlocked);

  const advanceYear = useTerraStore(s => s.advanceYear);
  const undoAction = useTerraStore(s => s.undoAction);
  const redoAction = useTerraStore(s => s.redoAction);
  const exitPlacementMode = useTerraStore(s => s.exitPlacementMode);
  const dismissAutoPause = useTerraStore(s => s.dismissAutoPause);
  const setActiveMetric = useTerraStore(s => s.setActiveMetric);
  const toggleLayer = useTerraStore(s => s.toggleLayer);
  const exportScenario = useTerraStore(s => s.exportScenario);
  const exitCampaign = useTerraStore(s => s.exitCampaign);
  const startCampaign = useTerraStore(s => s.startCampaign);

  // Persist reduced-motion preference
  function toggleReducedMotion() {
    setReducedMotion(v => {
      const next = !v;
      try { localStorage.setItem('terra_reduced_motion', String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Session: parse optional config JSON and enter session mode
  function handleJoinSession() {
    const code = sessionCodeInput.trim();
    if (!code) return;
    if (!participantLabel.trim()) return;

    let config: SessionConfig | undefined;
    if (sessionConfigRaw.trim()) {
      try {
        const parsed = JSON.parse(sessionConfigRaw.trim()) as SessionConfig;
        if (parsed.schema_version !== '1.0') throw new Error('Unexpected schema_version');
        config = parsed;
        setSessionConfigError('');
      } catch (err) {
        setSessionConfigError(`Config parse error: ${String(err)}`);
        return;
      }
    }

    enterSessionMode(code, participantLabel.trim(), config);

    // If config specifies a campaign, enterSessionMode already calls startCampaign
    if (config?.campaign_id) {
      setAppState('playing');
    } else {
      setAppState('campaign_select');
    }
  }

  // Session config file loader
  function handleSessionConfigFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setSessionConfigRaw(text);
      setSessionConfigError('');
      // Auto-populate session code from file if not already set
      try {
        const parsed = JSON.parse(text) as SessionConfig;
        if (parsed.session_code && !sessionCodeInput.trim()) {
          setSessionCodeInput(parsed.session_code);
        }
      } catch { /* ignore parse errors here; validated on join */ }
    };
    reader.readAsText(file);
  }

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't fire shortcuts when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case ' ':
      case 'Enter':
        if (appState === 'playing' && !placementMode && !pendingAutoPause) {
          e.preventDefault();
          advanceYear();
        }
        break;
      case 'Escape':
        if (placementMode) exitPlacementMode();
        else if (pendingAutoPause) dismissAutoPause();
        else if (showSaveLoad) setShowSaveLoad(false);
        else if (showMethods) setShowMethods(false);
        break;
      case 'z':
      case 'Z':
        if (e.shiftKey) {
          if (canRedo) redoAction();
        } else {
          if (canUndo) undoAction();
        }
        break;
      case '1':
        setActiveMetric('E');
        break;
      case '2':
        setActiveMetric('Ec');
        break;
      case '3':
        setActiveMetric('S');
        break;
      case 'l':
      case 'L':
        toggleLayer('ecoregions');
        break;
      case 's':
      case 'S':
        if (!e.shiftKey && appState === 'playing') setShowSaveLoad(v => !v);
        break;
      case 'm':
      case 'M':
        setShowMethods(v => !v);
        break;
      case '?':
        setShowMethods(true);
        break;
    }
  }, [
    appState, placementMode, pendingAutoPause, showSaveLoad, showMethods,
    canUndo, canRedo, advanceYear, undoAction, redoAction, exitPlacementMode,
    dismissAutoPause, setActiveMetric, toggleLayer,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // When campaign outcome appears, surface it
  useEffect(() => {
    if (campaignOutcome !== null) setAppState('playing'); // outcome overlay renders on top
  }, [campaignOutcome]);

  // ── Title screen ───────────────────────────────────────────────────────────
  if (appState === 'title') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        gap: 24,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 56,
            fontWeight: 700,
            color: 'var(--teal)',
            letterSpacing: 8,
            lineHeight: 1,
          }}>
            TERRA
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, letterSpacing: 2 }}>
            Transition. Energy. Resilience. Regional Analysis.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, maxWidth: 400, lineHeight: 1.6 }}>
            A county-scale energy transition planning tool for the Mountain West.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setAppState('campaign_select')}
            style={{
              padding: '12px 48px',
              background: 'var(--teal-dim)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            Begin
          </button>

          {/* Workshop session entry — enter code or type ?session=code in URL */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={sessionCodeInput}
              onChange={e => setSessionCodeInput(e.target.value)}
              placeholder="Session code"
              onKeyDown={e => {
                if (e.key === 'Enter' && sessionCodeInput.trim()) setAppState('session_start');
              }}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: '6px 10px',
                width: 120,
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <button
              onClick={() => { if (sessionCodeInput.trim()) setAppState('session_start'); }}
              disabled={!sessionCodeInput.trim()}
              style={{
                padding: '6px 12px',
                background: sessionCodeInput.trim() ? 'var(--bg-surface)' : 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: sessionCodeInput.trim() ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: sessionCodeInput.trim() ? 'pointer' : 'default',
              }}
            >
              Join
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <button
              onClick={() => setShowMethods(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                cursor: 'pointer',
                textDecoration: 'underline',
                letterSpacing: 1,
              }}
            >
              Methods & Sources
            </button>
            <button
              onClick={() => setAppState('debrief')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                cursor: 'pointer',
                textDecoration: 'underline',
                letterSpacing: 1,
              }}
            >
              ◆ Debrief
            </button>
            <button
              onClick={() => setAppState('analyze')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                cursor: 'pointer',
                textDecoration: 'underline',
                letterSpacing: 1,
              }}
            >
              ⣿ Analyze
            </button>
          </div>
        </div>

        {showMethods && (
          <MethodsPage onClose={() => setShowMethods(false)} />
        )}
      </div>
    );
  }

  // ── Debrief ────────────────────────────────────────────────────────────────
  if (appState === 'debrief') {
    return <DebriefView onClose={() => setAppState('title')} />;
  }

  // ── Analyze ────────────────────────────────────────────────────────────────
  if (appState === 'analyze') {
    return <AnalyzeView onClose={() => setAppState('title')} />;
  }

  // ── Session start ──────────────────────────────────────────────────────────
  if (appState === 'session_start') {
    const canJoin = sessionCodeInput.trim().length > 0 && participantLabel.trim().length > 0;
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        gap: 20,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--teal)', letterSpacing: 6 }}>
            TERRA
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, letterSpacing: 1 }}>
            Workshop Session
          </div>
        </div>

        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 24,
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          {/* Session code */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, letterSpacing: 0.5 }}>
              SESSION CODE
            </div>
            <input
              value={sessionCodeInput}
              onChange={e => setSessionCodeInput(e.target.value)}
              placeholder="e.g. WY2032"
              style={inputStyle}
            />
          </div>

          {/* Participant label */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, letterSpacing: 0.5 }}>
              YOUR NAME / TABLE
            </div>
            <input
              value={participantLabel}
              onChange={e => setParticipantLabel(e.target.value)}
              placeholder="e.g. Table 3 or your name"
              onKeyDown={e => { if (e.key === 'Enter' && canJoin) handleJoinSession(); }}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Config file loader */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, letterSpacing: 0.5 }}>
              SESSION CONFIG (optional — load file provided by facilitator)
            </div>
            <input
              ref={sessionFileRef}
              type="file"
              accept=".json"
              onChange={handleSessionConfigFile}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => sessionFileRef.current?.click()}
              style={{
                width: '100%',
                padding: '7px 0',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: sessionConfigRaw ? 'var(--teal)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {sessionConfigRaw ? 'Config loaded' : 'Load config.json'}
            </button>
            {sessionConfigError && (
              <div style={{ fontSize: 10, color: 'var(--deficit)', marginTop: 4 }}>
                {sessionConfigError}
              </div>
            )}
          </div>

          {/* Join button */}
          <button
            onClick={handleJoinSession}
            disabled={!canJoin}
            style={{
              padding: '11px 0',
              background: canJoin ? 'var(--teal-dim)' : 'var(--bg-surface)',
              border: 'none',
              borderRadius: 4,
              color: canJoin ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 500,
              cursor: canJoin ? 'pointer' : 'default',
              letterSpacing: 0.5,
            }}
          >
            Join Session
          </button>

          {/* Back to title */}
          <button
            onClick={() => setAppState('title')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Campaign select ────────────────────────────────────────────────────────
  if (appState === 'campaign_select') {
    return (
      <>
        <CampaignSelect
          onStart={() => setAppState('playing')}
          onFreePlay={() => setAppState('playing')}
        />
        {showMethods && (
          <MethodsPage onClose={() => setShowMethods(false)} />
        )}
      </>
    );
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Resource HUD — persistent top strip showing 6 era pools */}
      <ResourceHUD />

      {/* Main area: palette + map + (drawer if open) */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Left panel: action palette (hidden in replay mode) */}
        {!replayMode && (
          <div style={{ zIndex: 20, flexShrink: 0 }}>
            <ActionPalette />
          </div>
        )}

        {/* Map fills remaining space */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapView />

          {/* Floating top-left controls */}
          <div style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            width: 220,
          }}>
            <EesGauges />
            <MetricSelector />
            <LayerToggle />
            <BuildQueue />
            <QuestTracker />
            <EventLog />
            <OraclePanel />
            {isDebug && <StressTestPanel />}
            {isDebug && <DebugParityCheck />}
          </div>

          {/* Top-right controls */}
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 30,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            {/* Keyboard shortcut badge helper */}
            <button
              onClick={() => setShowMethods(true)}
              title="Methods & Sources (M)"
              style={{
                padding: '6px 10px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              M
            </button>

            {/* Reduced motion toggle */}
            <button
              onClick={toggleReducedMotion}
              title={reducedMotion ? 'Reduced motion: ON' : 'Reduced motion: OFF'}
              style={{
                padding: '6px 10px',
                background: reducedMotion ? 'var(--teal-dim)' : 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: reducedMotion ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ⬡
            </button>

            <button
              onClick={() => setShowSaveLoad(v => !v)}
              title="Save / Load (S)"
              style={{
                padding: '6px 14px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ☰ Save / Load
            </button>

            {/* Session mode — report button + participant badge */}
            {sessionMeta && (
              <>
                <button
                  onClick={() => setShowReflectionCard(true)}
                  title="Session Report"
                  style={{
                    padding: '6px 14px',
                    background: 'var(--teal-dim)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  ◆ Report
                </button>
                <div style={{
                  padding: '6px 10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  userSelect: 'none',
                }}>
                  {sessionMeta.participant_label}
                  {sessionConfig?.max_year != null && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                      → {sessionConfig.max_year}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* County card drawer (absolute within map area) */}
        {!replayMode && <CountyCardDrawer />}
      </div>

      {/* Bottom bar: year controls or replay controls */}
      <div style={{
        height: 64,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        zIndex: 20,
      }}>
        {replayMode ? <ReplayControls /> : <YearControls />}
      </div>

      {/* Auto-pause modal (fixed overlay) */}
      <AutoPauseModal />

      {/* Session reflection card */}
      {showReflectionCard && <ReflectionCard />}

      {/* Campaign narration — Act 1 */}
      {activeCampaign && campaignAct === 1 && (
        <NarrationOverlay onSkip={() => {
          useTerraStore.getState().advanceCampaignAct(); // Act 1 → Act 2 (configurator)
        }} />
      )}

      {/* Campaign configurator — Act 2 */}
      {activeCampaign && campaignAct === 2 && (
        <ConfiguratorScreen campaign={activeCampaign} />
      )}

      {/* Campaign hints — Act 3 */}
      {activeCampaign && campaignAct === 3 && <HintToast />}

      {/* Campaign 2 briefing is shown in CampaignSelect; pre-placed assets are queued on startCampaign */}

      {/* Campaign outcome overlay */}
      {campaignOutcome && (
        <CampaignOutcome
          onExport={exportScenario}
          onPlayAgain={() => {
            if (activeCampaign) {
              startCampaign(activeCampaign.campaign_id);
            }
          }}
          onFreePlay={() => {
            exitCampaign();
            setAppState('playing');
          }}
        />
      )}

      {/* Save/Load panel (side drawer) */}
      {showSaveLoad && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 240 }}
            onClick={() => setShowSaveLoad(false)}
          />
          <SaveLoadPanel onClose={() => setShowSaveLoad(false)} />
        </>
      )}

      {/* Comparison View (full-screen overlay) */}
      {comparisonMode && <ComparisonView />}

      {/* Methods page */}
      {showMethods && <MethodsPage onClose={() => setShowMethods(false)} />}

      {/* Onboarding tooltips (free play only) */}
      {!activeCampaign && freePlayUnlocked && <OnboardingTooltips />}

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg-base); }
        #root { width: 100%; max-width: none; border: none; min-height: auto; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .maplibregl-ctrl-top-right {
          top: 56px;
        }

        /* Reduced motion overrides */
        ${reducedMotion ? `
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        ` : ''}
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
