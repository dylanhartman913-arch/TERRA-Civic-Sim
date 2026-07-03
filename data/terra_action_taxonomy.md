# TERRA Action Taxonomy — Data Dictionary

**Version:** 0.1-draft
**Scope:** Generalizable action library schema for the TERRA platform.
Designed so the Mountain West prototype is one regional instantiation
of a national framework. Any US EPA Level III ecoregion set can be loaded
as a study area; the action palette populates from this taxonomy filtered
by ecoregion applicability.

**Governing principle:** The ecoregion is the unit of analysis. The bus is
the unit of energy system intervention. The tract is the unit of social
measurement. The material ledger is the unit of honesty.

---

## 1. Action Record Schema

Every entry in `mw_action_library.json` (and its future national equivalent)
conforms to this schema. Fields marked **[required]** must be present;
fields marked **[optional]** have stated defaults.

```
{
  "action_id":                string   [required]  — unique snake_case identifier
  "action_name":              string   [required]  — human-readable display name
  "bucket":                   string   [required]  — generalized category (see §2)
  "category":                 string   [required]  — top-level domain (see §3)
  "subcategory":              string   [optional]  — finer grouping within category
  "regional_variant_of":      string   [optional]  — parent bucket action this specializes
  "applicable_ecoregions":    int[]    [required]  — EPA Level III codes where action is valid
  "suitability_source":       string   [optional]  — dataset constraining heatmap layer
  "unit_label":               string   [required]  — user-facing unit ("MW", "acres", "watersheds", etc.)
  "unit_scale":               float    [required]  — internal scaling factor for magnitude
  "time_to_deploy":           float    [required]  — years from decision to operational
  "design_life":              float    [optional]  — years before replacement/renewal needed
  "capacity_factor":          float    [optional]  — 0–1, for energy generation actions only

  "ees_effects": {
    "environmental": {
      "indicator_id":         float    — marginal change per unit_scale of action
      ...
    },
    "economic": { ... },
    "social": { ... }
  }                                    [required]

  "material_requirements": {
    "material_type":          float    — quantity per unit_scale of action
    ...
  }                                    [required]

  "network_effects": {
    "effect_type":            string   — one of: "bus_capacity_add", "bus_load_add",
                                         "bus_storage_add", "branch_thermal_increase",
                                         "branch_add", "bus_load_reduce", "none"
    "magnitude_per_unit":     float    — MW, MWh, or MW-mi per unit_scale
    "dispatch_type":          string   [optional] — "variable", "baseload", "peaker", "storage"
  }                                    [required]

  "synergy_group":            string   [optional]  — identifier for synergy cluster (see §5)
  "synergy_multiplier":       float    [optional]  — EES bonus when co-located with group members
                                                      default 1.0 (no synergy)

  "capex_per_unit":           float    [optional]  — total capital cost per unit_scale (2024 USD)
  "capex_source":             string   [optional]  — citation for capex figure
  "opex_per_unit_year":       float    [optional]  — annual O&M per unit_scale (2024 USD)

  "coefficient_sources": [
    {
      "field":                string   — which field this source validates
      "source":               string   — citation (e.g. "NREL ATB 2024")
      "year":                 int
      "confidence":           string   — "empirical", "expert_estimate", "proxy"
      "notes":                string
    }
  ]                                    [optional]

  "notes":                    string   [optional]  — implementation notes, caveats
}
```

---

## 2. Bucket Taxonomy

Buckets are the generalizable categories. Each bucket has regional
variants — the specific action_ids that express that bucket in a
given ecoregion set. The engine filters by `applicable_ecoregions`;
the UI groups by `bucket` for display.

### 2.1 ENERGY_GENERATION

Electricity generation technologies. Suitability constrained by
resource data (NREL wind class, solar irradiance, geothermal
gradient, hydro site assessment, brownfield/industrial site
inventory for nuclear).

| action_id               | action_name                    | unit_label | unit_scale | dispatch_type | suitability_source                     | time_to_deploy |
|-------------------------|--------------------------------|------------|------------|---------------|----------------------------------------|----------------|
| solar_utility           | Utility-Scale Solar PV         | MW         | 1000       | variable      | NREL NSRDB irradiance                  | 2              |
| solar_distributed       | Distributed Rooftop Solar      | MW         | 100        | variable      | Census tract building stock            | 1              |
| wind_onshore            | Onshore Wind Farm              | MW         | 1000       | variable      | NREL wind resource class               | 3              |
| wind_offshore           | Offshore Wind Farm             | MW         | 1000       | variable      | BOEM lease areas (coastal only)        | 5              |
| nuclear_smr             | Small Modular Reactor          | MW         | 300        | baseload      | Industrial site + cooling water access | 8              |
| nuclear_conventional    | Conventional Nuclear Plant     | MW         | 1000       | baseload      | NRC siting criteria                    | 12             |
| fusion_pilot            | Fusion Pilot Plant             | MW         | 500        | baseload      | DOE site selection (future)            | 15             |
| ngcc                    | Natural Gas Combined Cycle     | MW         | 500        | peaker        | Gas pipeline access                    | 3              |
| ngcc_ccs                | NGCC with Carbon Capture       | MW         | 500        | baseload      | Gas pipeline + CO2 sequestration       | 5              |
| coal_supercritical      | Supercritical Coal             | MW         | 500        | baseload      | Coal supply + rail access              | 5              |
| geothermal              | Geothermal Power Plant         | MW         | 100        | baseload      | USGS geothermal resource assessment    | 4              |
| hydro_conventional      | Conventional Hydroelectric     | MW         | 500        | variable      | USGS stream gauge + dam site           | 7              |
| biomass                 | Biomass Power Plant            | MW         | 50         | baseload      | Agricultural/forestry residue supply   | 3              |

