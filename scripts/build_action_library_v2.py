#!/usr/bin/env python3
"""
Build mw_action_library.json v2.0 — 46 actions + 21 disturbances.
Taxonomy schema v0.1 per terra_action_taxonomy.md.
Session 7 data authoring task. Do NOT modify src/terra_engine.py.
"""

import json
import shutil
from pathlib import Path
from collections import Counter

BASE = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/Research/Energy Modeling/energy-map")
INPUT  = BASE / "data/processed/mw_action_library.json"
BACKUP = BASE / "data/processed/mw_action_library_v1.json"
OUTPUT = BASE / "data/processed/mw_action_library.json"
META   = BASE / "data/processed/network_metadata.json"

with open(INPUT) as f:
    existing = json.load(f)
shutil.copy(INPUT, BACKUP)
print(f"Backup saved: {BACKUP}")

EA = existing["actions"]
ED = existing["disturbances"]
MW = [17, 18, 20, 21, 25, 43, 80]

# ── helpers ──────────────────────────────────────────────────────────

def E3(e, ec, s):
    return {"E": e, "Ec": ec, "S": s}

def migrate(old_id, new_id, name, bucket, cat, subcat,
            eco, unit_label, unit_scale, ttd, dlife, myr,
            suit, syn):
    """Add new taxonomy fields to an existing action, preserving all old fields."""
    a = dict(EA[old_id])
    a.update({
        "action_id":            new_id,
        "action_name":          name,
        "bucket":               bucket,
        "category":             cat,
        "subcategory":          subcat,
        "applicable_ecoregions": eco,
        "unit_label":           unit_label,
        "unit_scale":           unit_scale,
        "time_to_deploy":       ttd,
        "design_life":          dlife,
        "maturation_years":     myr,
        "suitability_source":   suit,
        "confidence":           "medium",
        "dissertation_note":    None,
        "requires_review_by":   None,
        "synergy_groups":       syn,
        "atb_capex_2024":       None,
    })
    return new_id, a

def na(aid, name, bucket, cat, subcat, eco, ulabel, uscale,
       ttd, dlife, myr, suit, conf, ees, mats, cost24,
       atb24=None, atb35=None, atb50=None,
       dnote=None, rev=None, syn=None):
    return aid, {
        "action_id":            aid,
        "action_name":          name,
        "bucket":               bucket,
        "category":             cat,
        "subcategory":          subcat,
        "applicable_ecoregions": eco,
        "unit_label":           ulabel,
        "unit_scale":           uscale,
        "time_to_deploy":       ttd,
        "design_life":          dlife,
        "maturation_years":     myr,
        "suitability_source":   suit,
        "confidence":           conf,
        "ees_effects":          ees,
        "atb_capex_2024":       atb24,
        "atb_capex_2035":       atb35,
        "atb_capex_2050":       atb50,
        "cost_2024":            cost24,
        "materials":            mats,
        "synergy_groups":       syn or [],
        "dissertation_note":    dnote,
        "requires_review_by":   rev,
    }

# ── PART 1: migrate 13 existing ──────────────────────────────────────

A = {}

# 1
k,v = migrate("wind_utility","wind_utility","Utility-Scale Wind",
    "energy_generation","energy_infrastructure","renewable_generation",
    MW,"MW",1000, 3,25,None,"NREL wind resource class",["coal_transition_cluster"])
A[k]=v

# 2
k,v = migrate("solar_utility","solar_utility","Utility-Scale Solar PV",
    "energy_generation","energy_infrastructure","renewable_generation",
    MW,"MW",1000, 2,30,None,"NREL NSRDB irradiance",[])
A[k]=v

# 3 — rename transmission_buildout → transmission_230kv
k,v = migrate("transmission_buildout","transmission_230kv","230kV Regional Transmission",
    "energy_transmission","energy_infrastructure","regional_transmission",
    MW,"circuit-miles",100, 3,50,None,"Existing ROW proximity",
    ["interregional_transmission_backbone"])
A[k]=v

# 4
k,v = migrate("coal_repowering","coal_repowering","Coal Plant Repowering (Gas/H₂)",
    "energy_generation","energy_infrastructure","fossil_transition",
    [17,18,20,21,25,43],"MW",1000, 2,20,None,
    "NETL brownfield facility inventory",["coal_transition_cluster"])
A[k]=v

# 5
k,v = migrate("clean_manufacturing","clean_manufacturing","Clean Energy Manufacturing",
    "economic_development","settlement_social","industrial_anchor",
    MW,"facilities",1, 3,30,None,"EPA/EDA industrial site inventory",
    ["coal_transition_cluster"])
A[k]=v

# 6
k,v = migrate("renewable_degraded_land","renewable_degraded_land","Renewables on Degraded Land",
    "terrestrial_ecosystem","ecological_restoration","legacy_remediation",
    MW,"MW",1000, 2,30,3,"EPA Brownfields inventory + NLCD disturbed land",
    ["coal_transition_cluster"])
A[k]=v

# 7
k,v = migrate("prairie_restoration","prairie_restoration","Prairie Restoration",
    "terrestrial_ecosystem","ecological_restoration","grassland_steppe",
    [18,25,43,80],"acres",10000, 1,None,5,"NLCD degraded rangeland",
    ["organic_water_battery","carbon_sequestration"])
