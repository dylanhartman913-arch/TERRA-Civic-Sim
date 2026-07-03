import { useState } from 'react';
import coefficientData from '../../data/material_coefficient_sources.json';

interface CoefficientRow {
  action_type: string;
  material: string;
  value: number;
  unit: string;
  deployment_unit: string;
  primary_input: string;
  source: string;
  year: number;
  notes: string;
  confidence: string;
}

const rows = coefficientData as CoefficientRow[];

const lowCount = rows.filter(r => r.confidence === 'low').length;

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://');
}

function confidenceBorder(c: string): string {
  if (c === 'low') return '3px solid var(--amber)';
  if (c === 'medium') return '3px solid var(--teal-dim)';
  return '3px solid var(--surplus)';
}

interface Props {
  onClose: () => void;
}

export function MethodsPage({ onClose }: Props) {
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [sortKey, setSortKey] = useState<keyof CoefficientRow>('action_type');
  const [sortAsc, setSortAsc] = useState(true);

  const displayed = rows
    .filter(r => !showLowOnly || r.confidence === 'low')
    .sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });

  function toggleSort(key: keyof CoefficientRow) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 10px',
    textAlign: 'left',
    fontSize: 10,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
  };

  const tdStyle: React.CSSProperties = {
    padding: '7px 10px',
    fontSize: 11,
    color: 'var(--text-secondary)',
    verticalAlign: 'top',
    borderBottom: '1px solid var(--bg-elevated)',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 15,
    color: 'var(--text-primary)',
    fontWeight: 500,
    marginBottom: 8,
    marginTop: 28,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 8,
  };

  const doctrine = [
    'The county is the unit of analysis and governance.',
    'The bus is the unit of energy system intervention.',
    'The tract is the unit of social measurement.',
    'The ecoregion is the unit of ecological suitability.',
    'The material ledger is the unit of honesty.',
  ];

  const limitations = [
    'per_capita_income uses ACS 5-year proxy for all 157 counties. BEA CAINC30 would be more accurate.',
    'water_withdrawals_mgd is null for all counties. USGS 2015 county water use data not yet loaded.',
    'HALEU consumption per Natrium core (5,000 kg) is an engineering estimate without peer-reviewed citation.',
    'Data center capex coefficients are missing from the action library. Capital cost is not computed for ENERGY_DEMAND actions.',
    'Era budget values (steel, concrete, labor) are documented estimates, all confidence: low.',
    'The E4ST oracle comparison panel is a placeholder. Model-validated results will be added post-prototype.',
  ];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-base)',
      zIndex: 350,
      fontFamily: 'var(--font-mono)',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
      }}>
        <div>
          <span style={{ fontSize: 16, color: 'var(--text-primary)', fontWeight: 500 }}>TERRA</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 14 }}>Methods & Sources</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          ✕ Close
        </button>
      </div>

      <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Section 1 — Five-Scale Doctrine */}
        <div style={sectionTitle}>1. Five-Scale Doctrine</div>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--teal-dim)',
          borderRadius: 6,
          padding: '16px 20px',
        }}>
          {doctrine.map((line, i) => (
            <div key={i} style={{
              padding: '6px 0',
              fontSize: 12,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              borderBottom: i < doctrine.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {line}
            </div>
          ))}
        </div>

        {/* Section 2 — Study Area */}
        <div style={sectionTitle}>2. Study Area</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginTop: 0 }}>
            157 counties across WY, CO, MT, UT, ID, NE, and SD. All 23 Wyoming counties plus counties whose centroids fall within the six study ecoregions.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Six study ecoregions:</strong>{' '}
            Wyoming Basin, Northwestern Great Plains, Middle Rockies, Southern Rockies, Colorado Plateaus, High Plains.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Power system:</strong>{' '}
            75 in-study power system buses from a 500-bus synthetic network, calibrated against EIA-930 interchange flows.
          </p>
        </div>

        {/* Section 3 — EES Framework */}
        <div style={sectionTitle}>3. EES Framework</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginTop: 0 }}>
            Three capital dimensions — <strong style={{ color: 'var(--teal)' }}>E</strong> (environmental capital),{' '}
            <strong style={{ color: 'var(--purple)' }}>Ec</strong> (economic capital),{' '}
            <strong style={{ color: 'var(--amber)' }}>S</strong> (social capital) — each scored 0–10.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Aggregation:</strong>{' '}
            Tract → county via exact GEOID nesting (population-weighted mean). County → study area via population-weighted mean.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Uncertainty:</strong>{' '}
            Coefficients are flagged by confidence tier. Low-confidence values produce wider uncertainty bands on EES gauges (shown in the top-left panel in game).
          </p>
        </div>

        {/* Section 4 — Coefficient Source Table */}
        <div style={sectionTitle}>4. Coefficient Source Table</div>

        {/* Banner */}
        <div style={{
          background: 'var(--amber-dim)',
          border: '1px solid var(--amber)',
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 11,
          color: 'var(--text-primary)',
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <span>
            <strong>{lowCount}</strong> of {rows.length} coefficients are low-confidence estimates.
            Results should be interpreted with caution.
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showLowOnly}
              onChange={e => setShowLowOnly(e.target.checked)}
              style={{ accentColor: 'var(--amber)' }}
            />
            Show only low-confidence
          </label>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
          }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)' }}>
                {(['action_type', 'material', 'value', 'unit', 'source', 'year', 'confidence', 'notes'] as const).map(col => (
                  <th
                    key={col}
                    style={thStyle}
                    onClick={() => toggleSort(col)}
                  >
                    {col.replace(/_/g, ' ')} {sortKey === col ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderLeft: confidenceBorder(row.confidence),
                    background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)',
                  }}
                >
                  <td style={{ ...tdStyle, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {row.action_type}
                  </td>
                  <td style={tdStyle}>{row.material}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.value.toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 160 }}>{row.unit}</td>
                  <td style={{ ...tdStyle, maxWidth: 220 }}>
                    {isUrl(row.source)
                      ? <a href={row.source} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>{row.source}</a>
                      : row.source}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.year}</td>
                  <td style={{
                    ...tdStyle,
                    color: row.confidence === 'low' ? 'var(--amber)' : row.confidence === 'medium' ? 'var(--teal)' : 'var(--surplus)',
                    fontWeight: 500,
                  }}>
                    {row.confidence}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 200, fontSize: 10 }}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
          Showing {displayed.length} of {rows.length} rows.{' '}
          Left border: <span style={{ color: 'var(--amber)' }}>amber = low</span>,{' '}
          <span style={{ color: 'var(--teal)' }}>teal = medium</span>,{' '}
          <span style={{ color: 'var(--surplus)' }}>green = high</span> confidence.
        </div>

        {/* Section 5 — Known Limitations */}
        <div style={sectionTitle}>5. Known Limitations</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          {limitations.map((lim, i) => (
            <div key={i} style={{
              padding: '8px 0 8px 16px',
              borderLeft: '3px solid var(--amber-dim)',
              marginBottom: 8,
              borderRadius: '0 4px 4px 0',
            }}>
              {lim}
            </div>
          ))}
        </div>

        {/* Section 6 — Golden Fixture Registry */}
        <div style={sectionTitle}>6. Golden Fixture Registry</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
          These checksums verify that the TypeScript engine exactly reproduces the Python reference engine's results.
        </div>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, paddingLeft: 0 }}>Fixture</th>
              <th style={{ ...thStyle }}>MD5 Digest</th>
              <th style={{ ...thStyle }}>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, paddingLeft: 0, color: 'var(--text-primary)' }}>golden_b (no events)</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 10 }}>716b189a8fee6757643818b15cd72541</td>
              <td style={tdStyle}>Wyoming 2032 nuclear–DC buildout, Python engine, no events</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, paddingLeft: 0, color: 'var(--text-primary)' }}>golden_b (with events, seed=42)</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 10 }}>a63401e30494a3da03e85817c3f42ba7</td>
              <td style={tdStyle}>Same sequence with deterministic event replay (Naughton 2026 + stochastic)</td>
            </tr>
          </tbody>
        </table>

        {/* Section W4 — Session W4 Yield Assumptions */}
        <div style={sectionTitle}>W4. County Yield Assumptions (Session W4)</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginTop: 0 }}>
            The county yields strip introduces employment, revenue, water, and housing-pressure
            indicators derived from build-queue state and fiscal layer data.
            The following assumptions are documented here per the project convention.
          </p>

          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Jobs per MW (JOBS_PER_MW table) — confidence: low</strong><br />
            Point-estimate employment factors by action, sourced from NREL JEDI model (2023),
            DOE US Energy Employment Report (2024), and NEI nuclear employment factors (2022).
            Construction jobs = direct + indirect within-county during build period, normalized to
            deployment duration. Operations jobs = direct FTE permanent at facility.
            Actions without documented per-MW factors use engineering estimates.
            Selected values: wind utility 3.5 construction / 0.30 ops; solar utility 2.5 / 0.18;
            SMR/coal-to-SMR 7.5 / 1.50; geothermal 5.0 / 0.90. Full table in{' '}
            <code style={{ fontSize: 10 }}>src/ui/panels/CountyYields.tsx</code>.
          </p>

          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Housing Pressure Threshold: 10% of county labor force</strong><br />
            Boomtown literature documents visible housing and service-sector strain at 5–8%
            labor market saturation in small Wyoming counties during energy build-outs
            (Sweetwater County natural gas expansion 2001–2005; Campbell County coal mine
            workforce surge 2006–2008). The 10% flag threshold gives one planning era of
            notice before critical strain, typically documented at 15%+.
            Sources: WY Department of Workforce Services LAUS county-level data (2001–2012);
            Black et al. (2005), "The Local Economic Impact of Natural Gas Development,"
            <em>Energy Journal</em> 26(1); Jacquet (2014) rural boomtown review.
            The flag triggers the existing deficit-chip pattern: suggests affordable_housing
            and workforce_retraining without blocking gameplay.
          </p>

          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Revenue baseline denominator</strong><br />
            Derived from <code style={{ fontSize: 10 }}>CountyFiscal</code> by reversing cumulative deltas
            recorded in <code style={{ fontSize: 10 }}>fiscal_actions[]</code>. Baseline = current state
            minus sum of all recorded deltas per field. This approach guarantees the denominator
            is consistent with the engine's own ledger history without a separate baseline snapshot.
          </p>

          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Revenue breakdown — diverging treatment (Campbell County)</strong><br />
            Ledger A (ad valorem), B (severance), and C (school finance net) are shown as
            independently signed bars, never aggregated. Campbell County demonstrates why:
            retiring coal capacity reduces A and B (negative), but also reduces mineral assessed
            value, which decreases the county's equalized assessed value relative to state
            benchmarks, causing the per-pupil foundation program obligation to decline —
            Ledger C moves positive as the state recapture burden shrinks.
            A standard stacked-area chart would invert or obscure this sign divergence.
            See Session W3 "never-aggregate discipline" and Golden Fixture D.
          </p>

          <p style={{ marginBottom: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Water baseline</strong><br />
            <code style={{ fontSize: 10 }}>water_withdrawals_mgd</code> is null for all 157 study-area
            counties. Water yield renders "—" until USGS 2015 county-level water-use data is loaded.
            Per-action water withdrawal coefficients (from{' '}
            <code style={{ fontSize: 10 }}>coefficients_per_mw.water_consumption_m3_per_mwh</code>)
            are present only for data center actions.
            See Known Limitations §5 above.
          </p>
        </div>

        {/* Section 7 — Citation */}
        <div style={sectionTitle}>7. Citation</div>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '14px 18px',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <div style={{ marginBottom: 6 }}>
            <em>TODO:</em> Dissertation citation placeholder — to be added post-prototype.
          </div>
          <div>
            <em>TODO:</em> Project repository link — to be added post-prototype.
          </div>
        </div>

        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}