**Notes:**
- `coal_supercritical` exists for honest counterfactual comparison, not as a recommended action. The tool must allow users to choose it so the material and EES consequences are visible.
- `fusion_pilot` is available only at time horizons ≥2045. `time_to_deploy` is a hard constraint — the engine rejects placement at time steps where the asset cannot be operational by the scenario end.

### 2.2 ENERGY_STORAGE

| action_id               | action_name                    | unit_label | unit_scale | dispatch_type | suitability_source                     | time_to_deploy |
|-------------------------|--------------------------------|------------|------------|---------------|----------------------------------------|----------------|
| battery_grid            | Grid-Scale Battery (Li-ion)    | MWh        | 1000       | storage       | Substation proximity                   | 2              |
| pumped_hydro            | Pumped Hydro Storage           | MWh        | 5000       | storage       | USGS closed-loop site assessments      | 6              |
| compressed_air          | Compressed Air Energy Storage  | MWh        | 2000       | storage       | Salt cavern / geology                  | 5              |
| hydrogen_electrolysis   | Green Hydrogen (Electrolysis)  | MW         | 100        | storage       | Water access + renewable co-location   | 3              |
| thermal_storage         | Thermal Energy Storage         | MWh        | 500        | storage       | Industrial heat demand proximity       | 2              |

### 2.3 ENERGY_TRANSMISSION

| action_id               | action_name                        | unit_label | unit_scale | network_effect           | suitability_source               | time_to_deploy |
|-------------------------|------------------------------------|------------|------------|--------------------------|----------------------------------|----------------|
| transmission_500kv      | 500kV Interregional Corridor       | circuit-mi | 200        | branch_add               | 500kv_interregional_corridors.csv| 5              |
| transmission_230kv      | 230kV Regional Transmission        | circuit-mi | 100        | branch_thermal_increase  | Existing ROW proximity           | 3              |
| distribution_upgrade    | Distribution System Upgrade        | MW         | 50         | bus_load_reduce          | Utility service territory        | 2              |
| microgrid               | Community Microgrid                | MW         | 5          | bus_capacity_add         | Settlement proximity             | 2              |

### 2.4 HYDROLOGICAL_RESTORATION — "Organic Water Battery"

The defining bucket of the TERRA framework. These actions restore
natural hydrological function — water storage, infiltration, flood
attenuation, baseflow support — using ecological processes rather
than engineered structures. All members of this bucket belong to
the `organic_water_battery` synergy group (see §5).

| action_id               | action_name                    | unit_label  | unit_scale | applicable_regions                                  | suitability_source                | time_to_deploy |
|-------------------------|--------------------------------|-------------|------------|-----------------------------------------------------|-----------------------------------|----------------|
| beaver_reintroduction   | Beaver Reintroduction          | watersheds  | 10         | Mountain West, PNW, Northeast, Great Lakes           | Stream habitat assessment, BDA lit| 2              |
| beaver_dam_analog       | Beaver Dam Analog (BDA)        | structures  | 100        | Mountain West, PNW, Great Basin                      | Stream gradient + width survey    | 1              |
| headcut_repair          | Headcut / Gully Repair         | sites       | 50         | Arid/semi-arid West, Great Plains                    | Erosion inventory (NRCS)          | 1              |
| wetland_restore_montane | Mountain Meadow Wetland Rest.  | acres       | 10000      | Middle/Southern Rockies, Cascades, Sierra Nevada     | NWI + degraded meadow inventory   | 3              |
| wetland_restore_playa   | Playa Lake Restoration         | acres       | 5000       | High Plains, Great Basin                             | Playa Lakes Joint Venture data    | 2              |
| wetland_restore_coastal | Coastal Wetland Restoration    | acres       | 5000       | Atlantic coast, Gulf Coast                           | NOAA coastal wetland inventory    | 3              |
| wetland_restore_swamp   | Forested Swamp Restoration     | acres       | 5000       | Southeast, Gulf Coast, Lower Mississippi             | NWI + bottomland hardwood maps    | 5              |
| mangrove_restoration    | Mangrove Restoration           | acres       | 5000       | South Florida, Gulf Coast, Caribbean                 | NOAA mangrove habitat maps        | 5              |
| riparian_buffer         | Riparian Buffer Planting       | stream-mi   | 100        | All regions (species palette varies)                 | NHD stream network + land cover   | 2              |
| floodplain_reconnection | Floodplain Reconnection        | acres       | 5000       | All regions, esp. leveed rivers (Mississippi, etc.)  | FEMA floodplain maps + levee inv. | 3              |
| spring_restoration      | Spring / Seep Restoration      | sites       | 20         | Great Basin, Desert Southwest, Ozarks                | USGS spring inventory             | 2              |

