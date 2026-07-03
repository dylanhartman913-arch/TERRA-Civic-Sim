import { useState, useEffect, useCallback } from 'react';
import { MapView } from './map/MapView.js';
import { ActionPalette } from './panels/ActionPalette.js';
import { CountyCardDrawer } from './panels/CountyCardDrawer.js';
import { MetricSelector } from './panels/MetricSelector.js';
import { LayerToggle } from './panels/LayerToggle.js';
import { BuildQueue } from './panels/BuildQueue.js';
import { YearControls } from './panels/YearControls.js';
import { QuestTracker } from './panels/QuestTracker.js';
import { EesGauges } from './panels/EesGauges.js';
import { OraclePanel } from './panels/OraclePanel.js';
import { EventLog } from './panels/EventLog.js';
import { AutoPauseModal } from './panels/AutoPauseModal.js';
import { StressTestPanel } from './panels/StressTestPanel.js';
import { DebugParityCheck } from './panels/DebugParityCheck.js';
import { ReplayControls } from './panels/ReplayControls.js';
import { SaveLoadPanel } from './panels/SaveLoadPanel.js';
import { ComparisonView } from './panels/ComparisonView.js';
import { CampaignSelect } from './campaigns/CampaignSelect.js';
import { NarrationOverlay } from './campaigns/NarrationOverlay.js';
import { ConfiguratorScreen } from './campaigns/ConfiguratorScreen.js';
import { HintToast } from './campaigns/HintToast.js';
import { CampaignOutcome } from './campaigns/CampaignOutcome.js';
import { OnboardingTooltips } from './onboarding/OnboardingTooltips.js';
import { MethodsPage } from './pages/MethodsPage.js';
import { ResourceHUD } from './panels/ResourceHUD.js';
import { useTerraStore } from '../state/store.js';

type AppState = 'title' | 'campaign_select' | 'playing' | 'outcome';

const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

export default function App() {
  const [appState, setAppState] = useState<AppState>('title');
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showMethods, setShowMethods] = useState(false);
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
        </div>

        {showMethods && (
          <MethodsPage onClose={() => setShowMethods(false)} />
        )}
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