A[k]=v

# 8
k,v = migrate("riparian_buffer","riparian_buffer","Riparian Buffer Corridors",
    "hydrological_restoration","ecological_restoration","riparian_corridor",
    MW,"stream-miles",10000, 1,None,3,"NHD stream network + land cover",
    ["organic_water_battery"])
A[k]=v

# 9
k,v = migrate("invasive_treatment","invasive_treatment","Invasive Species Treatment",
    "terrestrial_ecosystem","ecological_restoration","grassland_steppe",
    MW,"acres",10000, 1,None,2,"State invasive species inventories",[])
A[k]=v

# 10
k,v = migrate("rural_broadband","rural_broadband","Rural Broadband Connectivity",
    "settlement_social","settlement_social","digital_infrastructure",
    MW,"households",100000, 2,20,None,"FCC broadband map (< 25/3 Mbps)",
    ["community_resilience"])
A[k]=v

# 11
k,v = migrate("health_clinic","health_clinic","Rural Health Clinic",
    "settlement_social","settlement_social","health_infrastructure",
    MW,"facilities",1, 2,20,None,"HRSA medically underserved designation",
    ["community_resilience"])
A[k]=v

# 12
k,v = migrate("workforce_retraining","workforce_retraining","Workforce Retraining Program",
    "settlement_social","settlement_social","workforce_transition",
    MW,"workers",1000, 1,20,None,"BLS employment concentration",
    ["coal_transition_cluster","community_resilience"])
A[k]=v

# 13
k,v = migrate("affordable_housing","affordable_housing","Affordable Housing Units",
    "settlement_social","settlement_social","housing",
    MW,"units",500, 3,20,None,"HUD housing needs assessment",
    ["community_resilience"])
A[k]=v

# ── PART 3: new energy generation ────────────────────────────────────

k,v = na("geothermal_utility","Utility-Scale Geothermal",
    "energy_generation","energy_infrastructure","renewable_generation",
    [17,18,20,80],"MW",100, 5,30,None,
    "USGS geothermal resource assessment","medium",
    E3(-0.05,0.18,0.05),
    {"steel_tons":150,"concrete_tons":200},
    cost24=4759000, atb24=4759, atb35=4127)
A[k]=v

k,v = na("hydropower_small","Small Hydropower (<10 MW)",
    "energy_generation","energy_infrastructure","renewable_generation",
    [17,21,80],"MW",10, 4,50,None,
    "USGS NHD streamflow + FERC small hydro inventory","medium",
    E3(-0.08,0.12,0.06),
    {"concrete_tons":800,"steel_tons":60},
    cost24=3228000, atb24=3228, atb35=3164,
    syn=["organic_water_battery"])
A[k]=v

k,v = na("smr_advanced","Small Modular Reactor",
    "energy_generation","energy_infrastructure","nuclear_generation",
    [17,18,21],"MW",100, 7,60,None,
    "Industrial site + cooling water access","low",
    E3(-0.03,0.35,0.12),
    {"steel_tons":40,"concrete_tons":500,"uranium_tons":2.5},
    cost24=7500000, atb24=7500,
    dnote="CAPEX from DOE Advanced Reactor Demonstration Program estimates. Highly uncertain — TerraPower Kemmerer first-of-kind cost will be determinative. Coefficient to be updated when NRC licensing cost data available.",
    rev="2026-12", syn=["nuclear_transition_cluster"])
A[k]=v

k,v = na("fusion_pilot","Fusion Pilot Plant",
    "energy_generation","energy_infrastructure","nuclear_generation",
    [17,18,21],"MW",100, 15,40,None,
    "DOE site selection (future)","low",
    E3(0.02,0.25,0.15),
    {"steel_tons":200,"concrete_tons":800},
    cost24=10000000, atb24=10000,
    dnote="Structural placeholder. No commercial cost data exists. EES coefficients are aspirational estimates based on fusion program employment projections (DOE FES 2023 roadmap). Available only at time horizon >= 2045.",
    rev="2027-05", syn=["nuclear_transition_cluster"])
A[k]=v

k,v = na("offshore_wind_great_lakes","Offshore Wind (Great Lakes)",
    "energy_generation","energy_infrastructure","renewable_generation",
    [],"MW",1000, 5,25,None,
    "BOEM lease areas (Great Lakes only)","medium",
    E3(-0.03,0.30,0.05),
    {"steel_tons":250,"concrete_tons":800},
    cost24=None, atb24=None,
    dnote="Not applicable to Mountain West. applicable_ecoregions=[] ensures this action is filtered out of the MW palette. Included for national library completeness.")
A[k]=v

k,v = na("coal_to_solar","Coal Plant Site Solar Conversion",
    "energy_generation","energy_infrastructure","fossil_transition",
    [18,25,43],"MW",500, 3,30,None,
    "EPA Brownfields inventory + plant retirement registry","medium",
    E3(0.08,0.20,0.08),
    {"steel_aluminum_tons":20000,"silicon_glass_tons":4000,"concrete_tons":75000},
    cost24=1555200, atb24=1555.2, atb35=864.4, atb50=543.1,
    dnote="Siting on retired coal plant footprint avoids new land disturbance — E coefficient reflects brownfield co-benefit vs greenfield solar.",
    syn=["coal_transition_cluster"])