**EES effects common to this bucket:**
- Environmental: water_security +1–3, biodiversity +1–2, flood_resilience +1–2, carbon_sequestration +0.5–1.5 (varies by type)
- Economic: water_rights_value +0.5, agricultural_resilience +0.5–1
- Social: flood_risk_reduction +1, recreational_access +0.5

### 2.5 TERRESTRIAL_ECOSYSTEM_RESTORATION

| action_id                | action_name                       | unit_label | unit_scale | applicable_regions                                       | suitability_source                    | time_to_deploy |
|--------------------------|-----------------------------------|------------|------------|----------------------------------------------------------|---------------------------------------|----------------|
| prairie_bison            | Prairie / Bison Grassland Rest.   | acres      | 10000      | NW Great Plains, Wyoming Basin, High Plains              | NLCD degraded rangeland               | 3              |
| tallgrass_reintroduction | Tallgrass Prairie Reintroduction  | acres      | 10000      | Eastern Great Plains (historic tallgrass boundary)       | NLCD cropland on historic tallgrass   | 3              |
| shortgrass_restoration   | Shortgrass Prairie Restoration    | acres      | 10000      | Western High Plains, Colorado Plateaus                   | NLCD + NRCS range condition           | 2              |
| forest_restoration_pnw   | Pacific NW Forest Restoration     | acres      | 10000      | PNW wet forests (Cascades, Coast Range, Olympic)         | USFS stand condition inventory        | 10             |
| forest_restoration_ne    | Northeast Forest Recovery         | acres      | 10000      | New England, Mid-Atlantic, Appalachian                   | NLCD + USFS FIA data                  | 8              |
| forest_restoration_se    | Southeast Pine / Longleaf Rest.   | acres      | 10000      | Southeast Coastal Plain, Piedmont                        | Longleaf pine range maps              | 8              |
| old_growth_protection    | Old Growth Protection / Expansion | acres      | 5000       | PNW, Northern Rockies, Sierra Nevada                     | USFS old growth inventory             | 1              |
| agroforestry_conversion  | Agroforestry Conversion           | acres      | 5000       | High Plains, NW Great Plains, Midwest cropland           | NLCD cropland + soil capability class | 5              |
| invasive_treatment       | Invasive Species Treatment        | acres      | 10000      | All regions (cost/species vary by ecoregion)             | State invasive species inventories    | 2              |
| pollinator_habitat       | Pollinator Habitat Establishment  | acres      | 5000       | All regions (scales with ag land fraction)               | NLCD ag land + CRP eligibility        | 1              |
| prescribed_fire          | Prescribed Fire Program           | acres/yr   | 10000      | Western forests, Southeast, Great Plains                 | USFS fire regime condition class      | 1              |
| soil_carbon_building     | Regenerative Soil Management      | acres      | 10000      | All agricultural regions                                 | NRCS soil survey + crop history       | 3              |

### 2.6 COASTAL_AND_MARINE

Available only in ecoregions with ocean or Great Lakes coastline.

| action_id                | action_name                       | unit_label | unit_scale | applicable_regions                                  | suitability_source                  | time_to_deploy |
|--------------------------|-----------------------------------|------------|------------|-----------------------------------------------------|-------------------------------------|----------------|
| oyster_reef              | Oyster Reef Restoration           | acres      | 500        | Chesapeake Bay, Gulf Coast, SE Atlantic              | NOAA oyster habitat maps            | 3              |
| coral_intervention       | Coral Reef Intervention           | acres      | 100        | South Florida, Hawaii, Pacific territories           | NOAA coral reef assessment          | 5              |
| living_shoreline         | Living Shoreline Construction     | shore-mi   | 50         | All coastal ecoregions                               | NOAA shoreline erosion rates        | 2              |
| kelp_forest              | Kelp Forest Restoration           | acres      | 500        | Pacific Coast (CA, OR, WA)                           | CDFW kelp canopy surveys            | 3              |
| seagrass_restoration     | Seagrass Bed Restoration          | acres      | 500        | Gulf Coast, SE Atlantic, Chesapeake                  | NOAA seagrass habitat maps          | 3              |
| salt_marsh               | Salt Marsh Restoration            | acres      | 5000       | Atlantic Coast, Gulf Coast                           | NWI + tidal marsh inventory         | 3              |
| dune_restoration         | Coastal Dune Restoration          | shore-mi   | 50         | Atlantic, Gulf, Pacific barrier coasts               | USGS coastal vulnerability index    | 2              |

