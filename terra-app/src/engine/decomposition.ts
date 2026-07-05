/**
 * E/Ec/S Capital Decomposition — Narrative constituent mapping.
 *
 * These weights are CONCEPTUAL — they represent the proportion of variance
 * in each capital that the indicator conceptually explains. They are NOT
 * used in the engine's EES computation (which uses per-action ees_effects
 * coefficients directly). The decomposition view is a pedagogical tool.
 */

export interface DecompositionConstituent {
  indicatorId: string;
  label: string;
  weight: number;
  relationship: 'positive' | 'negative' | 'complex';
  rationale: string;
}

export interface CapitalDecomposition {
  capital: 'E' | 'Ec' | 'S';
  label: string;
  constituents: DecompositionConstituent[];
}

export const EES_DECOMPOSITION: Record<'E' | 'Ec' | 'S', CapitalDecomposition> = {
  E: {
    capital: 'E',
    label: 'Economic Energy Score',
    constituents: [
      {
        indicatorId: 'firm_margin',
        label: 'Firm Capacity Margin',
        weight: 0.55,
        relationship: 'positive',
        rationale: 'Grid reliability directly determines E; firm margin reflects supply adequacy relative to load.',
      },
      {
        indicatorId: 'cumulative_net',
        label: 'Cumulative Net Investment',
        weight: 0.45,
        relationship: 'positive',
        rationale: 'Sustained infrastructure investment raises long-term E via capacity additions and grid resilience.',
      },
    ],
  },
  Ec: {
    capital: 'Ec',
    label: 'Ecological Energy Score',
    constituents: [
      {
        indicatorId: 'fiscal_balance',
        label: 'Fiscal Balance',
        weight: 0.40,
        relationship: 'positive',
        rationale: 'Local revenue capacity is the primary Ec driver; mineral-dependent counties see Ec fall with production decline.',
      },
      {
        indicatorId: 'labor_utilization',
        label: 'Labor Utilization',
        weight: 0.30,
        relationship: 'complex',
        rationale: 'Moderate utilization (0.05–0.15) raises Ec; over-saturation (>0.30) strains services and depresses Ec.',
      },
      {
        indicatorId: 'cumulative_net',
        label: 'Cumulative Three-Ledger Net',
        weight: 0.30,
        relationship: 'positive',
        rationale: 'Long-term fiscal trajectory underpins economic capital across ad valorem, severance, and school finance ledgers.',
      },
    ],
  },
  S: {
    capital: 'S',
    label: 'Social Energy Score',
    constituents: [
      {
        indicatorId: 'housing_pressure',
        label: 'Housing Pressure',
        weight: 0.40,
        relationship: 'negative',
        rationale: 'High housing pressure (>1.25) directly reduces S via the boomtown penalty in advanceYear.',
      },
      {
        indicatorId: 'service_funding_per_capita',
        label: 'Service Funding Per Capita',
        weight: 0.35,
        relationship: 'positive',
        rationale: 'School finance adequacy drives social capital; mineral recapture counties face negative school_finance_net.',
      },
      {
        indicatorId: 'labor_headroom',
        label: 'Labor Headroom',
        weight: 0.25,
        relationship: 'positive',
        rationale: 'Available labor capacity indicates community absorptive capacity for new construction.',
      },
    ],
  },
};