A[k]=v

k,v = na("coal_to_smr","Coal Plant SMR Repowering",
    "energy_generation","energy_infrastructure","fossil_transition",
    [18,43],"MW",100, 8,60,None,
    "EIA coal plant retirement registry + NRC site suitability","low",
    E3(0.02,0.40,0.15),
    {"steel_tons":40,"concrete_tons":500},
    cost24=8500000, atb24=8500,
    dnote="Directly models the Kemmerer/Gillette transition scenario. CAPEX includes brownfield siting premium. Ec coefficient reflects retained workforce + high-skill employment premium over coal O&M. Requires Kemmerer construction cost actuals when available (est. 2027).",
    rev="2027-06", syn=["coal_transition_cluster","nuclear_transition_cluster"])
A[k]=v

# ── PART 4: energy storage ────────────────────────────────────────────

k,v = na("battery_grid","Grid-Scale Battery (Li-ion)",
    "energy_storage","energy_infrastructure","grid_storage",
    MW,"MWh",1000, 2,15,None,
    "Substation proximity","medium",
    E3(0.0,0.08,0.05),
    {"lithium_tons":150,"steel_tons":8},
    cost24=476700, atb24=476.7)  # ATB $/kWh; engine: atb*1000*MWh
A[k]=v

k,v = na("pumped_hydro","Pumped Hydro Storage",
    "energy_storage","energy_infrastructure","grid_storage",
    [17,21,80],"MWh",5000, 6,75,None,
    "USGS closed-loop pumped hydro site assessments","medium",
    E3(-0.05,0.15,0.06),
    {"concrete_tons":300,"steel_tons":25,"penstock_steel_tons":15},
    cost24=150000, atb24=150,  # $1,200/kW × 8hr = $150/kWh proxy
    syn=["organic_water_battery"])
A[k]=v

k,v = na("hydrogen_electrolysis","Green Hydrogen Production",
    "energy_storage","energy_infrastructure","hydrogen_production",
    [17,18,21,25],"MW",100, 3,20,None,
    "Water access + renewable co-location","medium",
    E3(-0.02,0.12,0.04),
    {"steel_tons":20,"water_rights_af":3.5},
    cost24=1200000, atb24=1200,
    dnote="Water use coefficient critical for arid Mountain West — 3.5 AF/MW-year from DOE H2A default. High uncertainty for Wyoming Basin given water rights constraints.",
    rev="2026-12")
A[k]=v

# ── PART 5: energy transmission ──────────────────────────────────────

k,v = na("transmission_500kv","500kV Interregional Corridor",
    "energy_transmission","energy_infrastructure","interregional_transmission",
    MW,"circuit-miles",200, 5,50,None,
    "500kv_interregional_corridors.csv","medium",
    E3(-0.03,0.18,0.04),
    {"steel_tons":25,"aluminum_tons":3,"concrete_tons":40},
    cost24=3500000, atb24=3500000,
    dnote="ROW cost and timeline highly variable by terrain and permitting. Corridor-specific costs available in 500kv_interregional_corridors.csv for named routes.",
    syn=["interregional_transmission_backbone"])
A[k]=v

k,v = na("microgrid","Community Microgrid",
    "energy_transmission","energy_infrastructure","distribution",
    MW,"MW",5, 2,20,None,
    "Settlement proximity","medium",
    E3(0.0,0.05,0.10),
    {"steel_tons":5},
    cost24=3000000, atb24=3000,
    syn=["community_resilience"])
A[k]=v

# ── PART 6: nuclear fuel cycle ────────────────────────────────────────

k,v = na("uranium_mining_isr","In-Situ Recovery Uranium Mine",
    "nuclear_fuel_cycle","energy_infrastructure","uranium_extraction",
    [18,43,25],"facilities",1, 3,20,None,
    "NRC license + USGS uranium resource inventory","low",
    E3(-0.15,0.30,0.08),
    {"water_rights_af":500,"steel_tons":200},
    cost24=150000000, atb24=150000000,
    dnote="E coefficient reflects ISR groundwater restoration risk per NRC regulatory basis. Wyoming has 10 of 11 US operating ISR facilities — ecoregion applicability empirically grounded. CAPEX from NRC licensing cost study (NUREG-2206).",
    rev="2026-12", syn=["nuclear_fuel_cycle_mw","coal_transition_cluster"])
A[k]=v

k,v = na("conversion_facility","UF6 Conversion Facility",
    "nuclear_fuel_cycle","energy_infrastructure","uranium_conversion",
    [18,25,43],"facilities",1, 5,40,None,
    "NRC/DOE facility assessment","low",
    E3(-0.10,0.45,0.10),
    {"steel_tons":500,"concrete_tons":2000},
    cost24=800000000, atb24=800000000,
    dnote="Only one operating US conversion facility (Metropolis Works, IL). CAPEX is DOE estimate for new greenfield facility. Regional applicability based on proximity to uranium supply — Wyoming Basin is primary candidate.",
    rev="2027-05", syn=["nuclear_fuel_cycle_mw"])
A[k]=v