### 2.7 LEGACY_REMEDIATION

Post-industrial and extractive landscape recovery. Primarily applicable
in Appalachian, Great Lakes, Northeast Corridor, and Western mining
district ecoregions.

| action_id                | action_name                       | unit_label | unit_scale | applicable_regions                                       | suitability_source              | time_to_deploy |
|--------------------------|-----------------------------------|------------|------------|----------------------------------------------------------|---------------------------------|----------------|
| brownfield_remediation   | Brownfield Site Remediation       | sites      | 10         | Great Lakes, NE Corridor, Appalachian, Gulf industrial   | EPA Brownfields inventory       | 3              |
| acid_mine_drainage       | Acid Mine Drainage Treatment      | sites      | 20         | Appalachian coal country, Mountain West mining districts  | USGS AMD site inventory         | 5              |
| superfund_restoration    | Superfund Site Restoration        | sites      | 5          | All regions (concentrated in industrial corridors)       | EPA NPL site list               | 10             |
| lead_service_line        | Lead Service Line Replacement     | connections| 10000      | Urban tracts with pre-1986 housing stock                 | EPA LCRR compliance data        | 3              |
| legacy_pollution_cleanup | Legacy Contaminant Cleanup        | sites      | 10         | Industrial waterways (PCBs, PFAS, heavy metals)          | State contaminated site lists   | 5              |
| mine_land_reclamation    | Mine Land Reclamation             | acres      | 5000       | Appalachian, Mountain West, Iron Range, Mesabi           | OSMRE AML inventory             | 5              |

**EES effects common to this bucket:**
- Environmental: water_quality +1–3, soil_health +1–2, biodiversity +0.5–1
- Economic: property_value +1–2, redevelopment_potential +1
- Social: health_outcomes +1–2, environmental_justice +1–2

### 2.8 SETTLEMENT_AND_SOCIAL

Community-scale infrastructure, governance, and social capital actions.
These operate at the tract level for spatial targeting but aggregate
to ecoregion for EES reporting.

| action_id                | action_name                       | unit_label   | unit_scale | applicable_regions    | suitability_source                     | time_to_deploy |
|--------------------------|-----------------------------------|--------------|------------|-----------------------|----------------------------------------|----------------|
| dense_housing_infill     | Dense Housing Infill              | units        | 500        | Urban/suburban tracts | Census tract density + zoning          | 3              |
| affordable_housing       | Affordable Housing Program        | units        | 500        | All settlement tracts | HUD housing needs assessment           | 3              |
| community_energy_coop    | Community Energy Cooperative      | households   | 1000       | All regions           | Utility service territory + co-op law  | 2              |
| local_food_system        | Local Food System Hub             | facilities   | 1          | Settlement-adjacent   | USDA food desert data + ag proximity   | 2              |
| workforce_transition     | Workforce Transition Center       | workers      | 1000       | Extraction-dependent  | BLS employment concentration           | 2              |
| health_clinic            | Community Health Center           | facilities   | 1          | Underserved tracts    | HRSA medically underserved designation | 3              |
| education_facility       | Education Facility Upgrade        | facilities   | 1          | All regions           | NCES school condition survey           | 3              |
| rural_broadband          | Rural Broadband Expansion         | households   | 100000     | Rural tracts          | FCC broadband map (< 25/3 Mbps)       | 2              |
| cooperative_governance   | Cooperative Governance Capacity   | communities  | 10         | All regions           | Census tract institutional density     | 3              |
| clean_manufacturing      | Clean Manufacturing Facility      | facilities   | 1          | Industrial sites      | EPA/EDA industrial site inventory      | 5              |

### 2.9 TRANSPORT

Connectivity infrastructure. Affects economic capital through
market access and social capital through mobility/isolation.

| action_id                | action_name                       | unit_label | unit_scale | applicable_regions                | suitability_source                 | time_to_deploy |
|--------------------------|-----------------------------------|------------|------------|-----------------------------------|------------------------------------|----------------|
| rural_road_improvement   | Rural Road Network Improvement    | road-mi    | 100        | Rural tracts                      | DOT condition inventory            | 2              |
| rail_freight             | Rail Freight Corridor             | rail-mi    | 100        | Industrial/extraction regions     | STB rail network + EIA commodity   | 5              |
| public_transit           | Public Transit System             | route-mi   | 50         | Urban/suburban tracts             | NTD transit service data           | 3              |
| intercity_passenger_rail | Intercity Passenger Rail          | rail-mi    | 200        | I-corridor settlements            | FRA passenger rail study           | 7              |
| active_transport         | Active Transport Infrastructure   | network-mi | 50         | Urban/suburban tracts             | Walk/bike score data               | 2              |
| port_improvement         | Port / Intermodal Facility        | facilities | 1          | Coastal, river, rail junction     | USACE port inventory               | 5              |

### 2.10 NUCLEAR_FUEL_CYCLE

