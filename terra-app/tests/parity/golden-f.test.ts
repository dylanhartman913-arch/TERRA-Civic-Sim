import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialState, computeExistingAssetsDigestMd5, computeFiscalDigestMd5 } from './helpers.js';
import { getExistingAssets, reduceProductionAsset } from '../../src/engine/engine.js';
import type { ProductionAsset } from '../../src/engine/types.js';

const fixture = loadFixture('golden_f') as {
  fixture_id: string;
  assertions: {
    delta_volume: number;
    new_volume: number;
    ledger_a_delta: number;
    ledger_b_delta: number;
    ledger_c_delta: number;
    ledger_a_status: string;
    ledger_c_sign: string;
    action_id: string;
  };
  county_fiscal_after: {
    '56005': {
      ledger_a_cumulative_delta: number;
      ledger_b_cumulative_delta: number;
      ledger_c_cumulative_delta: number;
      severance_share: number;
      advalorem_production: number;
      school_finance_net: number;
      assessed_mineral: number;
    };
  };
  digests_after: { fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_before: { fiscal_digest_md5: string; existing_assets_digest_md5: string };
};

describe('Golden F — Three-Ledger X2 Production Reduction', () => {
  it('(6a) reduceProductionAsset returns correct delta_volume and new_volume', () => {
    const state = loadInitialState();
    const [, summary] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    expect(summary['delta_volume']).toBe(fixture.assertions.delta_volume);
    expect(summary['new_volume']).toBe(fixture.assertions.new_volume);
  });

  it('(6b) Ledger A delta matches fixture (advalorem, county direct, no distribution share)', () => {
    const state = loadInitialState();
    const [, summary] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    expect(summary['ledger_a_delta'] as number).toBeCloseTo(fixture.assertions.ledger_a_delta, 0);
    expect(summary['ledger_a_status']).toBe(fixture.assertions.ledger_a_status);
  });

  it('(6c) Ledger B delta matches fixture (severance × county_distribution_share)', () => {
    const state = loadInitialState();
    const [, summary] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    expect(summary['ledger_b_delta'] as number).toBeCloseTo(fixture.assertions.ledger_b_delta, 0);
  });

  it('(6d) Ledger C delta is positive and matches fixture (recapture burden shrinks for Campbell)', () => {
    const state = loadInitialState();
    const [, summary] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    expect(summary['ledger_c_delta'] as number).toBeGreaterThan(0);
    expect(summary['ledger_c_delta'] as number).toBeCloseTo(fixture.assertions.ledger_c_delta, 0);
  });

  it('(6e) action_id recorded in fiscal_actions matches Python convention', () => {
    const state = loadInitialState();
    const [newState] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    const cf = newState.county_fiscal?.['56005'];
    expect(cf).toBeDefined();
    const prodAction = cf!.fiscal_actions.find(a => a.action_id.startsWith('production_decline_'));
    expect(prodAction).toBeDefined();
    expect(prodAction!.action_id).toBe(fixture.assertions.action_id);
  });

  it('(6f) county_fiscal cumulative ledgers and fiscal fields match fixture after X2', () => {
    const state = loadInitialState();
    const [newState] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    const cf = newState.county_fiscal?.['56005'];
    expect(cf).toBeDefined();
    const expected = fixture.county_fiscal_after['56005'];
    expect(cf!.ledger_a_cumulative_delta).toBeCloseTo(expected.ledger_a_cumulative_delta, 0);
    expect(cf!.ledger_b_cumulative_delta).toBeCloseTo(expected.ledger_b_cumulative_delta, 0);
    expect(cf!.ledger_c_cumulative_delta).toBeCloseTo(expected.ledger_c_cumulative_delta, 0);
    expect(cf!.severance_share).toBeCloseTo(expected.severance_share, 0);
    expect(cf!.advalorem_production).toBeCloseTo(expected.advalorem_production, 0);
    expect(cf!.school_finance_net).toBeCloseTo(expected.school_finance_net, 0);
    expect(cf!.assessed_mineral).toBeCloseTo(expected.assessed_mineral, 0);
  });

  it('(6g) fiscal_digest_md5 matches fixture after X2', () => {
    const state = loadInitialState();
    const [newState] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    const { md5 } = computeFiscalDigestMd5(newState);
    expect(md5).toBe(fixture.digests_after.fiscal_digest_md5);
  });

  it('(6h) existing_assets_digest_md5 matches fixture after X2 (production_volume reduced)', () => {
    const state = loadInitialState();
    const [newState] = reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    const { md5 } = computeExistingAssetsDigestMd5(newState);
    expect(md5).toBe(fixture.digests_after.existing_assets_digest_md5);
  });

  it('(6i) original state is unmodified (pure function)', () => {
    const state = loadInitialState();
    const { md5: beforeMd5 } = computeExistingAssetsDigestMd5(state);
    expect(beforeMd5).toBe(fixture.digests_before.existing_assets_digest_md5);
    reduceProductionAsset(state, '56005', 'coal_surface', 10_000_000);
    const { md5: afterCallMd5 } = computeExistingAssetsDigestMd5(state);
    expect(afterCallMd5).toBe(fixture.digests_before.existing_assets_digest_md5);

    const prb = getExistingAssets(state, '56005').find(e => e.name.includes('Powder River Basin')) as ProductionAsset;
    expect(prb.production_volume).toBe(170_045_000);
  });
});