k,v = na("enrichment_facility","Uranium Enrichment (Centrifuge)",
    "nuclear_fuel_cycle","energy_infrastructure","uranium_enrichment",
    [18,21,17],"facilities",1, 7,40,None,
    "Existing DOE complex sites","low",
    E3(-0.05,0.60,0.15),
    {"steel_tons":800,"concrete_tons":3000,"swu_capacity":3000},
    cost24=3500000000, atb24=3500000000,
    dnote="CAPEX from Urenco National Enrichment Facility (Eunice NM) cost basis adjusted for 2024$. Ec coefficient reflects high-skill employment density and supply chain multiplier. NRC Class B license required — 7yr deployment is optimistic.",
    rev="2027-05", syn=["nuclear_fuel_cycle_mw"])
A[k]=v

k,v = na("haleu_production","HALEU Production Facility",
    "nuclear_fuel_cycle","energy_infrastructure","haleu_production",
    [18,17,21],"facilities",1, 5,30,None,
    "DOE HALEU program sites","low",
    E3(-0.03,0.50,0.12),
    {"steel_tons":300,"concrete_tons":1000},
    cost24=500000000, atb24=500000000,
    dnote="HALEU required for TerraPower Natrium and other advanced reactor designs. DOE HALEU Operations Contract (Centrus, Piketon OH) provides cost analog. Wyoming Basin siting hypothetical — no announced site.",
    rev="2026-12", syn=["nuclear_fuel_cycle_mw","nuclear_transition_cluster"])
A[k]=v

k,v = na("fuel_fabrication","Nuclear Fuel Fabrication Plant",
    "nuclear_fuel_cycle","energy_infrastructure","fuel_fabrication",
    [17,18,21],"facilities",1, 5,40,None,
    "NRC fabrication license inventory","low",
    E3(-0.03,0.45,0.10),
    {"steel_tons":250,"concrete_tons":800},
    cost24=400000000, atb24=400000000,
    dnote="Three operating US fuel fabrication plants (Columbia SC, Richland WA, Wilmington NC). Mountain West siting requires NRC 10 CFR Part 70 license. Coefficient confidence low pending NRC cost data.",
    rev="2027-05", syn=["nuclear_fuel_cycle_mw"])
A[k]=v

# ── PART 7: hydrological restoration ─────────────────────────────────

k,v = na("beaver_reintroduction","Beaver Reintroduction and Dam Analogue",
    "hydrological_restoration","ecological_restoration","process_based_restoration",
    [17,18,21,80],"watersheds",10, 1,None,5,
    "Stream habitat assessment + BDA literature","medium",
    E3(0.25,0.05,0.03),
    {"labor_years":0.5},
    cost24=45000, atb24=45000,
    dnote="Highest E coefficient per dollar in the library. Based on Wheaton et al. (2019) low-tech process-based restoration. Beaver as keystone hydrological engineer — watershed-scale water table elevation, fire refugia, salmonid habitat.",
    syn=["organic_water_battery","carbon_sequestration"])
A[k]=v

k,v = na("wetland_restoration","Wetland and Wet Meadow Restoration",
    "hydrological_restoration","ecological_restoration","wetland_restoration",
    [17,18,21,43,80],"acres",5000, 1,None,3,
    "NWI + degraded meadow inventory","medium",
    E3(0.20,0.03,0.04),
    {"labor_years":0.02},
    cost24=8000, atb24=8000,
    syn=["organic_water_battery","carbon_sequestration"])
A[k]=v

k,v = na("floodplain_reconnection","Floodplain Reconnection",
    "hydrological_restoration","ecological_restoration","floodplain_restoration",
    [17,18,21,43,80],"river-miles",50, 2,None,5,
    "FEMA floodplain maps + levee inventory","medium",
    E3(0.18,0.04,0.05),
    {"labor_years":1.5},
    cost24=120000, atb24=120000,
    syn=["organic_water_battery"])
A[k]=v

k,v = na("spring_seep_development","Spring and Seep Restoration",
    "hydrological_restoration","ecological_restoration","spring_restoration",
    [18,20,80],"sites",20, 1,None,2,
    "USGS spring inventory","medium",
    E3(0.15,0.02,0.04),
    {"labor_years":0.3},
    cost24=15000, atb24=15000,
    dnote="Disproportionately important in Wyoming Basin and Colorado Plateaus — springs support riparian corridors in otherwise xeric landscapes. Arid ecosystem equity principle applies.",
    syn=["organic_water_battery"])
A[k]=v

k,v = na("watershed_protection","Watershed Protection and Headwaters Conservation",
    "hydrological_restoration","ecological_restoration","watershed_conservation",
    [17,21,80],"acres",50000, 1,None,10,
    "Conservation easement registry + USGS watershed boundaries","medium",
    E3(0.12,0.02,0.03),
    {"monitoring_years":0.001},
    cost24=500, atb24=500,
    syn=["organic_water_battery","carbon_sequestration"])
A[k]=v

k,v = na("mine_land_reclamation","Mine Land Reclamation",
    "hydrological_restoration","ecological_restoration","legacy_remediation",
    [17,18,20,21,43,80],"acres",5000, 3,None,10,
    "OSMRE AML inventory","medium",
    E3(0.18,0.05,0.04),
    {"remediation_volume_tons":50,"labor_years":0.05},
    cost24=8500, atb24=8500,
    syn=["coal_transition_cluster","organic_water_battery"])
A[k]=v

# ── PART 8: terrestrial ecosystem ────────────────────────────────────