Specialized economic metabolism actions from the supply chain project.
These operate at the BA level rather than bus level, reflecting
regional value-added chains rather than point-source generation.

| action_id                  | action_name                       | unit_label | unit_scale | applicable_regions                     | suitability_source                   | time_to_deploy |
|----------------------------|-----------------------------------|------------|------------|----------------------------------------|--------------------------------------|----------------|
| uranium_mining_isr         | In-Situ Recovery Uranium Mine     | facilities | 1          | Wyoming Basin, Nebraska Sandhills, SW  | NRC license + USGS uranium resource  | 3              |
| conversion_facility        | UF6 Conversion Facility           | facilities | 1          | Industrial sites with HF handling      | NRC/DOE facility assessment          | 5              |
| enrichment_facility        | Uranium Enrichment (SWU)          | facilities | 1          | Existing DOE complex sites             | NRC license + DOE site              | 7              |
| fuel_fabrication           | Nuclear Fuel Fabrication Plant     | facilities | 1          | Industrial sites with NRC license      | NRC fabrication license inventory    | 5              |
| haleu_production           | HALEU Production Facility         | facilities | 1          | DOE complex sites                      | DOE HALEU program sites             | 5              |

**EES effects specific to this bucket:**
- Economic: regional_value_added +2–3 (per facility), high_skill_employment +1–2, supply_chain_multiplier +1
- Social: institutional_anchor +1, technical_workforce +1
- Environmental: land_disturbance -0.5 (mining), water_use -0.5 (conversion)

---

## 3. Category Hierarchy

```
category (top-level)
├── energy_infrastructure
│   ├── energy_generation         (bucket 2.1)
│   ├── energy_storage            (bucket 2.2)
│   ├── energy_transmission       (bucket 2.3)
│   └── nuclear_fuel_cycle        (bucket 2.10)
│
├── ecological_restoration
│   ├── hydrological_restoration  (bucket 2.4)
│   ├── terrestrial_ecosystem     (bucket 2.5)
│   ├── coastal_and_marine        (bucket 2.6)
│   └── legacy_remediation        (bucket 2.7)
│
├── settlement_social
│   ├── settlement_and_social     (bucket 2.8)
│   └── transport                 (bucket 2.9)
│
└── disturbance                   (see §4)
```

---

## 4. Disturbance Event Schema

Disturbances are not user-placed actions — they are injected shocks
applied during the stress-test turn. They share a parallel schema.

```
{
  "disturbance_id":           string   [required]
  "disturbance_name":         string   [required]
  "category":                 "disturbance"
  "disturbance_type":         string   [required]  — "climate", "economic", "infrastructure", "ecological"

  "parameters": {
    "param_name": {
      "type":                 string   — "float", "int", "string"
      "unit":                 string
      "range":                [min, max]
      "default":              value
      "description":          string
    }
  }

  "ees_effects_per_unit": {
    "environmental": { ... },
    "economic": { ... },
    "social": { ... }
  }

  "network_effects": {
    "effect_type":            string   — "bus_load_spike", "bus_capacity_reduce",
                                         "branch_disable", "storage_deplete"
    "affected_scope":         string   — "ecoregion", "ba", "bus", "watershed"
  }

  "duration":                 string   — "instantaneous", "seasonal", "multi_year"
  "recovery_time":            float    — years to baseline recovery (without intervention)
  "applicable_ecoregions":    int[]    [optional] — null means all ecoregions
}
```

**Disturbance inventory:**

| disturbance_id          | type            | parameters                                  | duration    | recovery |
|-------------------------|-----------------|---------------------------------------------|-------------|----------|
| heat_wave               | climate         | severity_sigma (1–5), duration_days (3–21)  | instantaneous| 0.5 yr  |
| drought                 | climate         | severity (moderate/severe/extreme), duration_years (1–5) | multi_year | 2–5 yr |
| flood_event             | climate         | huc8_watershed, recurrence_interval (10–500yr) | instantaneous | 1–3 yr |
| wildfire                | climate         | acres, ecoregion                            | seasonal    | 5–20 yr  |
| hurricane               | climate         | category (1–5), landfall_ecoregion          | instantaneous| 1–5 yr  |
| ice_storm               | climate         | severity, affected_ba                       | instantaneous| 0.5 yr  |
| mine_closure            | economic        | facility_id or capacity_mw                  | instantaneous| permanent|
| plant_closure           | economic        | facility_id or capacity_mw                  | instantaneous| permanent|
| supply_chain_disruption | economic        | material_type, severity (0–1)               | multi_year  | 1–3 yr   |
| transmission_failure    | infrastructure  | branch_id                                   | instantaneous| 0.1 yr  |
| pipeline_disruption     | infrastructure  | ba_code                                     | seasonal    | 0.5 yr   |
| invasive_outbreak       | ecological      | species_type, ecoregion, severity           | multi_year  | 5–10 yr  |
| disease_event           | ecological      | target (forest/grassland/wildlife), ecoregion| multi_year | 5–20 yr |

---

## 5. Synergy Groups

