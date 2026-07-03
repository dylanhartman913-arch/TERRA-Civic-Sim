import { useTerraStore } from '../../state/store.js';
import { computeEesSummary } from '../../engine/engine.js';

function CircularGauge({
  label,
  value,
  bandWidth,
  color,
  lowConfCount,
}: {
  label: string;
  value: number;
  bandWidth: number;
  color: string;
  lowConfCount: number;
}) {
  const size = 64;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fraction = Math.min(1, Math.max(0, value / 10));
  const fillLen = circ * fraction;
  const bandLow = Math.max(0, fraction - bandWidth / 10);
  const bandHigh = Math.min(1, fraction + bandWidth / 10);
  const bandLowLen = circ * bandLow;
  const bandHighLen = circ * bandHigh;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        position: 'relative',
      }}
      title={`${label}: ${value.toFixed(3)}/10\nUncertainty reflects ${lowConfCount} low-confidence coefficients`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth={stroke}
        />
        {/* Uncertainty band (lighter) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke + 4}
          strokeDasharray={`${bandHighLen} ${circ - bandHighLen}`}
          strokeDashoffset={-bandLowLen}
          opacity={0.15}
          strokeLinecap="round"
        />
        {/* Value fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${fillLen} ${circ - fillLen}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-primary)',
      }}>
        {value.toFixed(2)}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}

export function EesGauges() {
  const engineState = useTerraStore(s => s.engineState);
  const summary = computeEesSummary(engineState);
  const sa = summary.study_area;

  // Count low-confidence actions to size uncertainty band
  let lowConfCount = 0;
  for (const action of Object.values(engineState.action_library.actions)) {
    if (action.confidence === 'low') lowConfCount++;
    const eesConf = action.ees_confidence;
    if (eesConf) {
      if (eesConf.E === 'low' || eesConf.Ec === 'low' || eesConf.S === 'low') {
        lowConfCount++;
      }
    }
  }

  // Band width: wider for more low-confidence actions
  const mediumBand = 0.04;
  const lowBand = 0.08;
  const highBand = 0.02;
  const ratio = lowConfCount / Math.max(1, Object.keys(engineState.action_library.actions).length);
  const bandWidth = ratio > 0.5 ? lowBand : ratio > 0.2 ? mediumBand : highBand;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
      }}>
        Study Area EES
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        <CircularGauge label="E" value={sa.E} bandWidth={bandWidth} color="var(--teal)" lowConfCount={lowConfCount} />
        <CircularGauge label="Ec" value={sa.Ec} bandWidth={bandWidth} color="var(--purple)" lowConfCount={lowConfCount} />
        <CircularGauge label="S" value={sa.S} bandWidth={bandWidth} color="var(--amber)" lowConfCount={lowConfCount} />
      </div>
    </div>
  );
}