k,v = na("sagebrush_restoration","Sagebrush Steppe Restoration",
    "terrestrial_ecosystem","ecological_restoration","arid_steppe",
    [18,80,43],"acres",10000, 1,None,7,
    "USDA EQIP CP-2 sagebrush coverage maps","medium",
    E3(0.18,0.01,0.02),
    {"labor_years":0.005},
    cost24=200, atb24=200,
    dnote="Arid ecosystem equity action — sagebrush restoration is the Mountain West analog of forest restoration in montane ecoregions. Sage-grouse umbrella species provides biodiversity co-benefit.",
    syn=["carbon_sequestration"])
A[k]=v

k,v = na("forest_restoration","Forest Restoration and Fuels Treatment",
    "terrestrial_ecosystem","ecological_restoration","montane_forest",
    [17,21],"acres",10000, 1,None,20,
    "USFS fire regime condition class inventory","medium",
    E3(0.22,0.03,0.04),
    {"labor_years":0.01,"monitoring_years":0.002},
    cost24=1200, atb24=1200,
    syn=["carbon_sequestration"])
A[k]=v

k,v = na("carbon_sequestration_soil","Soil Carbon Sequestration (Rangeland)",
    "terrestrial_ecosystem","ecological_restoration","arid_steppe",
    [18,25,43,80],"acres",50000, 1,None,5,
    "NRCS soil survey + crop history","medium",
    E3(0.08,0.01,0.01),
    {"monitoring_years":0.0005},
    cost24=25, atb24=25)
A[k]=v

k,v = na("bison_reintroduction","Bison Reintroduction (Prairie Keystone)",
    "terrestrial_ecosystem","ecological_restoration","grassland_steppe",
    [25,43],"herds",1, 2,None,10,
    "NLCD degraded rangeland + existing bison range","medium",
    E3(0.20,0.04,0.06),
    {"land_acres":50000,"labor_years":5},
    cost24=2500000, atb24=2500000,
    dnote="Keystone ecosystem engineer for Great Plains — analogous to beaver in riparian systems. TNC American Prairie Reserve provides cost analog. Ec includes agritourism and tribal economic co-benefits.",
    syn=["carbon_sequestration"])
A[k]=v

# ── PART 9: settlement/social ─────────────────────────────────────────

k,v = na("university_research_center","University Research and Workforce Anchor",
    "settlement_social","settlement_social","education_anchor",
    [17,18,21,25,43],"facilities",1, 4,50,None,
    "NSF EPSCoR institution inventory","medium",
    E3(0.02,0.25,0.20),
    {"steel_tons":300,"concrete_tons":800},
    cost24=120000000, atb24=120000000,
    syn=["coal_transition_cluster","nuclear_transition_cluster"])
A[k]=v

k,v = na("tribal_energy_sovereignty","Tribal Clean Energy Development",
    "settlement_social","settlement_social","energy_sovereignty",
    [17,18,20,21,80],"projects",1, 3,30,None,
    "DOE Office of Indian Energy project inventory","medium",
    E3(0.08,0.20,0.25),
    {},
    cost24=50000000, atb24=50000000,
    dnote="Captures tribal co-management and energy sovereignty dimensions absent from other economic development actions. S coefficient reflects self-determination and institutional anchor effects beyond income/employment.",
    rev="2026-12", syn=["coal_transition_cluster"])
A[k]=v

k,v = na("lead_service_line","Lead Service Line Replacement",
    "settlement_social","settlement_social","public_health_infrastructure",
    [17,18,21,25,43,80],"connections",10000, 3,50,None,
    "EPA LCRR compliance data","medium",
    E3(0.03,0.02,0.12),
    {"pipe_miles":0.0001},
    cost24=4500, atb24=4500)
A[k]=v

k,v = na("community_solar","Community Solar Program",
    "settlement_social","settlement_social","distributed_energy",
    MW,"MW",10, 1,25,None,
    "NREL NSRDB irradiance + utility territory","medium",
    E3(0.01,0.06,0.10),
    {"steel_aluminum_tons":400,"silicon_glass_tons":80,"concrete_tons":1500},
    cost24=2200000, atb24=2200,
    syn=["community_resilience"])
A[k]=v

# ── PART 10: transport ────────────────────────────────────────────────

k,v = na("ev_charging_network","EV Charging Corridor",
    "transport","settlement_social","electric_mobility",
    MW,"stations",100, 1,15,None,
    "FHWA NEVI program eligibility corridors","medium",
    E3(0.02,0.04,0.06),
    {"steel_tons":0.5},
    cost24=150000, atb24=150000)
A[k]=v

k,v = na("rail_freight_modernization","Rail Freight Modernization",
    "transport","settlement_social","freight_infrastructure",
    [18,25,43],"route-miles",200, 4,40,None,
    "STB rail network + EIA commodity data","medium",
    E3(0.03,0.08,0.04),
    {"steel_tons":120,"concrete_tons":80},
    cost24=3000000, atb24=3000000)
A[k]=v

# ── PART 11: disturbances ─────────────────────────────────────────────

D = {}