When multiple actions from the same synergy group are applied to the
same ecoregion, a multiplicative bonus applies to specified EES
indicators. This models ecological and social compounding effects
that linear action-by-action accounting misses.

**Engine logic in `apply_action()`:**
After updating EES scores for the new action, check whether
`action_history` for the target ecoregion contains ≥2 distinct
`action_id` values from the same `synergy_group`. If so, apply
`synergy_multiplier` to the EES indicators listed in
`synergy_ees_targets`. The multiplier applies once per qualifying
group per ecoregion (not cumulative with each additional member).

```
{
  "synergy_group_id":         string
  "synergy_group_name":       string
  "member_action_ids":        string[]   — action_ids that belong to this group
  "min_members_to_trigger":   int        — minimum distinct actions needed (default 2)
  "synergy_multiplier":       float      — multiplied against EES delta (e.g. 1.3 = 30% bonus)
  "synergy_ees_targets":      string[]   — which EES indicators receive the bonus
  "rationale":                string     — ecological/social basis for the synergy
}
```

**Defined synergy groups:**

| group_id                  | name                            | members                                                                                        | min | multiplier | target indicators                               | rationale                                                                  |
|---------------------------|---------------------------------|------------------------------------------------------------------------------------------------|-----|------------|--------------------------------------------------|----------------------------------------------------------------------------|
| organic_water_battery     | Organic Water Battery           | beaver_reintroduction, beaver_dam_analog, headcut_repair, wetland_restore_montane, wetland_restore_playa, riparian_buffer, floodplain_reconnection, spring_restoration | 2   | 1.3        | water_security, flood_resilience, baseflow_support| Co-located process-based hydro interventions produce compounding water storage |
| grassland_mosaic          | Grassland Mosaic Restoration    | prairie_bison, tallgrass_reintroduction, shortgrass_restoration, pollinator_habitat, prescribed_fire | 2   | 1.2        | biodiversity, carbon_sequestration, soil_health   | Connected grassland patches exceed sum-of-parts for habitat connectivity   |
| community_resilience      | Community Resilience Cluster    | community_energy_coop, local_food_system, cooperative_governance, affordable_housing, health_clinic, rural_broadband | 3   | 1.4        | social_cohesion, institutional_density, food_security, energy_access | Co-located social infrastructure creates reinforcing institutional capacity |
| coastal_defense           | Coastal Defense System          | mangrove_restoration, salt_marsh, living_shoreline, oyster_reef, seagrass_restoration, dune_restoration | 2   | 1.3        | storm_resilience, coastal_erosion, biodiversity   | Layered coastal ecosystems provide compounding wave attenuation            |
| forest_watershed          | Forest-Watershed Integration    | forest_restoration_pnw, forest_restoration_ne, forest_restoration_se, riparian_buffer, wetland_restore_montane | 2   | 1.2        | water_quality, flood_resilience, carbon_sequestration | Forest cover drives infiltration; riparian buffers filter runoff           |
| industrial_transition     | Industrial Transition Complex   | brownfield_remediation, workforce_transition, clean_manufacturing, dense_housing_infill         | 2   | 1.3        | economic_diversification, employment, property_value | Remediation + reuse + workforce = viable redevelopment, not isolated cleanup |
| nuclear_regionalization   | Regional Nuclear Fuel Cycle     | uranium_mining_isr, conversion_facility, enrichment_facility, fuel_fabrication, nuclear_smr     | 3   | 1.4        | regional_value_added, supply_chain_multiplier, energy_security | Regionalized fuel cycle retains value-added that single-facility deployment doesn't |

---

## 6. EES Indicator Registry

Every `ees_effects` entry references indicators from this registry.
Indicators are grouped by capital type. Each is normalized to 0–10
at the ecoregion level using the study area distribution.

### 6.1 Environmental Capital (E)

| indicator_id             | indicator_name                  | data_source                        | unit (raw)      |
|--------------------------|---------------------------------|------------------------------------|-----------------|
| water_security           | Water Security Index            | USGS streamflow + NWI + 303(d)    | composite index |
| water_quality            | Surface Water Quality           | EPA 303(d) impaired waters list   | % streams impaired |
| biodiversity             | Biodiversity Intactness         | NLCD land cover + GAP species     | composite index |
| carbon_sequestration     | Carbon Sequestration Potential  | NLCD + USDA soil carbon estimates | tC/acre/yr      |
| soil_health              | Soil Health Index               | NRCS soil survey + NLCD           | composite index |
| flood_resilience         | Flood Resilience                | FEMA floodplain + wetland fraction| composite index |
| heat_exposure            | Heat Exposure Index             | MODIS/Landsat LST                 | °C July mean    |
| air_quality              | Air Quality Index               | EPA AQS monitoring                | AQI annual mean |
| land_cover_integrity     | Land Cover Integrity            | NLCD % natural cover              | fraction 0–1    |
| baseflow_support         | Baseflow / Dry Season Flow      | USGS baseflow index               | fraction of total|
| storm_resilience         | Storm / Extreme Weather Buffer  | Ecosystem structure indices       | composite index |
| coastal_erosion          | Coastal Erosion Rate            | USGS coastal vulnerability        | m/yr            |

