import React, { useState, useMemo } from 'react';

// ─── EMBEDDED DATA ─────────────────────────────────────────────────────────────
// Source: data/processed/mw_scenario_profiles.json  +  mw_ecoregion_ees_summary.csv
// Auto-generated — do not edit the PROFILES / BA_REGIONS constants by hand.

const PROFILES = {
  "stagnation": {
    "scenario_name": "Stagnation / Capital Collapse",
    "group": "diagonal",
    "targets": {
      "E": 2,
      "Ec": 2,
      "S": 2
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "extraction_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 10,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "direct",
    "energy_system_note": "Nearest analog is E4ST baseline but with declining capital \u2014 energy system drifts below baseline trajectory. No E4ST scenario models active capital erosion; partial match."
  },
  "below_baseline_drift": {
    "scenario_name": "Below-Baseline Drift",
    "group": "diagonal",
    "targets": {
      "E": 4,
      "Ec": 4,
      "S": 4
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "extraction_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 15,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "direct",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "status_quo": {
    "scenario_name": "Status Quo (No New Policy)",
    "group": "diagonal",
    "targets": {
      "E": 5,
      "Ec": 5,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 20,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 25,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "partial",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "managed_transition": {
    "scenario_name": "Managed Energy Transition",
    "group": "diagonal",
    "targets": {
      "E": 7,
      "Ec": 7,
      "S": 7
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 50,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 80,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_ira",
    "e4st_match_quality": "direct",
    "energy_system_note": "Combined carbon tax + IRA scenario: CO2 drops 22% to 1049 Mt in 2025, LMP $37/MWh in 2035. Maximum clean buildout nationally including SMR; Wyoming wind and solar investment highest of all scenarios."
  },
  "balanced_thriving": {
    "scenario_name": "Balanced Thriving",
    "group": "diagonal",
    "targets": {
      "E": 9,
      "Ec": 9,
      "S": 9
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 100,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 80,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "streamlined",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 200,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "extrapolated",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "e_dominant": {
    "scenario_name": "Environmental Capital Dominant",
    "group": "capital_dominant",
    "targets": {
      "E": 8,
      "Ec": 5,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 30,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_50",
    "e4st_match_quality": "partial",
    "energy_system_note": "$50/ton carbon tax scenario: CO2 drops 21% to 1060 Mt in 2025, median LMP rises to $37/MWh in 2035. Significant wind, battery, and gas CC buildout nationally; Wyoming LMP remains below national median."
  },
  "ec_dominant": {
    "scenario_name": "Economic Capital Dominant",
    "group": "capital_dominant",
    "targets": {
      "E": 5,
      "Ec": 8,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 40,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 50,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "partial",
    "energy_system_note": "IRA investment tax credit scenario: ITC subsidies drive renewable and battery buildout but CO2 is unchanged (~1349 Mt) \u2014 new clean capacity displaces planned gas additions rather than existing coal. National LMP falls to $6/MWh in 2025 due to clean energy surplus."
  },
  "s_dominant": {
    "scenario_name": "Social Capital Dominant",
    "group": "capital_dominant",
    "targets": {
      "E": 5,
      "Ec": 5,
      "S": 8
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 20,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "direct",
    "energy_system_note": "IRA investment tax credit scenario: ITC subsidies drive renewable and battery buildout but CO2 is unchanged (~1349 Mt) \u2014 new clean capacity displaces planned gas additions rather than existing coal. National LMP falls to $6/MWh in 2025 due to clean energy surplus."
  },
  "e_ec_dominant": {
    "scenario_name": "Environmental + Economic Dominant",
    "group": "capital_dominant",
    "targets": {
      "E": 8,
      "Ec": 8,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 40,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 80,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_ira",
    "e4st_match_quality": "direct",
    "energy_system_note": "Combined carbon tax + IRA scenario: CO2 drops 22% to 1049 Mt in 2025, LMP $37/MWh in 2035. Maximum clean buildout nationally including SMR; Wyoming wind and solar investment highest of all scenarios."
  },
  "e_s_dominant": {
    "scenario_name": "Environmental + Social Dominant",
    "group": "capital_dominant",
    "targets": {
      "E": 8,
      "Ec": 5,
      "S": 8
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 30,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_50",
    "e4st_match_quality": "partial",
    "energy_system_note": "$50/ton carbon tax scenario: CO2 drops 21% to 1060 Mt in 2025, median LMP rises to $37/MWh in 2035. Significant wind, battery, and gas CC buildout nationally; Wyoming LMP remains below national median."
  },
  "ec_s_dominant": {
    "scenario_name": "Economic + Social Dominant",
    "group": "capital_dominant",
    "targets": {
      "E": 5,
      "Ec": 8,
      "S": 8
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 40,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 50,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "partial",
    "energy_system_note": "IRA investment tax credit scenario: ITC subsidies drive renewable and battery buildout but CO2 is unchanged (~1349 Mt) \u2014 new clean capacity displaces planned gas additions rather than existing coal. National LMP falls to $6/MWh in 2025 due to clean energy surplus."
  },
  "e_strong_others_weak": {
    "scenario_name": "E Strong, Ec/S Weak",
    "group": "capital_dominant",
    "targets": {
      "E": 8,
      "Ec": 3,
      "S": 3
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 20,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_50",
    "e4st_match_quality": "partial",
    "energy_system_note": "$50/ton carbon tax scenario: CO2 drops 21% to 1060 Mt in 2025, median LMP rises to $37/MWh in 2035. Significant wind, battery, and gas CC buildout nationally; Wyoming LMP remains below national median."
  },
  "ec_strong_others_weak": {
    "scenario_name": "Ec Strong, E/S Weak",
    "group": "capital_dominant",
    "targets": {
      "E": 3,
      "Ec": 8,
      "S": 3
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "extraction_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 10,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "direct",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "s_strong_others_weak": {
    "scenario_name": "S Strong, E/Ec Weak",
    "group": "capital_dominant",
    "targets": {
      "E": 3,
      "Ec": 3,
      "S": 8
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "extraction_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 10,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "direct",
    "energy_system_note": "IRA investment tax credit scenario: ITC subsidies drive renewable and battery buildout but CO2 is unchanged (~1349 Mt) \u2014 new clean capacity displaces planned gas additions rather than existing coal. National LMP falls to $6/MWh in 2025 due to clean energy surplus."
  },
  "eco_extreme": {
    "scenario_name": "Eco-Extreme (Conservation Only)",
    "group": "corner",
    "targets": {
      "E": 9,
      "Ec": 2,
      "S": 2
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 100,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 10,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "extrapolated",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "econ_extreme": {
    "scenario_name": "Econ-Extreme (Fossil Extraction Peak)",
    "group": "corner",
    "targets": {
      "E": 2,
      "Ec": 9,
      "S": 2
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "extraction_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 10,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "direct",
    "energy_system_note": "Nearest analog is E4ST baseline (no carbon price, extraction-favoring). Ec=9 from fossil extraction implies production volumes exceeding current baseline \u2014 outside E4ST solution space; energy system response extrapolated."
  },
  "social_extreme": {
    "scenario_name": "Social-Extreme (Welfare State, No Economy)",
    "group": "corner",
    "targets": {
      "E": 2,
      "Ec": 2,
      "S": 9
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 10,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "direct",
    "energy_system_note": "IRA scenario is the nearest analog (social programs funded by clean energy tax base). S=9 requires institutional investment beyond what IRA alone delivers; extrapolated."
  },
  "eco_econ_paired": {
    "scenario_name": "Eco + Econ Paired (Green Growth, Low Social)",
    "group": "corner",
    "targets": {
      "E": 9,
      "Ec": 9,
      "S": 2
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 100,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 80,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "streamlined",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 150,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "extrapolated",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "coal_retirement_no_reinvestment": {
    "scenario_name": "Coal Retirement Without Reinvestment",
    "group": "transition",
    "targets": {
      "E": 3,
      "Ec": 4,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 15,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "direct",
    "energy_system_note": "Baseline scenario: coal retires under market pressure without policy replacement. E4ST baseline shows coal remaining competitive absent carbon price; this profile represents a market-only coal exit not captured in the solved scenarios."
  },
  "coordinated_transition": {
    "scenario_name": "Coordinated Clean Energy Transition",
    "group": "transition",
    "targets": {
      "E": 6,
      "Ec": 7,
      "S": 6
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 50,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 100,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_ira",
    "e4st_match_quality": "direct",
    "energy_system_note": "Combined carbon tax + IRA scenario: CO2 drops 22% to 1049 Mt in 2025, LMP $37/MWh in 2035. Maximum clean buildout nationally including SMR; Wyoming wind and solar investment highest of all scenarios."
  },
  "extractive_lock_in": {
    "scenario_name": "Extractive Lock-In (Fossil Dependency)",
    "group": "transition",
    "targets": {
      "E": 2,
      "Ec": 7,
      "S": 3
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "extraction_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 10,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "direct",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "eco_tech_buildout": {
    "scenario_name": "Eco-Tech Buildout (Clean Energy on Degraded Land)",
    "group": "transition",
    "targets": {
      "E": 8,
      "Ec": 6,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 60,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 60,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_50",
    "e4st_match_quality": "partial",
    "energy_system_note": "$50/ton carbon tax scenario: CO2 drops 21% to 1060 Mt in 2025, median LMP rises to $37/MWh in 2035. Significant wind, battery, and gas CC buildout nationally; Wyoming LMP remains below national median."
  },
  "resilient_communities": {
    "scenario_name": "Resilient Communities (Social Infrastructure Priority)",
    "group": "transition",
    "targets": {
      "E": 5,
      "Ec": 6,
      "S": 8
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 20,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 30,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "direct",
    "energy_system_note": "IRA investment tax credit scenario: ITC subsidies drive renewable and battery buildout but CO2 is unchanged (~1349 Mt) \u2014 new clean capacity displaces planned gas additions rather than existing coal. National LMP falls to $6/MWh in 2025 due to clean energy surplus."
  },
  "federal_lands_conservation": {
    "scenario_name": "Federal Lands Conservation (No Carbon Price)",
    "group": "transition",
    "targets": {
      "E": 7,
      "Ec": 4,
      "S": 4
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 20,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "extrapolated",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "fossil_exit_no_replacement": {
    "scenario_name": "Fossil Exit Without Replacement Employment",
    "group": "transition",
    "targets": {
      "E": 3,
      "Ec": 3,
      "S": 4
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 20,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_50",
    "e4st_match_quality": "direct",
    "energy_system_note": "$50/ton carbon tax scenario: CO2 drops 21% to 1060 Mt in 2025, median LMP rises to $37/MWh in 2035. Significant wind, battery, and gas CC buildout nationally; Wyoming LMP remains below national median."
  },
  "ira_renewable_boom": {
    "scenario_name": "IRA Renewable Investment Boom",
    "group": "transition",
    "targets": {
      "E": 5,
      "Ec": 7,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 40,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 80,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "partial",
    "energy_system_note": "IRA investment tax credit scenario: ITC subsidies drive renewable and battery buildout but CO2 is unchanged (~1349 Mt) \u2014 new clean capacity displaces planned gas additions rather than existing coal. National LMP falls to $6/MWh in 2025 due to clean energy surplus."
  },
  "wyoming_sagebrush_restoration": {
    "scenario_name": "Wyoming Sagebrush Restoration Initiative",
    "group": "transition",
    "targets": {
      "E": 7,
      "Ec": 4,
      "S": 5
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "conservation_favoring",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 15,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "baseline",
    "e4st_match_quality": "extrapolated",
    "energy_system_note": "Baseline scenario: no carbon price, continued fossil dispatch dominance. National CO2 ~1349 Mt in 2025, median LMP ~$14/MWh in 2035. No net-new renewable investment triggered by policy."
  },
  "tribal_sovereignty_model": {
    "scenario_name": "Tribal Sovereignty and Co-Management Model",
    "group": "transition",
    "targets": {
      "E": 6,
      "Ec": 4,
      "S": 7
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 0,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 20,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "ira_itc",
    "e4st_match_quality": "direct",
    "energy_system_note": "IRA investment tax credit scenario: ITC subsidies drive renewable and battery buildout but CO2 is unchanged (~1349 Mt) \u2014 new clean capacity displaces planned gas additions rather than existing coal. National LMP falls to $6/MWh in 2025 due to clean energy surplus."
  },
  "carbon_tax_high_wage": {
    "scenario_name": "Carbon Tax with High-Wage Transition Jobs",
    "group": "transition",
    "targets": {
      "E": 5,
      "Ec": 6,
      "S": 6
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 0,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "current",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 30,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 0,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_50",
    "e4st_match_quality": "direct",
    "energy_system_note": "$50/ton carbon tax scenario: CO2 drops 21% to 1060 Mt in 2025, median LMP rises to $37/MWh in 2035. Significant wind, battery, and gas CC buildout nationally; Wyoming LMP remains below national median."
  },
  "just_transition_target": {
    "scenario_name": "Just Transition Target (Balanced with Social Emphasis)",
    "group": "transition",
    "targets": {
      "E": 6,
      "Ec": 6,
      "S": 7
    },
    "conditions": [
      {
        "type": "policy",
        "name": "carbon_price",
        "threshold": 50,
        "unit": "$/ton"
      },
      {
        "type": "policy",
        "name": "ira_subsidies",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "policy",
        "name": "clean_energy_standard",
        "threshold": 40,
        "unit": "pct_by_2035"
      },
      {
        "type": "policy",
        "name": "transmission_permitting",
        "threshold": "reformed",
        "unit": "regime"
      },
      {
        "type": "policy",
        "name": "federal_land_management",
        "threshold": "balanced",
        "unit": "posture"
      },
      {
        "type": "infrastructure",
        "name": "storage_deployment",
        "threshold": 80,
        "unit": "GWh"
      },
      {
        "type": "infrastructure",
        "name": "hydrogen_infrastructure",
        "threshold": 0,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "workforce_transition_program",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "regional_planning_authority",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "tribal_co_management",
        "threshold": 1,
        "unit": "binary"
      },
      {
        "type": "institutional",
        "name": "university_research_presence",
        "threshold": 1,
        "unit": "binary"
      }
    ],
    "e4st_scenario_id": "carbon_tax_ira",
    "e4st_match_quality": "direct",
    "energy_system_note": "Combined carbon tax + IRA scenario: CO2 drops 22% to 1049 Mt in 2025, LMP $37/MWh in 2035. Maximum clean buildout nationally including SMR; Wyoming wind and solar investment highest of all scenarios."
  }
};

// BA territory EES baselines — arithmetic mean of underlying ecoregion scores
// Ecoregion baseline sources: mw_ecoregion_ees_summary.csv
// BA→eco mapping mirrors BA_ECO_MAP in terra_sandbox.jsx
const BA_REGIONS = [
  { code: "BPAT", name: "Bonneville Power Admin.",  abbr: "BPAT", E: 4.306, Ec: 5.920, S: 5.088 },
  { code: "NWMT", name: "NorthWestern Energy",      abbr: "NWMT", E: 4.759, Ec: 5.835, S: 5.033 },
  { code: "WAUW", name: "WAPA Upper Plains West",   abbr: "WAUW", E: 2.961, Ec: 5.824, S: 4.855 },
  { code: "IPCO", name: "Idaho Power",              abbr: "IPCO", E: 4.306, Ec: 5.920, S: 5.088 },
  { code: "NEVP", name: "Nevada Power",             abbr: "NEVP", E: 1.371, Ec: 6.016, S: 4.961 },
  { code: "PACE", name: "PacifiCorp East",          abbr: "PACE", E: 2.571, Ec: 5.896, S: 4.968 },
  { code: "WACM", name: "WAPA Rocky Mtn. Region",  abbr: "WACM", E: 3.392, Ec: 6.425, S: 5.158 },
  { code: "PSCO", name: "Public Service Colorado",  abbr: "PSCO", E: 2.801, Ec: 6.414, S: 5.158 },
  { code: "AZPS", name: "Arizona Public Service",   abbr: "AZPS", E: 0.686, Ec: 6.036, S: 4.957 },
  { code: "SRP",  name: "Salt River Project",       abbr: "SRP",  E: 0.686, Ec: 6.036, S: 4.957 },
  { code: "PNM",  name: "Public Service NM",        abbr: "PNM",  E: 4.105, Ec: 6.158, S: 5.171 },
  { code: "EPE",  name: "El Paso Electric",         abbr: "EPE",  E: 7.524, Ec: 6.280, S: 5.385 },
];

// Schematic polygons — 600×500 viewport, rough geographic arrangement.
// 4-col (150px) × 4-row (125px) grid; BPAT and PACE span 2 cols; AZPS spans 2 rows.
const BA_POLYS_SCHEMATIC = [
  { code: "BPAT", label: ["BPAT", "Bonneville"],         points: "0,0 300,0 300,125 0,125",        cx: 150, cy:  62 },
  { code: "NWMT", label: ["NWMT", "NW Energy"],          points: "300,0 450,0 450,125 300,125",     cx: 375, cy:  62 },
  { code: "WAUW", label: ["WAUW", "WAPA Upper"],         points: "450,0 600,0 600,125 450,125",     cx: 525, cy:  62 },
  { code: "IPCO", label: ["IPCO", "Idaho Power"],        points: "0,125 150,125 150,250 0,250",     cx:  75, cy: 188 },
  { code: "NEVP", label: ["NEVP", "Nevada Power"],       points: "150,125 300,125 300,250 150,250", cx: 225, cy: 188 },
  { code: "PACE", label: ["PACE", "PacifiCorp E"],       points: "300,125 600,125 600,250 300,250", cx: 450, cy: 188 },
  { code: "AZPS", label: ["AZPS", "APS"],                points: "0,250 150,250 150,500 0,500",     cx:  75, cy: 375 },
  { code: "WACM", label: ["WACM", "WAPA Rocky Mtn"],    points: "150,250 450,250 450,375 150,375", cx: 300, cy: 312 },
  { code: "PSCO", label: ["PSCO", "Public Svc CO"],      points: "450,250 600,250 600,375 450,375", cx: 525, cy: 312 },
  { code: "SRP",  label: ["SRP"],                        points: "150,375 300,375 300,500 150,500", cx: 225, cy: 438 },
  { code: "PNM",  label: ["PNM", "Public Svc NM"],       points: "300,375 450,375 450,500 300,500", cx: 375, cy: 438 },
  { code: "EPE",  label: ["EPE", "El Paso Elec"],        points: "450,375 600,375 600,500 450,500", cx: 525, cy: 438 },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const dist3 = (a, b) =>
  Math.sqrt((a.E - b.E) ** 2 + (a.Ec - b.Ec) ** 2 + (a.S - b.S) ** 2);

const findActiveProfile = (E, Ec, S) => {
  let bestPid = null, bestDist = Infinity;
  for (const [pid, p] of Object.entries(PROFILES)) {
    const d = dist3({ E, Ec, S }, p.targets);
    if (d < bestDist) { bestDist = d; bestPid = pid; }
  }
  return bestPid;
};

const baGap = (ba, E, Ec, S) => {
  const gE  = Math.max(0, E  - ba.E);
  const gEc = Math.max(0, Ec - ba.Ec);
  const gS  = Math.max(0, S  - ba.S);
  return (gE + gEc + gS) / 3;
};

const gapFill = (gap) => {
  if (gap <= 0.1) return '#2dd4bf';
  if (gap <= 2.0) return '#f59e0b';
  return '#ef4444';
};

const bandOf = (v) => (v <= 4 ? 0 : v <= 7 ? 1 : 2);

const BAND_CENTERS = [3, 5.5, 8.5];
const BAND_LABELS  = ['low', 'mid', 'high'];

// ─── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#0f1117',
  surface:  '#1a1d27',
  border:   '#2a2d3a',
  teal:     '#2dd4bf',
  amber:    '#f59e0b',
  red:      '#ef4444',
  purple:   '#a78bfa',
  text:     '#e2e8f0',
  muted:    '#94a3b8',
  font:     "'DM Mono','Fira Mono','Courier New',monospace",
};

const card = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: 16,
};

const sectionHeader = {
  fontSize: '0.78rem',
  fontFamily: T.font,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: T.muted,
  marginBottom: 12,
};

// ─── VERTICAL SLIDER ───────────────────────────────────────────────────────────

function VerticalSlider({ label, colorKey, value, onChange }) {
  const pct = ((value - 1) / 9) * 100;
  const color = colorKey === 'E' ? T.teal : colorKey === 'Ec' ? T.amber : T.purple;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
      <span style={{ fontSize: '0.65rem', fontFamily: T.font, color: T.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ position: 'relative', height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* track background */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 4,
          transform: 'translateX(-50%)', background: T.border, borderRadius: 2,
        }} />
        {/* filled portion */}
        <div style={{
          position: 'absolute', left: '50%', bottom: 0, width: 4,
          height: `${pct}%`,
          transform: 'translateX(-50%)', background: color, borderRadius: 2,
        }} />
        <input
          type="range" min={1} max={10} step={0.5} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{
            position: 'relative', zIndex: 1,
            writingMode: 'vertical-lr', direction: 'rtl',
            WebkitAppearance: 'slider-vertical',
            appearance: 'slider-vertical',
            height: 180, width: 28,
            background: 'transparent', cursor: 'pointer',
            margin: 0, padding: 0,
            outline: 'none',
          }}
        />
      </div>
      <span style={{ fontSize: '1.1rem', fontFamily: T.font, fontWeight: 'bold', color }}>
        {value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}
      </span>
    </div>
  );
}

// ─── RADAR CHART ───────────────────────────────────────────────────────────────

function RadarChart({ eco, E, Ec, S }) {
  const cx = 130, cy = 120, maxR = 85;
  // axes: E=up(270°), Ec=lower-right(30°), S=lower-left(150°)
  const AXES = [
    { label: 'E',  angle: 270, baseVal: eco.E,  targetVal: E  },
    { label: 'Ec', angle:  30, baseVal: eco.Ec, targetVal: Ec },
    { label: 'S',  angle: 150, baseVal: eco.S,  targetVal: S  },
  ];

  const pt = (angleDeg, val) => {
    const r   = (val / 10) * maxR;
    const rad = (angleDeg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };

  const gridLevels = [2, 4, 6, 8, 10];

  const baselinePts = AXES.map(a => pt(a.angle, a.baseVal).join(',')).join(' ');
  const targetPts   = AXES.map(a => pt(a.angle, a.targetVal).join(',')).join(' ');

  return (
    <svg viewBox="0 0 260 240" style={{ width: '100%', maxWidth: 280 }}>
      {/* grid rings */}
      {gridLevels.map(lv => {
        const gPts = AXES.map(a => pt(a.angle, lv).join(',')).join(' ');
        return <polygon key={lv} points={gPts} fill="none" stroke={T.border} strokeWidth={0.75} />;
      })}
      {/* axis lines */}
      {AXES.map(a => {
        const [x2, y2] = pt(a.angle, 10);
        return <line key={a.label} x1={cx} y1={cy} x2={x2} y2={y2} stroke={T.border} strokeWidth={1} />;
      })}
      {/* baseline polygon */}
      <polygon points={baselinePts} fill={T.teal} fillOpacity={0.18} stroke={T.teal} strokeWidth={2} />
      {/* target polygon */}
      <polygon points={targetPts} fill={T.amber} fillOpacity={0.12} stroke={T.amber} strokeWidth={2} strokeDasharray="5 3" />
      {/* axis labels */}
      {AXES.map(a => {
        const [x, y] = pt(a.angle, 11.5);
        return (
          <text key={a.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 11, fill: T.muted, fontFamily: T.font }}>
            {a.label}
          </text>
        );
      })}
      {/* center dot */}
      <circle cx={cx} cy={cy} r={3} fill={T.border} />
    </svg>
  );
}

// ─── PATHWAY CONDITIONS ────────────────────────────────────────────────────────

function PathwayConditions({ profile }) {
  if (!profile) return null;
  const byType = { policy: [], infrastructure: [], institutional: [] };
  for (const c of (profile.conditions || [])) {
    (byType[c.type] || byType.policy).push(c);
  }
  const typeColor = { policy: T.teal, infrastructure: T.amber, institutional: T.purple };
  const typeLabel = { policy: 'Policy', infrastructure: 'Infrastructure', institutional: 'Institutional' };

  return (
    <div>
      <div style={sectionHeader}>Pathway Conditions</div>
      <div style={{ fontSize: '0.7rem', fontFamily: T.font, color: T.purple, marginBottom: 10 }}>
        {profile.scenario_name}
      </div>
      {Object.entries(byType).map(([type, conds]) => conds.length === 0 ? null : (
        <div key={type} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.6rem', fontFamily: T.font, color: typeColor[type],
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
            {typeLabel[type]}
          </div>
          {conds.map((c, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '3px 0', borderBottom: `1px solid ${T.border}`,
              fontSize: '0.68rem', fontFamily: T.font,
            }}>
              <span style={{ color: T.muted }}>{c.name.replace(/_/g, ' ')}</span>
              <span style={{ color: T.text, marginLeft: 8 }}>
                {typeof c.threshold === 'number'
                  ? c.threshold === 0 ? '—'
                  : c.threshold === 1 ? '✓'
                  : `${c.threshold} ${c.unit}`
                  : c.threshold}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 10, padding: '6px 8px', background: T.bg, borderRadius: 4,
        fontSize: '0.6rem', fontFamily: T.font, color: T.muted, lineHeight: 1.5 }}>
        <span style={{ color: T.teal }}>e4st: </span>
        {profile.e4st_scenario_id} · {profile.e4st_match_quality}
      </div>
    </div>
  );
}

// ─── BA DETAIL ──────────────────────────────────────────────────────────────────────────────────

function BADetail({ ba, E, Ec, S, onBack }) {
  const gaps = [
    { label: 'E',  gap: Math.max(0, E  - ba.E),  base: ba.E,  target: E  },
    { label: 'Ec', gap: Math.max(0, Ec - ba.Ec), base: ba.Ec, target: Ec },
    { label: 'S',  gap: Math.max(0, S  - ba.S),  base: ba.S,  target: S  },
  ];
  const color = { E: T.teal, Ec: T.amber, S: T.purple };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button onClick={onBack} style={{
          background: 'none', border: `1px solid ${T.border}`, borderRadius: 4,
          color: T.muted, cursor: 'pointer', fontFamily: T.font,
          fontSize: '0.65rem', padding: '2px 8px',
        }}>← back</button>
        <span style={{ ...sectionHeader, marginBottom: 0 }}>{ba.name}</span>
        <span style={{ fontSize: '0.62rem', color: T.muted }}>{ba.abbr}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <RadarChart eco={ba} E={E} Ec={Ec} S={S} />
      </div>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: '0.6rem',
        fontFamily: T.font, color: T.muted, marginBottom: 12 }}>
        <span><span style={{ borderBottom: `2px solid ${T.teal}`, paddingBottom: 1, marginRight: 3 }}>──</span>baseline</span>
        <span><span style={{ borderBottom: `2px dashed ${T.amber}`, paddingBottom: 1, marginRight: 3 }}>- -</span>target</span>
      </div>
      {/* gap table */}
      <div style={{ fontSize: '0.65rem', fontFamily: T.font }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
          padding: '4px 0', borderBottom: `1px solid ${T.border}`,
          color: T.muted, fontSize: '0.6rem', letterSpacing: '0.08em' }}>
          <span>capital</span><span>baseline</span><span>target</span><span>gap</span>
        </div>
        {gaps.map(g => (
          <div key={g.label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
            padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
            <span style={{ color: color[g.label], fontWeight: 'bold' }}>{g.label}</span>
            <span style={{ color: T.muted }}>{g.base.toFixed(2)}</span>
            <span style={{ color: T.text }}>{g.target.toFixed(1)}</span>
            <span style={{ color: g.gap < 0.1 ? T.teal : g.gap < 2 ? T.amber : T.red }}>
              {g.gap < 0.01 ? '✓' : `+${g.gap.toFixed(2)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── SCENARIO MATRIX ───────────────────────────────────────────────────────────

function ScenarioMatrix({ E, Ec, S, onSnap }) {
  const matrixCells = useMemo(() => {
    const cells = {};
    for (let er = 0; er < 3; er++) {
      for (let ecr = 0; ecr < 3; ecr++) {
        const ref = { E: BAND_CENTERS[er], Ec: BAND_CENTERS[ecr], S: 5.5 };
        let bestPid = null, bestD = Infinity;
        for (const [pid, p] of Object.entries(PROFILES)) {
          const d = dist3(ref, p.targets);
          if (d < bestD) { bestD = d; bestPid = pid; }
        }
        cells[`${er}_${ecr}`] = { pid: bestPid, profile: PROFILES[bestPid] };
      }
    }
    return cells;
  }, []);

  const activeBandE  = bandOf(E);
  const activeBandEc = bandOf(Ec);

  return (
    <div>
      <div style={sectionHeader}>Scenario Space</div>
      {/* axis labels row */}
      <div style={{ display: 'flex', marginBottom: 4 }}>
        <div style={{ width: 24 }} />
        {[0, 1, 2].map(ecr => (
          <div key={ecr} style={{ flex: 1, textAlign: 'center',
            fontSize: '0.55rem', fontFamily: T.font, color: T.amber }}>
            Ec {BAND_LABELS[ecr]}
          </div>
        ))}
      </div>
      {/* rows — high E at top */}
      {[2, 1, 0].map(er => (
        <div key={er} style={{ display: 'flex', alignItems: 'stretch', marginBottom: 3 }}>
          {/* row label */}
          <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', fontFamily: T.font, color: T.teal,
            writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            E {BAND_LABELS[er]}
          </div>
          {[0, 1, 2].map(ecr => {
            const cell = matrixCells[`${er}_${ecr}`];
            const isActive = er === activeBandE && ecr === activeBandEc;
            const sVal = cell?.profile?.targets?.S ?? 5;
            // S encodes shade intensity: low S → dim, high S → brighter
            const sAlpha = 0.15 + (sVal / 10) * 0.5;
            return (
              <div key={ecr}
                onClick={() => {
                  if (cell?.profile) {
                    const t = cell.profile.targets;
                    onSnap(t.E, t.Ec, t.S);
                  }
                }}
                title={cell?.profile?.scenario_name}
                style={{
                  flex: 1,
                  minHeight: 52,
                  background: isActive
                    ? `rgba(167,139,250,${sAlpha + 0.2})`
                    : `rgba(45,212,191,${sAlpha})`,
                  border: `1px solid ${isActive ? T.purple : T.border}`,
                  borderRadius: 4,
                  padding: '4px 3px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textAlign: 'center',
                  marginLeft: ecr === 0 ? 0 : 2,
                  transition: 'background 0.15s',
                }}>
                <span style={{
                  fontSize: '0.55rem', fontFamily: T.font, lineHeight: 1.35,
                  color: isActive ? T.text : T.muted,
                }}>
                  {cell?.profile?.scenario_name ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ fontSize: '0.55rem', fontFamily: T.font, color: T.muted, marginTop: 4 }}>
        S encoded as cell brightness · click to snap sliders
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function TerraConfigurator() {
  const [E,   setE]   = useState(5);
  const [Ec,  setEc]  = useState(5);
  const [S,   setS]   = useState(5);
  const [hoveredBA,   setHoveredBA]   = useState(null);
  const [selectedBA,  setSelectedBA]  = useState(null);
  const [hoverPos,    setHoverPos]    = useState({ x: 0, y: 0 });

  const activePid     = useMemo(() => findActiveProfile(E, Ec, S), [E, Ec, S]);
  const activeProfile = PROFILES[activePid];

  const handleBAClick = (code) => {
    setSelectedBA(prev => (prev === code ? null : code));
  };

  const handleSnap = (eVal, ecVal, sVal) => {
    setE(eVal); setEc(ecVal); setS(sVal);
  };

  const selectedBAData = selectedBA
    ? BA_REGIONS.find(b => b.code === selectedBA)
    : null;

  return (
    <div style={{
      background: T.bg, color: T.text,
      fontFamily: T.font,
      minWidth: 1200, minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '240px 1fr 360px',
      gridTemplateRows: 'auto 1fr',
      gap: 12, padding: 16,
      boxSizing: 'border-box',
    }}>

      {/* ── HEADER BAR ─────────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex', alignItems: 'baseline', gap: 16,
        paddingBottom: 10, borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: '1rem', letterSpacing: '0.15em', color: T.teal, fontWeight: 'bold' }}>
          TERRA CONFIGURATOR
        </span>
        <span style={{ fontSize: '0.7rem', color: T.muted }}>
          Environmental × Economic × Social capital scenario explorer — Mountain West TERRA prototype
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: T.muted }}>
          {Object.keys(PROFILES).length} scenarios · 12 regions
        </span>
      </div>

      {/* ── PANEL 1: CAPITAL SLIDERS ────────────────────────────────────────── */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={sectionHeader}>Capital Targets</div>

        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', padding: '8px 0' }}>
          <VerticalSlider label="Environmental" colorKey="E"  value={E}  onChange={setE}  />
          <VerticalSlider label="Economic"      colorKey="Ec" value={Ec} onChange={setEc} />
          <VerticalSlider label="Social"        colorKey="S"  value={S}  onChange={setS}  />
        </div>

        {/* EES target summary */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 12,
          fontSize: '0.75rem', fontFamily: T.font,
        }}>
          <span style={{ color: T.teal }}>E {E % 1 === 0 ? E.toFixed(0) : E.toFixed(1)}</span>
          <span style={{ color: T.border }}>·</span>
          <span style={{ color: T.amber }}>Ec {Ec % 1 === 0 ? Ec.toFixed(0) : Ec.toFixed(1)}</span>
          <span style={{ color: T.border }}>·</span>
          <span style={{ color: T.purple }}>S {S % 1 === 0 ? S.toFixed(0) : S.toFixed(1)}</span>
        </div>

        {/* Active scenario card */}
        <div style={{
          padding: '10px 12px',
          background: T.bg,
          borderRadius: 6, border: `1px solid ${T.border}`,
          marginTop: 'auto',
        }}>
          <div style={{ fontSize: '0.6rem', color: T.muted, letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: 5 }}>
            Nearest Profile
          </div>
          <div style={{ fontSize: '0.82rem', color: T.purple, lineHeight: 1.4 }}>
            {activeProfile?.scenario_name}
          </div>
          <div style={{ fontSize: '0.6rem', color: T.muted, marginTop: 4, display: 'flex', gap: 8 }}>
            <span>{activeProfile?.group}</span>
            <span style={{ color: T.border }}>·</span>
            <span style={{
              color: activeProfile?.e4st_match_quality === 'direct'       ? T.teal
                   : activeProfile?.e4st_match_quality === 'partial'      ? T.amber
                   : T.red
            }}>
              {activeProfile?.e4st_match_quality}
            </span>
            <span style={{ color: T.border }}>·</span>
            <span>{activeProfile?.e4st_scenario_id}</span>
          </div>
        </div>
      </div>

      {/* ── PANEL 2: BA REGION MAP ──────────────────────────────────────────── */}
      <div style={{ ...card, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={sectionHeader}>Region Capital Gap</div>

        <svg
          viewBox="0 0 600 500"
          style={{ width: '100%', height: 'auto', flex: 1 }}
        >
          {BA_POLYS_SCHEMATIC.map(bp => {
            const ba   = BA_REGIONS.find(b => b.code === bp.code);
            const gap  = baGap(ba, E, Ec, S);
            const fill = gapFill(gap);
            const isHov = hoveredBA  === bp.code;
            const isSel = selectedBA === bp.code;

            return (
              <g key={bp.code}
                onMouseEnter={ev => { setHoveredBA(bp.code); setHoverPos({ x: ev.clientX, y: ev.clientY }); }}
                onMouseLeave={() => setHoveredBA(null)}
                onClick={() => handleBAClick(bp.code)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={bp.points}
                  fill={fill}
                  fillOpacity={isSel ? 0.88 : isHov ? 0.75 : 0.55}
                  stroke={isSel ? T.text : isHov ? T.purple : '#1a1d27'}
                  strokeWidth={isSel ? 2.5 : isHov ? 1.5 : 1}
                />
                {bp.label.map((line, li) => (
                  <text
                    key={li}
                    x={bp.cx}
                    y={bp.cy + (li - (bp.label.length - 1) / 2) * 13}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      fontSize: 9.5,
                      fill: '#e2e8f0',
                      fontFamily: T.font,
                      fontWeight: isSel ? 'bold' : 'normal',
                      pointerEvents: 'none',
                      textShadow: '0 1px 2px #0f1117',
                    }}
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip — rendered outside SVG */}
        {hoveredBA && (() => {
          const ba  = BA_REGIONS.find(b => b.code === hoveredBA);
          const gap = baGap(ba, E, Ec, S);
          return (
            <div style={{
              position: 'fixed',
              left: hoverPos.x + 14, top: hoverPos.y - 8,
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: '8px 12px', zIndex: 200,
              pointerEvents: 'none', fontSize: '0.72rem', fontFamily: T.font,
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}>
              <div style={{ fontWeight: 'bold', color: T.text, marginBottom: 2 }}>{ba.name}</div>
              <div style={{ fontSize: '0.6rem', color: T.muted, marginBottom: 4 }}>{ba.abbr}</div>
              <div style={{ color: T.muted }}>
                <span style={{ color: T.teal }}>E {ba.E.toFixed(2)}</span>
                {' · '}
                <span style={{ color: T.amber }}>Ec {ba.Ec.toFixed(2)}</span>
                {' · '}
                <span style={{ color: T.purple }}>S {ba.S.toFixed(2)}</span>
              </div>
              <div style={{ marginTop: 4, color: gapFill(gap) }}>
                mean gap: {gap.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.6rem', color: T.muted, marginTop: 2 }}>
                click to {selectedBA === hoveredBA ? 'deselect' : 'inspect'}
              </div>
            </div>
          );
        })()}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8,
          fontSize: '0.62rem', fontFamily: T.font, color: T.muted }}>
          {[['#2dd4bf','meets target (gap ≤ 0)'],['#f59e0b','gap 0–2'],['#ef4444','gap > 2']].map(([c,l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, background: c, borderRadius: 2, display: 'inline-block' }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* ── RIGHT COLUMN: PANEL 3 + PANEL 4 ────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Panel 3: Scenario Matrix */}
        <div style={card}>
          <ScenarioMatrix E={E} Ec={Ec} S={S} onSnap={handleSnap} />
        </div>

        {/* Panel 4: Detail */}
        <div style={{ ...card, flex: 1, overflow: 'auto' }}>
          {selectedBAData ? (
            <BADetail
              ba={selectedBAData}
              E={E} Ec={Ec} S={S}
              onBack={() => setSelectedBA(null)}
            />
          ) : (
            <PathwayConditions profile={activeProfile} />
          )}
        </div>
      </div>

    </div>
  );
}