def md(old_id, dtype, dur, rec, eco, ees_pu, net_fx, params):
    """Migrate existing disturbance to new schema."""
    d = dict(ED[old_id])
    d.update({
        "disturbance_id":       old_id,
        "disturbance_name":     d.get("label", old_id),
        "disturbance_type":     dtype,
        "duration":             dur,
        "recovery_time":        rec,
        "applicable_ecoregions": eco,
        "ees_effects_per_unit": ees_pu,
        "network_effects":      net_fx,
        "parameters":           params,
    })
    return old_id, d

def nd(did, name, dtype, params, ees_pu, net_fx, dur, rec, eco, dnote=None):
    d = {
        "disturbance_id":       did,
        "disturbance_name":     name,
        "disturbance_type":     dtype,
        "parameters":           params,
        "ees_effects_per_unit": ees_pu,
        "network_effects":      net_fx,
        "duration":             dur,
        "recovery_time":        rec,
        "applicable_ecoregions": eco,
    }
    if dnote:
        d["dissertation_note"] = dnote
    return did, d

# Migrate existing 5
k,v = md("heat_wave","climate","instantaneous",1.5,MW,
    E3(-0.05,-0.03,-0.08),
    {"effect_type":"bus_load_spike","affected_scope":"ecoregion"},
    {"severity_sigma":{"type":"float","unit":"sigma","range":[1,5],"default":2},
     "duration_days":{"type":"int","unit":"days","range":[3,21],"default":7}})
D[k]=v

k,v = md("drought","climate","multi_year",3.5,MW,
    E3(-0.15,-0.10,-0.05),
    {"effect_type":"bus_load_spike","affected_scope":"watershed"},
    {"severity":{"type":"string","unit":"category","range":["moderate","severe","extreme"],"default":"moderate"},
     "duration_years":{"type":"float","unit":"years","range":[1,5],"default":2}})
D[k]=v

k,v = md("plant_closure","economic","instantaneous",None,MW,
    E3(0.0,-0.25,-0.15),
    {"effect_type":"bus_capacity_reduce","affected_scope":"bus"},
    {"facility_id":{"type":"string","unit":"bus_id","range":None,"default":None},
     "capacity_mw":{"type":"float","unit":"MW","range":[100,5000],"default":500}})
D[k]=v

k,v = md("mine_closure","economic","instantaneous",None,MW,
    E3(0.0,-0.25,-0.15),
    {"effect_type":"bus_capacity_reduce","affected_scope":"bus"},
    {"facility_id":{"type":"string","unit":"bus_id","range":None,"default":None},
     "capacity_mw":{"type":"float","unit":"MW","range":[100,3000],"default":300}})
D[k]=v

k,v = md("transmission_failure","infrastructure","instantaneous",0.1,MW,
    E3(0.0,-0.05,-0.10),
    {"effect_type":"branch_disable","affected_scope":"ba"},
    {"branch_id":{"type":"string","unit":"branch_id","range":None,"default":None}})
D[k]=v

# New climate
k,v = nd("wildfire","Wildfire","climate",
    {"severity_acres":{"type":"float","unit":"acres","range":[1000,500000],"default":50000},
     "ecoregion":{"type":"int","unit":"ecoregion_code","range":None,"default":17}},
    E3(-0.30,-0.15,-0.12),
    {"effect_type":"bus_capacity_reduce","affected_scope":"ecoregion"},
    "seasonal",10.0,[17,18,20,21,80])
D[k]=v

k,v = nd("flood_event","Flood Event","climate",
    {"huc8_watershed":{"type":"string","unit":"HUC8","range":None,"default":None},
     "recurrence_interval_yr":{"type":"float","unit":"years","range":[10,500],"default":100}},
    E3(-0.10,-0.20,-0.15),
    {"effect_type":"bus_load_spike","affected_scope":"watershed"},
    "instantaneous",1.0,MW)
D[k]=v

k,v = nd("ice_storm","Ice Storm","climate",
    {"severity":{"type":"int","unit":"scale 1-3","range":[1,3],"default":2},
     "affected_ba":{"type":"string","unit":"ba_code","range":None,"default":None}},
    E3(-0.02,-0.08,-0.10),
    {"effect_type":"branch_disable","affected_scope":"ba"},
    "instantaneous",0.25,[17,21,25,43])
D[k]=v

k,v = nd("winter_storm","Winter Storm","climate",
    {"severity_sigma":{"type":"float","unit":"sigma","range":[1,4],"default":2},
     "affected_ecoregion":{"type":"int","unit":"ecoregion_code","range":None,"default":17}},
    E3(-0.03,-0.10,-0.12),
    {"effect_type":"bus_load_spike","affected_scope":"ecoregion"},
    "instantaneous",0.1,MW)
D[k]=v

k,v = nd("tornado_outbreak","Tornado Outbreak","climate",
    {"ef_scale":{"type":"int","unit":"EF scale","range":[1,5],"default":2},
     "affected_ba":{"type":"string","unit":"ba_code","range":None,"default":None}},
    E3(-0.05,-0.15,-0.20),
    {"effect_type":"branch_disable","affected_scope":"ba"},
    "instantaneous",1.0,[25,43])
D[k]=v

k,v = nd("hail_storm","Hail Storm","climate",
    {"severity":{"type":"int","unit":"scale 1-3","range":[1,3],"default":2},
     "affected_ecoregion":{"type":"int","unit":"ecoregion_code","range":None,"default":25}},
    E3(-0.02,-0.08,-0.04),
    {"effect_type":"bus_load_spike","affected_scope":"ecoregion"},
    "instantaneous",0.5,[25,43,18])