### 6.2 Economic Capital (Ec)

| indicator_id              | indicator_name                  | data_source                      | unit (raw)      |
|---------------------------|---------------------------------|----------------------------------|-----------------|
| median_income             | Median Household Income         | ACS 5-year B19013                | USD/yr          |
| employment_rate           | Employment Rate                 | ACS 5-year                       | fraction 0–1    |
| poverty_rate              | Poverty Rate                    | ACS 5-year S1701                 | fraction 0–1    |
| economic_diversification  | Economic Diversification (HHI)  | BEA county GDP by sector         | inv. HHI        |
| property_value            | Median Property Value           | ACS 5-year B25077                | USD             |
| energy_cost_burden        | Energy Cost Burden              | DOE LEAD tool                    | % income        |
| regional_value_added      | Regional Value-Added            | BEA + BLS QCEW                   | USD/capita      |
| supply_chain_multiplier   | Supply Chain Multiplier Effect  | BEA input-output tables          | multiplier      |
| agricultural_resilience   | Agricultural Economic Resilience| USDA NASS + crop diversity        | composite index |
| water_rights_value        | Water Rights Economic Value     | State water rights records       | USD/acre-ft     |
| redevelopment_potential   | Brownfield Redev. Potential     | EPA Brownfields + market data    | composite index |
| energy_security           | Energy Supply Security          | BA capacity margin + fuel diversity| composite index|

### 6.3 Social Capital (S)

| indicator_id              | indicator_name                  | data_source                      | unit (raw)      |
|---------------------------|---------------------------------|----------------------------------|-----------------|
| educational_attainment    | Educational Attainment          | ACS 5-year S1501                 | % BA or higher  |
| health_insurance          | Health Insurance Coverage       | ACS 5-year S2701                 | fraction 0–1    |
| health_outcomes           | Health Outcome Index            | CDC PLACES / CHR                 | composite index |
| housing_quality           | Housing Quality Index           | ACS median year built + vacancy  | composite index |
| internet_access           | Broadband Access                | ACS S2801 + FCC broadband map    | fraction 0–1    |
| institutional_density     | Institutional Anchor Density    | Hospitals + universities + gov/cap| per capita     |
| social_cohesion           | Social Cohesion Index           | Census civic + religious + assoc.| composite index |
| food_security             | Food Security / Access          | USDA food desert + SNAP data     | composite index |
| environmental_justice     | Environmental Justice Index     | EPA EJScreen                     | composite index |
| energy_access             | Clean Energy Access             | Utility rates + solar access     | composite index |
| flood_risk_reduction      | Flood Risk to Population        | FEMA NFIP claims + exposure      | claims/capita   |
| recreational_access       | Recreational Land Access        | USGS PAD + Census proximity      | acres/capita    |
| high_skill_employment     | High-Skill Employment Share     | BLS OEWS by occupation           | fraction 0–1    |
| technical_workforce       | Technical Workforce Pipeline    | NCES CTE enrollment + STEM grad  | per capita      |

---

## 7. Material Type Registry

All material quantities in `material_requirements` reference this
registry. Units are standardized so the material ledger aggregates
cleanly across heterogeneous actions.

| material_type            | display_name                   | unit       | notes                                        |
|--------------------------|--------------------------------|------------|----------------------------------------------|
| concrete_tons            | Concrete                       | metric tons| Portland cement concrete                     |
| steel_tons               | Steel                          | metric tons| Structural + reinforcing                     |
| aluminum_tons            | Aluminum                       | metric tons| Conductor, frames                            |
| copper_tons              | Copper                         | metric tons| Wiring, motors, generators                   |
| silicon_tons             | Silicon (Solar Grade)          | metric tons| PV cell material                             |
| glass_tons               | Glass (Solar Panels)           | metric tons| PV cover glass                               |
| rare_earth_tons          | Rare Earth Elements            | metric tons| Permanent magnets (wind, EV)                 |
| lithium_tons             | Lithium (LCE)                  | metric tons| Battery cathode material                     |
| cobalt_tons              | Cobalt                         | metric tons| Battery cathode material                     |
| nickel_tons              | Nickel                         | metric tons| Battery cathode material                     |
| conductor_km             | Transmission Conductor         | km         | ACSR/ACCC overhead conductor                 |
| tower_steel_tons         | Transmission Tower Steel       | metric tons| Lattice or monopole structures               |
| seed_mix_lbs             | Native Seed Mix                | lbs        | Region-specific native grass/forb blend      |
| seedling_count           | Tree / Shrub Seedlings         | count      | Riparian, forest, agroforestry planting      |
| fencing_miles            | Fencing                        | miles      | Livestock exclusion, wildlife corridor        |
| earthwork_yd3            | Earthwork / Excavation         | cubic yards| Wetland grading, dam construction, headcut    |
| penstock_steel_tons      | Penstock Steel                 | metric tons| Pumped hydro / conventional hydro            |
| labor_years              | Construction Labor              | person-yrs | Total direct labor demand                    |
| land_acres               | Land Area Required             | acres      | Direct footprint of intervention             |
| water_rights_af          | Water Rights                   | acre-feet  | Consumed or committed water                  |
| monitoring_years         | Post-Construction Monitoring   | person-yrs | Ecological monitoring + adaptive management  |
| remediation_volume_tons  | Contaminated Material Removal  | metric tons| Brownfield / Superfund remediation           |
| pipe_miles               | Water / Sewer Pipe             | miles      | Lead service line, utility infrastructure    |
| uranium_tons             | Uranium (U3O8)                 | metric tons| Nuclear fuel input                           |
| swu_capacity             | Separative Work Units          | kSWU/yr    | Enrichment throughput                        |