D[k]=v

k,v = nd("hurricane","Hurricane","climate",
    {"category":{"type":"int","unit":"Saffir-Simpson","range":[1,5],"default":3},
     "landfall_ecoregion":{"type":"int","unit":"ecoregion_code","range":None,"default":None}},
    E3(-0.20,-0.30,-0.35),
    {"effect_type":"bus_load_spike","affected_scope":"ecoregion"},
    "instantaneous",3.0,[],
    dnote="Not applicable to Mountain West (applicable_ecoregions=[]). Included for national library completeness.")
D[k]=v

k,v = nd("drought_multi_year","Multi-Year Drought (Colorado River Basin)","climate",
    {"severity":{"type":"int","unit":"1=moderate 2=severe 3=extreme","range":[1,3],"default":2},
     "duration_years":{"type":"float","unit":"years","range":[2,20],"default":5}},
    E3(-0.20,-0.15,-0.08),
    {"effect_type":"bus_load_spike","affected_scope":"watershed"},
    "multi_year",5.0,[18,20,25,80])
D[k]=v

# New economic
k,v = nd("supply_chain_disruption","Supply Chain Disruption","economic",
    {"material_type":{"type":"string","unit":"category","range":["steel","lithium","uranium","rare_earth"],"default":"lithium"},
     "severity":{"type":"float","unit":"fraction 0-1","range":[0,1],"default":0.5}},
    E3(0.0,-0.10,-0.05),
    {"effect_type":"none","affected_scope":"ba"},
    "multi_year",2.0,None)
D[k]=v

k,v = nd("commodity_price_shock","Commodity Price Shock","economic",
    {"commodity":{"type":"string","unit":"category","range":["coal","natural_gas","uranium","lithium"],"default":"natural_gas"},
     "price_multiplier":{"type":"float","unit":"multiplier vs baseline","range":[0.5,3.0],"default":2.0}},
    E3(0.0,-0.08,-0.03),
    {"effect_type":"none","affected_scope":"ba"},
    "multi_year",1.0,None)
D[k]=v

k,v = nd("federal_policy_reversal","Federal Policy Reversal","economic",
    {"policy_type":{"type":"string","unit":"category","range":["IRA","CES","carbon_price","federal_lands"],"default":"IRA"},
     "binary":{"type":"int","unit":"0=maintained 1=reversed","range":[0,1],"default":1}},
    E3(0.0,-0.15,-0.10),
    {"effect_type":"none","affected_scope":"ba"},
    "multi_year",5.0,None,
    dnote="Captures political economy risk — IRA rollback, carbon price removal, federal lands policy shift. Coefficients are structural estimates; political science literature on policy reversal economic impacts is thin.")
D[k]=v

# New infrastructure
k,v = nd("pipeline_disruption","Pipeline Disruption","infrastructure",
    {"ba_code":{"type":"string","unit":"ba_code","range":None,"default":None},
     "duration_weeks":{"type":"float","unit":"weeks","range":[1,26],"default":4}},
    E3(0.0,-0.08,-0.06),
    {"effect_type":"bus_load_spike","affected_scope":"ba"},
    "seasonal",0.5,[17,18,21,43])
D[k]=v

k,v = nd("cyberattack_grid","Cyberattack on Grid","infrastructure",
    {"affected_ba":{"type":"string","unit":"ba_code","range":None,"default":None},
     "severity":{"type":"int","unit":"scale 1-3","range":[1,3],"default":2}},
    E3(0.0,-0.12,-0.15),
    {"effect_type":"branch_disable","affected_scope":"ba"},
    "instantaneous",0.25,MW,
    dnote="NERC CIP reliability event data provides partial basis. Severity scale: 1=minor, 2=Colonial Pipeline analog, 3=Ukraine grid attack analog.")
D[k]=v

# New ecological
k,v = nd("invasive_species_outbreak","Invasive Species Outbreak","ecological",
    {"species_type":{"type":"string","unit":"species","range":["cheatgrass","tamarisk","spotted_knapweed"],"default":"cheatgrass"},
     "ecoregion":{"type":"int","unit":"ecoregion_code","range":None,"default":18},
     "severity":{"type":"int","unit":"scale 1-3","range":[1,3],"default":2}},
    E3(-0.12,-0.03,-0.01),
    {"effect_type":"none","affected_scope":"ecoregion"},
    "multi_year",7.0,[18,20,25,43,80])
D[k]=v

k,v = nd("disease_event","Forest/Grassland Disease Event","ecological",
    {"target":{"type":"string","unit":"ecosystem","range":["forest","grassland","wildlife"],"default":"forest"},
     "ecoregion":{"type":"int","unit":"ecoregion_code","range":None,"default":17}},
    E3(-0.15,-0.05,-0.03),
    {"effect_type":"none","affected_scope":"ecoregion"},
    "multi_year",10.0,[17,21])
D[k]=v

k,v = nd("bark_beetle_outbreak","Bark Beetle Outbreak","ecological",
    {"severity_pct_canopy":{"type":"float","unit":"percent canopy affected","range":[10,80],"default":30},
     "ecoregion":{"type":"int","unit":"ecoregion_code","range":None,"default":17}},
    E3(-0.20,-0.05,-0.04),
    {"effect_type":"none","affected_scope":"ecoregion"},
    "multi_year",15.0,[17,21])
D[k]=v

# ── PART 12: coefficient audit ────────────────────────────────────────

total_a = len(A)
total_d = len(D)

conf = Counter(a.get("confidence","medium") for a in A.values())
needs_review = sorted(
    [{"action_id": aid,
      "requires_review_by": a["requires_review_by"],
      "dissertation_note": (a.get("dissertation_note") or "")[:120]}
     for aid, a in A.items() if a.get("requires_review_by")],
    key=lambda x: x["requires_review_by"]
)

audit = {
    "version": "2.0",
    "last_updated": "2026-05-14",
    "total_actions": total_a,
    "total_disturbances": total_d,
    "confidence_distribution": dict(conf),
    "requires_review": needs_review,
    "reviewed_actions": [],
    "arid_equity_principle": (
        "Ecoregion E-scores normalized relative to biome reference state. "
        "Intact arid ecosystems capable of reaching E >= 8. Ceiling is not biome-determined."
    ),
    "nuclear_fuel_cycle_note": (
        "Nuclear fuel cycle coefficients are structural estimates pending NRC/DOE sourcing. "
        "All entries flagged confidence:low. TerraPower Kemmerer construction cost actuals will "
        "be determinative for smr_advanced and coal_to_smr when available (est. 2027)."
    ),
    "schema_version": "taxonomy_v0.1",
}

# ── assemble and validate ─────────────────────────────────────────────

library = {
    "metadata": {
        **existing["metadata"],
        "action_count": total_a,
        "disturbance_count": total_d,
        "schema_version": "taxonomy_v0.1",
        "last_updated": "2026-05-14",
    },
    "actions": A,
    "disturbances": D,
    "_coefficient_audit": audit,
}

print(f"\n{'='*65}")
print("VALIDATION")
print(f"{'='*65}")

req_a = ["action_id","action_name","bucket","category","applicable_ecoregions",
         "unit_label","unit_scale","time_to_deploy","ees_effects","confidence"]
req_d = ["disturbance_id","disturbance_type","ees_effects_per_unit","duration","recovery_time"]

fail_a = {aid: [f for f in req_a if f not in a] for aid, a in A.items()}
fail_a = {k: v for k, v in fail_a.items() if v}
fail_d = {did: [f for f in req_d if f not in d] for did, d in D.items()}
fail_d = {k: v for k, v in fail_d.items() if v}

if fail_a:
    print("FAIL — actions missing required fields:")
    for aid, mf in fail_a.items():
        print(f"  {aid}: {mf}")
else:
    print(f"✓ All {total_a} actions have required fields")

if fail_d:
    print("FAIL — disturbances missing required fields:")
    for did, mf in fail_d.items():
        print(f"  {did}: {mf}")
else:
    print(f"✓ All {total_d} disturbances have required fields")

# Bucket table
print(f"\n{'Bucket':38s} {'N':3s}  Confidence")
print("-"*60)
for bucket, cnt in sorted(Counter(a["bucket"] for a in A.values()).items()):
    c = Counter(a["confidence"] for a in A.values() if a["bucket"]==bucket)
    cstr = " | ".join(f"{k}:{v}" for k,v in sorted(c.items()))
    print(f"  {bucket:36s} {cnt:3d}  [{cstr}]")

print(f"\nTotal actions: {total_a}  |  Total disturbances: {total_d}")
print(f"Confidence: high={conf.get('high',0)} medium={conf.get('medium',0)} low={conf.get('low',0)}")

print(f"\nActions requiring review ({len(needs_review)}):")
for r in needs_review:
    print(f"  {r['action_id']:35s} by {r['requires_review_by']}")

dist_types = Counter(d["disturbance_type"] for d in D.values())
print(f"\nDisturbances by type:")
for t, c in sorted(dist_types.items()):
    dids = [did for did, d in D.items() if d["disturbance_type"]==t]
    print(f"  {t:15s} {c:2d}  {', '.join(dids)}")

# ── save ──────────────────────────────────────────────────────────────

with open(OUTPUT, "w") as f:
    json.dump(library, f, indent=2)
sz = OUTPUT.stat().st_size
print(f"\n✓ Saved {OUTPUT.name}  ({sz/1024:.1f} KB)")

# ── update network_metadata.json ──────────────────────────────────────

with open(META) as f:
    meta = json.load(f)

bucket_counts = dict(Counter(a["bucket"] for a in A.values()))
meta["action_library"] = {
    **meta["action_library"],
    "action_count": total_a,
    "disturbance_count": total_d,
    "schema_version": "taxonomy_v0.1",
    "confidence_distribution": dict(conf),
    "buckets": sorted(bucket_counts.keys()),
    "bucket_counts": bucket_counts,
    "nuclear_fuel_cycle_actions": [aid for aid,a in A.items() if a["bucket"]=="nuclear_fuel_cycle"],
    "last_updated": "2026-05-14",
}

with open(META, "w") as f:
    json.dump(meta, f, indent=2)
print(f"✓ Updated {META.name}")

# ── coefficient audit block ───────────────────────────────────────────
print(f"\n{'='*65}")
print("COEFFICIENT AUDIT BLOCK:")
print(json.dumps(audit, indent=2))