---

## 8. Suitability Heatmap Layer

For each `(action_id, ecoregion)` pair, a pre-computed suitability
score (0.0–1.0) controls the heatmap intensity on the sandbox map.
Scores are computed at initialization from the `suitability_source`
dataset referenced in each action record.

**Computation:** `suitability = f(resource_data, land_availability, regulatory_constraint)`

- Energy generation: resource quality (wind class, irradiance, geothermal gradient) × available land fraction × regulatory screen (protected areas, military, tribal)
- Ecological restoration: degradation level of current land cover relative to reference ecosystem × water/climate suitability × contiguity with existing intact habitat
- Settlement/social: population density × institutional gap (inverse of current service level) × infrastructure access
- Transport: current network deficiency × demand proxy (population, freight volume)

**Engine integration:** `state["suitability_scores"][action_id][ecoregion_code] → float`

Used by the UI heatmap layer. Not a hard constraint — users *can*
place actions in low-suitability zones, but the EES return is
penalized by `capacity_factor × suitability_score` for energy
actions, and the engine logs a warning for ecological actions
placed in zones with suitability < 0.2.

---

## 9. Time-Advance Mechanics (Turn-Based Projection)

Each turn advances the state to a target year. Between turns, the
engine applies deterministic time-dependent effects:

| effect                   | applies_to           | formula / logic                                           |
|--------------------------|----------------------|-----------------------------------------------------------|
| deployment_delay         | all actions          | Action becomes operational only after `time_to_deploy` years from placement. Before that, material is committed but EES/network effects are zero. |
| capital_depreciation     | energy_generation, energy_storage | Capacity degrades linearly: `effective_capacity = nameplate × (1 - age / design_life)` for age > 0.8 × design_life. |
| climate_trend            | all ecoregions       | Apply CMIP6-downscaled temperature and precipitation trend deltas to environmental indicators. Source: LOCA2 or equivalent. |
| demand_growth            | bus load              | Scale bus loads by projected demand growth rate per BA (from EIA AEO or custom). |
| policy_assumption        | pathway conditions   | Check whether policy conditions (carbon price, IRA survival, CES) hold at this time step. Binary flags that affect pathway condition evaluation. |
| ecological_maturation    | ecological_restoration | Restoration actions reach full EES effect only after maturation period (e.g., forest: 20 yr, prairie: 5 yr, wetland: 3 yr). Before maturation, EES effect = `base_effect × (age / maturation_years)`. |
| population_shift         | settlement tracts    | Apply Census projection or custom growth model to tract populations. Affects social indicator denominators. |

---

## 10. Regional Instantiation

To deploy TERRA for a new study area:

1. Select EPA Level III ecoregion set (clip to bounding box)
2. Run Phase 0 crosswalk: ecoregions × BAs × synthetic buses × census tracts
3. Compute EES baseline from indicator data sources (§6)
4. Filter action library: retain actions where `applicable_ecoregions` intersects study area set
5. Compute suitability heatmap scores for retained actions
6. Load or build synthetic network for study area BAs
7. Pre-characterize scenario profiles against study area baseline
8. Initialize `state` — the sandbox is ready

The taxonomy in §2 is designed so that steps 4–5 are automatic:
add a new action_id with its `applicable_ecoregions` and it appears
in any study area that intersects those ecoregions. Regional variants
(e.g., `forest_restoration_pnw` vs `forest_restoration_ne`) share
the same bucket and EES indicator structure but differ in ecoregion
applicability, material requirements, and time constants.

---

## Appendix A — Schema Versioning

| version | date       | changes                                                |
|---------|------------|--------------------------------------------------------|
| 0.1     | 2026-05-11 | Initial draft. Mountain West prototype + generalization|
```

**Future additions (flagged for v0.2):**
- Explicit inter-regional exchange actions (energy export, material trade, labor mobility)
- Multi-region state with cross-boundary transmission and economic flows
- Uncertainty bounds on all EES coefficients (±range, distribution type)
- Dynamic synergy multipliers that increase with co-location density
- Feedback loops (e.g., economic growth → demand growth → network stress)
```
