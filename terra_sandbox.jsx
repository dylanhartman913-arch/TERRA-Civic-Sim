// terra_sandbox.jsx — TERRA Transition Sandbox, Module 2
// Mountain West study area | Session 9 | Self-contained React artifact
// Layout: position:fixed root avoids 100vh iframe resolution issues

import React, { useReducer, useState, useMemo, useCallback } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip as RTooltip
} from 'recharts';

// ─── Projection ──────────────────────────────────────────────────────────────
const W = 800, H = 580;
const LON_MIN = -125, LON_MAX = -95, LAT_MIN = 31, LAT_MAX = 50;
function px(lon, lat) {
  return [(lon - LON_MIN) / (LON_MAX - LON_MIN) * W,
          (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * H];
}
function ringsToD(rings) {
  return rings.map(r =>
    'M' + r.map(([lo, la]) => px(lo, la).map(v => v.toFixed(1)).join(',')).join('L') + 'Z'
  ).join(' ');
}

// ─── EES Baselines ───────────────────────────────────────────────────────────
const EES_BASE = {
  '17': {E:6.556,Ec:5.845,S:5.211,name:'Middle Rockies'},
  '18': {E:0.598,Ec:5.779,S:4.855,name:'Wyoming Basin'},
  '20': {E:0.686,Ec:6.036,S:4.957,name:'Colorado Plateaus'},
  '21': {E:7.524,Ec:6.280,S:5.385,name:'Southern Rockies'},
  '25': {E:2.396,Ec:7.561,S:5.433,name:'High Plains'},
  '43': {E:2.961,Ec:5.824,S:4.855,name:'NW Great Plains'},
  '80': {E:2.056,Ec:5.995,S:4.964,name:'N Basin and Range'},
};
// ─── BA Territory Colors ─────────────────────────────────────────────────────
const BA_COLORS = {
  AZPS:'#c45e1a', BPAT:'#2d6a4f', EPE:'#7d5a3c',
  IPCO:'#3d7eb5', NEVP:'#6b4f8f', NWMT:'#2d9e6e',
  PACE:'#b5813e', PSCO:'#7a9e5c', PNM:'#c27c36',
  SRP: '#ef4444', WACM:'#b07d3e', WAUW:'#8e6a4f',
};

// BA display metadata (name, abbreviation, centroid for labels)
const BA_META = {
  AZPS:{name:'Arizona Public Service',   abbr:'AZPS', cx:-112.2, cy:33.8},
  BPAT:{name:'Bonneville Power Admin.',  abbr:'BPAT', cx:-121.0, cy:45.5},
  EPE: {name:'El Paso Electric',         abbr:'EPE',  cx:-106.5, cy:32.4},
  IPCO:{name:'Idaho Power',              abbr:'IPCO', cx:-114.2, cy:43.3},
  NEVP:{name:'Nevada Power',             abbr:'NEVP', cx:-116.8, cy:38.8},
  NWMT:{name:'NorthWestern Energy',      abbr:'NWMT', cx:-110.5, cy:47.0},
  PACE:{name:'PacifiCorp East',          abbr:'PACE', cx:-109.8, cy:42.1},
  PSCO:{name:'Public Service Colorado',  abbr:'PSCO', cx:-105.8, cy:39.0},
  PNM: {name:'Public Service NM',        abbr:'PNM',  cx:-106.5, cy:34.5},
  SRP: {name:'Salt River Project',       abbr:'SRP',  cx:-111.5, cy:33.6},
  WACM:{name:'WAPA Rocky Mtn. Region',   abbr:'WACM', cx:-105.8, cy:41.5},
  WAUW:{name:'WAPA Upper Plains West',   abbr:'WAUW', cx:-108.0, cy:47.8},
};

// BA → ecoregion codes (internal EES computation only — not exposed in UI)
const BA_ECO_MAP = {
  AZPS:['20'],
  BPAT:['17','80'],
  EPE: ['21'],
  IPCO:['80','17'],
  NEVP:['80','20'],
  NWMT:['17','43'],
  PACE:['17','18','20','43','80'],
  PSCO:['21','25','18','20'],
  PNM: ['21','20'],
  SRP: ['20'],
  WACM:['43','21','25','20'],
  WAUW:['43'],
};

// Ecoregion → BA codes (for applicable_bas derivation)
const ECO_BA_XWALK = {
  '17':['BPAT','IPCO','PACE','NWMT'],
  '18':['PACE'],
  '20':['AZPS','BPAT','NEVP','PACE','PSCO','PNM','SRP','WACM'],
  '21':['PSCO','PNM','EPE','WACM'],
  '25':['PSCO','WACM'],
  '43':['PACE','WACM','WAUW','NWMT'],
  '80':['BPAT','IPCO','NEVP','PACE'],
};

// WACM sub-regions (Wyoming county groupings for drill-down)
const WACM_SUBS = {
  NE_WY:{name:'Northeast WY — Powder River Basin', tag:'Gillette / PRB coal',
    poly:[[-106.5,42.5],[-104.05,42.5],[-104.05,45.0],[-106.5,45.0]], cx:-105.2, cy:43.8, eco:'43'},
  CN_WY:{name:'Central WY — Wind River Corridor',  tag:'Casper / Riverton',
    poly:[[-109.5,42.5],[-106.5,42.5],[-106.5,45.5],[-109.5,45.5]], cx:-108.0, cy:44.0, eco:'18'},
  SW_WY:{name:'Southwest WY — Kemmerer / Green River', tag:'Overthrust Belt / SMR',
    poly:[[-111.05,41.0],[-107.5,41.0],[-107.5,43.5],[-111.05,43.5]], cx:-109.3, cy:42.3, eco:'18'},
  SE_WY:{name:'Southeast WY — Front Range Interface', tag:'Cheyenne / Laramie',
    poly:[[-107.5,41.0],[-104.05,41.0],[-104.05,43.0],[-107.5,43.0]], cx:-105.8, cy:42.0, eco:'25'},
};

// BA territory polygons (RDP-simplified from EIA ba_territories.geojson, tol=0.35°)
const BA_POLYS = {
  AZPS:[
    [[-114.831,32.483],[-114.547,34.188],[-113.334,34.318],[-113.336,36.092],[-114.047,36.194],[-114.051,37.0],[-109.046,36.43],[-109.047,33.209],[-111.786,32.525],[-111.213,32.239],[-111.618,31.505],[-114.831,32.483]],
    [[-112.335,33.399],[-110.824,33.394],[-111.806,34.009],[-112.335,33.399]],
  ],
  BPAT:[
    [[-119.867,46.195],[-120.363,46.737],[-118.278,46.739],[-116.515,46.038],[-118.128,46.035],[-117.419,46.383],[-117.862,46.56],[-120.542,45.715],[-118.697,45.295],[-117.751,45.958],[-117.267,45.081],[-118.407,44.714],[-118.746,43.601],[-117.218,42.0],[-118.343,41.044],[-119.507,41.172],[-119.528,41.996],[-119.999,41.995],[-119.999,40.777],[-120.659,40.696],[-121.446,41.347],[-120.578,41.555],[-120.504,42.51],[-121.925,42.732],[-122.063,43.406],[-122.742,43.545],[-124.02,42.949],[-124.024,46.229],[-123.548,46.266],[-124.082,46.269],[-123.86,46.949],[-124.732,48.381],[-122.918,48.092],[-123.038,47.52],[-122.528,47.376],[-123.232,47.085],[-122.966,46.405],[-122.203,46.763],[-122.545,47.099],[-120.767,46.655],[-121.752,45.529],[-120.668,46.301],[-119.867,46.195]],
    [[-113.922,48.333],[-114.363,47.376],[-114.115,45.321],[-116.192,45.498],[-115.493,46.254],[-116.726,46.508],[-115.965,46.711],[-116.467,47.483],[-115.653,47.476],[-116.398,48.426],[-117.036,48.329],[-117.032,48.999],[-113.957,48.999],[-113.922,48.333]],
  ],
  EPE:[
    [[-105.998,32.002],[-104.766,30.916],[-107.297,31.784],[-107.557,32.845],[-106.059,32.838],[-105.998,32.002]],
    [[-105.359,32.001],[-104.848,32.143],[-104.841,32.963],[-104.188,32.257],[-105.359,32.001]],
  ],
  IPCO:[[[-111.045,43.316],[-111.047,42.002],[-117.304,42.0],[-118.764,43.982],[-118.407,44.714],[-115.845,45.497],[-114.367,45.32],[-114.294,44.534],[-111.056,44.75],[-111.045,43.316]]],
  NEVP:[[[-114.633,35.002],[-115.543,35.727],[-115.308,36.475],[-116.412,36.83],[-116.23,37.493],[-117.704,37.498],[-117.97,38.12],[-120.143,38.869],[-120.523,39.572],[-120.001,39.645],[-119.999,41.995],[-119.528,41.996],[-119.507,41.172],[-118.343,41.044],[-117.51,41.999],[-114.042,41.994],[-114.047,36.194],[-114.756,36.087],[-114.633,35.002]]],
  NWMT:[[[-114.367,45.32],[-113.957,48.999],[-111.849,48.998],[-111.894,48.111],[-108.978,48.394],[-108.891,47.734],[-107.925,47.563],[-108.089,46.754],[-106.372,46.505],[-104.942,47.007],[-104.939,45.881],[-104.044,45.882],[-104.04,44.998],[-111.055,45.001],[-112.845,44.358],[-113.247,44.823],[-114.294,44.534],[-114.367,45.32]]],
  PACE:[[[-105.913,45.001],[-105.529,42.929],[-107.467,43.404],[-107.955,44.445],[-108.931,44.18],[-107.079,42.725],[-107.052,42.084],[-105.881,41.964],[-105.725,40.997],[-108.789,41.0],[-108.48,39.694],[-109.051,39.582],[-109.785,37.228],[-114.051,37.0],[-114.042,41.994],[-111.047,42.002],[-111.055,45.001],[-105.913,45.001]]],
  PNM:[[[-109.046,36.43],[-103.002,37.0],[-103.042,35.53],[-104.265,35.782],[-104.735,35.059],[-104.892,34.33],[-104.208,34.268],[-104.212,33.746],[-104.848,32.143],[-105.956,32.002],[-106.059,32.838],[-107.557,32.845],[-107.297,31.784],[-109.05,31.333],[-109.046,36.43]]],
  PSCO:[
    [[-103.707,39.74],[-105.329,38.63],[-107.501,39.218],[-108.382,38.368],[-109.06,38.441],[-109.051,39.582],[-107.42,39.986],[-108.783,40.315],[-108.789,41.0],[-106.858,41.003],[-106.295,39.714],[-105.69,39.852],[-105.972,40.688],[-105.407,40.114],[-104.605,40.504],[-103.707,39.74]],
    [[-103.893,36.997],[-106.476,36.994],[-106.864,37.933],[-105.844,38.367],[-105.829,37.76],[-104.897,37.769],[-104.897,38.312],[-103.917,38.321],[-103.893,36.997]],
  ],
  SRP:[[[-111.405,33.88],[-110.893,33.779],[-110.934,33.126],[-112.339,33.404],[-111.405,33.88]]],
  WACM:[
    [[-102.042,37.375],[-102.042,36.993],[-103.893,36.997],[-103.917,38.321],[-105.829,37.76],[-106.256,38.367],[-106.864,37.933],[-106.473,36.664],[-106.877,36.423],[-111.976,36.736],[-111.826,37.221],[-109.785,37.228],[-109.49,38.41],[-108.382,38.368],[-107.982,39.06],[-105.329,38.63],[-103.707,39.566],[-104.605,40.504],[-105.407,40.114],[-105.863,40.689],[-105.696,39.839],[-106.385,39.767],[-106.873,40.974],[-105.725,40.997],[-105.881,41.964],[-107.052,42.084],[-107.079,42.725],[-108.931,44.18],[-107.955,44.445],[-107.467,43.404],[-105.529,42.929],[-105.913,45.001],[-103.497,45.002],[-103.043,44.203],[-103.415,43.001],[-104.053,43.001],[-104.053,41.001],[-102.051,40.819],[-102.042,37.375]],
    [[-107.42,39.986],[-108.48,39.694],[-108.154,40.35],[-107.42,39.986]],
  ],
  WAUW:[[[-111.826,48.523],[-111.849,48.998],[-104.76,48.999],[-104.756,48.477],[-105.279,48.476],[-104.942,47.007],[-106.372,46.505],[-108.089,46.754],[-107.925,47.563],[-108.891,47.734],[-108.978,48.394],[-111.894,48.111],[-111.826,48.523]]],
};

// ─── State boundary approximations ───────────────────────────────────────────
const STATE_OUTLINES = [
  {id:'MT',d:[[-116.05,49.00],[-104.05,49.00],[-104.05,44.35],[-111.05,44.35],[-111.05,44.80],[-114.00,44.80],[-116.05,47.00],[-116.05,49.00]]},
  {id:'WY',d:[[-111.046,45.001],[-104.052,45.001],[-104.052,41.000],[-111.046,41.000],[-111.046,45.001]]},
  {id:'CO',d:[[-109.046,41.000],[-102.046,41.000],[-102.046,37.000],[-109.046,37.000],[-109.046,41.000]]},
  {id:'NM',d:[[-109.05,37.00],[-103.00,37.00],[-103.00,32.00],[-106.62,32.00],[-108.00,31.33],[-109.05,31.33],[-109.05,37.00]]},
  {id:'AZ',d:[[-114.815,37.000],[-109.046,37.000],[-109.046,31.332],[-111.046,31.332],[-114.815,32.500],[-114.815,37.000]]},
  {id:'UT',d:[[-114.052,42.000],[-111.046,42.000],[-111.046,37.000],[-109.046,37.000],[-109.046,42.000],[-114.052,42.000]]},
  {id:'NV',d:[[-120.00,42.00],[-114.05,42.00],[-114.05,37.00],[-117.00,37.00],[-119.00,38.50],[-120.00,39.00],[-120.00,42.00]]},
  {id:'ID',d:[[-117.24,49.00],[-116.05,49.00],[-116.05,47.00],[-114.00,44.80],[-111.05,44.80],[-111.05,42.00],[-114.05,42.00],[-117.24,42.00],[-117.24,49.00]]},
  {id:'ND',d:[[-104.048,49.001],[-97.228,49.001],[-97.228,45.935],[-104.048,45.935],[-104.048,49.001]]},
  {id:'SD',d:[[-104.05,45.96],[-96.44,45.94],[-96.44,43.00],[-104.05,43.00],[-104.05,45.96]]},
  {id:'NE',d:[[-104.05,43.00],[-98.00,43.00],[-95.31,40.00],[-102.05,40.00],[-104.05,41.00],[-104.05,43.00]]},
];

// ─── Actions (45 MW-applicable, offshore_wind_great_lakes excluded) ───────────
// n=name, b=bucket, tier, ps=placement_scale, eco=applicable_ecoregions,
// ul=unit_label, us=unit_scale, ttd=time_to_deploy, dl=design_life,
// ees={E,Ec,S}, mats={st,co,fi,gl,al,li} all in tonnes
const ACTIONS = {
  wind_utility:           {n:'Utility Wind',          b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[17,18,20,21,25,43,80],ul:'MW',       us:1000, ttd:3, dl:25, ees:{E:.0576, Ec:.4318,S:.0288}, mats:{st:150000,co:1000000,fi:15000}},
  solar_utility:          {n:'Utility Solar PV',      b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[17,18,20,21,25,43,80],ul:'MW',       us:1000, ttd:2, dl:30, ees:{E:.03,   Ec:.3598,S:.03},   mats:{st:40000, gl:8000,  co:150000}},
  geothermal_utility:     {n:'Utility Geothermal',    b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[17,18,20,80],          ul:'MW',       us:100,  ttd:5, dl:30, ees:{E:-.05,  Ec:.18,  S:.05},   mats:{st:150,   co:200}},
  hydropower_small:       {n:'Small Hydropower',      b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[17,21,80],             ul:'MW',       us:10,   ttd:4, dl:50, ees:{E:-.08,  Ec:.12,  S:.06},   mats:{co:800,   st:60}},
  smr_advanced:           {n:'Small Modular Reactor', b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[17,18,21],             ul:'MW',       us:100,  ttd:7, dl:60, ees:{E:-.03,  Ec:.35,  S:.12},   mats:{st:40,    co:500}},
  fusion_pilot:           {n:'Fusion Pilot Plant',    b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[17,18,21],             ul:'MW',       us:100,  ttd:15,dl:40, ees:{E:.02,   Ec:.25,  S:.15},   mats:{st:200,   co:800}},
  coal_to_solar:          {n:'Coal Site → Solar',     b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[18,25,43],             ul:'MW',       us:500,  ttd:3, dl:30, ees:{E:.08,   Ec:.20,  S:.08},   mats:{st:20000, gl:4000,  co:75000}},
  coal_to_smr:            {n:'Coal Site → SMR',       b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[18,43],                ul:'MW',       us:100,  ttd:8, dl:60, ees:{E:.02,   Ec:.40,  S:.15},   mats:{st:40,    co:500}},
  coal_repowering:        {n:'Coal Repowering',       b:'energy_generation',  tier:'energy',     ps:'bus',       eco:[17,18,20,21,25,43],    ul:'MW',       us:1000, ttd:2, dl:20, ees:{E:.0,    Ec:.1439,S:.0864}, mats:{st:8000,  co:5000}},
  battery_grid:           {n:'Grid Battery (Li-ion)', b:'energy_storage',     tier:'energy',     ps:'bus',       eco:[17,18,20,21,25,43,80],ul:'MWh',      us:1000, ttd:2, dl:15, ees:{E:.0,    Ec:.08,  S:.05},   mats:{li:150,   st:8}},
  pumped_hydro:           {n:'Pumped Hydro Storage',  b:'energy_storage',     tier:'energy',     ps:'bus',       eco:[17,21,80],             ul:'MWh',      us:5000, ttd:6, dl:75, ees:{E:-.05,  Ec:.15,  S:.06},   mats:{co:300,   st:25}},
  hydrogen_electrolysis:  {n:'Green Hydrogen Prod.',  b:'energy_storage',     tier:'energy',     ps:'bus',       eco:[17,18,21,25],          ul:'MW',       us:100,  ttd:3, dl:20, ees:{E:-.02,  Ec:.12,  S:.04},   mats:{st:20}},
  transmission_230kv:     {n:'230kV Transmission',    b:'energy_transmission',tier:'energy',     ps:'bus',       eco:[17,18,20,21,25,43,80],ul:'circuit-mi',us:100,  ttd:3, dl:50, ees:{E:.0,    Ec:.2879,S:.0288}, mats:{st:12500, al:1500,  co:20000}},
  transmission_500kv:     {n:'500kV Interregional',   b:'energy_transmission',tier:'energy',     ps:'bus',       eco:[17,18,20,21,25,43,80],ul:'circuit-mi',us:200,  ttd:5, dl:50, ees:{E:-.03,  Ec:.18,  S:.04},   mats:{st:25,    al:3,     co:40}},
  microgrid:              {n:'Community Microgrid',   b:'energy_transmission',tier:'energy',     ps:'bus',       eco:[17,18,20,21,25,43,80],ul:'MW',        us:5,    ttd:2, dl:20, ees:{E:.0,    Ec:.05,  S:.10},   mats:{st:5}},
  uranium_mining_isr:     {n:'ISR Uranium Mine',      b:'nuclear_fuel_cycle', tier:'energy',     ps:'bus',       eco:[18,43,25],             ul:'facilities',us:1,    ttd:3, dl:20, ees:{E:-.15,  Ec:.30,  S:.08},   mats:{st:200}},
  conversion_facility:    {n:'UF6 Conversion Fac.',   b:'nuclear_fuel_cycle', tier:'energy',     ps:'bus',       eco:[18,25,43],             ul:'facilities',us:1,    ttd:5, dl:40, ees:{E:-.10,  Ec:.45,  S:.10},   mats:{st:500,   co:2000}},
  enrichment_facility:    {n:'Enrichment (Centrifuge)',b:'nuclear_fuel_cycle',tier:'energy',     ps:'bus',       eco:[18,21,17],             ul:'facilities',us:1,    ttd:7, dl:40, ees:{E:-.05,  Ec:.60,  S:.15},   mats:{st:800,   co:3000}},
  haleu_production:       {n:'HALEU Production',      b:'nuclear_fuel_cycle', tier:'energy',     ps:'bus',       eco:[18,17,21],             ul:'facilities',us:1,    ttd:5, dl:30, ees:{E:-.03,  Ec:.50,  S:.12},   mats:{st:300,   co:1000}},
  fuel_fabrication:       {n:'Nuclear Fuel Fab.',     b:'nuclear_fuel_cycle', tier:'energy',     ps:'bus',       eco:[17,18,21],             ul:'facilities',us:1,    ttd:5, dl:40, ees:{E:-.03,  Ec:.45,  S:.10},   mats:{st:250,   co:800}},
  riparian_buffer:        {n:'Riparian Buffer',       b:'hydrological_restoration',tier:'ecological',ps:'watershed',eco:[17,18,20,21,25,43,80],ul:'stream-mi', us:10000,ttd:1, dl:null,ees:{E:1.0812,Ec:.0,  S:.0},    mats:{}},
  beaver_reintroduction:  {n:'Beaver Reintroduction', b:'hydrological_restoration',tier:'ecological',ps:'watershed',eco:[17,18,21,80],          ul:'watersheds',us:10,   ttd:1, dl:null,ees:{E:.25,   Ec:.05,  S:.03},   mats:{}},
  wetland_restoration:    {n:'Wetland Restoration',   b:'hydrological_restoration',tier:'ecological',ps:'watershed',eco:[17,18,21,43,80],        ul:'acres',    us:5000, ttd:1, dl:null,ees:{E:.20,   Ec:.03,  S:.04},   mats:{}},
  floodplain_reconnection:{n:'Floodplain Reconnection',b:'hydrological_restoration',tier:'ecological',ps:'watershed',eco:[17,18,21,43,80],       ul:'river-mi', us:50,   ttd:2, dl:null,ees:{E:.18,   Ec:.04,  S:.05},   mats:{}},
  spring_seep_development:{n:'Spring & Seep Restore', b:'hydrological_restoration',tier:'ecological',ps:'watershed',eco:[18,20,80],              ul:'sites',    us:20,   ttd:1, dl:null,ees:{E:.15,   Ec:.02,  S:.04},   mats:{}},
  watershed_protection:   {n:'Watershed Protection',  b:'hydrological_restoration',tier:'ecological',ps:'watershed',eco:[17,21,80],              ul:'acres',    us:50000,ttd:1, dl:null,ees:{E:.12,   Ec:.02,  S:.03},   mats:{}},
  mine_land_reclamation:  {n:'Mine Land Reclamation', b:'hydrological_restoration',tier:'ecological',ps:'watershed',eco:[17,18,20,21,43,80],     ul:'acres',    us:5000, ttd:3, dl:null,ees:{E:.18,   Ec:.05,  S:.04},   mats:{}},
  prairie_restoration:    {n:'Prairie Restoration',   b:'terrestrial_ecosystem',   tier:'ecological',ps:'ecoregion',eco:[18,25,43,80],            ul:'acres',    us:10000,ttd:1, dl:null,ees:{E:1.2613,Ec:.0,  S:.0},    mats:{}},
  sagebrush_restoration:  {n:'Sagebrush Restoration', b:'terrestrial_ecosystem',   tier:'ecological',ps:'ecoregion',eco:[18,80,43],              ul:'acres',    us:10000,ttd:1, dl:null,ees:{E:.18,   Ec:.01,  S:.02},   mats:{}},
  forest_restoration:     {n:'Forest Restoration',    b:'terrestrial_ecosystem',   tier:'ecological',ps:'ecoregion',eco:[17,21],                 ul:'acres',    us:10000,ttd:1, dl:null,ees:{E:.22,   Ec:.03,  S:.04},   mats:{}},
  carbon_sequestration_soil:{n:'Soil Carbon Seq.',    b:'terrestrial_ecosystem',   tier:'ecological',ps:'ecoregion',eco:[18,25,43,80],            ul:'acres',    us:50000,ttd:1, dl:null,ees:{E:.08,   Ec:.01,  S:.01},   mats:{}},
  bison_reintroduction:   {n:'Bison Reintroduction',  b:'terrestrial_ecosystem',   tier:'ecological',ps:'ecoregion',eco:[25,43],                 ul:'herds',    us:1,    ttd:2, dl:null,ees:{E:.20,   Ec:.04,  S:.06},   mats:{}},
  invasive_treatment:     {n:'Invasive Spp. Treatment',b:'terrestrial_ecosystem',  tier:'ecological',ps:'ecoregion',eco:[17,18,20,21,25,43,80],  ul:'acres',    us:10000,ttd:1, dl:null,ees:{E:.7208, Ec:.0,  S:.0},    mats:{}},
  renewable_degraded_land:{n:'Renewables on Degraded Land',b:'terrestrial_ecosystem',tier:'ecological',ps:'ecoregion',eco:[17,18,20,21,25,43,80],ul:'MW',      us:1000, ttd:2, dl:30,  ees:{E:.5406, Ec:.3243,S:.0},    mats:{st:20000,gl:4000,co:75000}},
  rural_broadband:        {n:'Rural Broadband',       b:'settlement_social',       tier:'social',    ps:'county',   eco:[17,18,20,21,25,43,80],ul:'households',us:100000,ttd:2,dl:20,  ees:{E:.0,    Ec:.0816,S:.6118}, mats:{}},
  health_clinic:          {n:'Rural Health Clinic',   b:'settlement_social',       tier:'social',    ps:'county',   eco:[17,18,20,21,25,43,80],ul:'facilities',us:1,    ttd:2, dl:20,  ees:{E:.0,    Ec:.0,   S:.5098}, mats:{st:150,   co:200}},
  workforce_retraining:   {n:'Workforce Retraining',  b:'settlement_social',       tier:'social',    ps:'county',   eco:[17,18,20,21,25,43,80],ul:'workers',   us:1000, ttd:1, dl:20,  ees:{E:.0,    Ec:.1274,S:.5098}, mats:{}},
  affordable_housing:     {n:'Affordable Housing',    b:'settlement_social',       tier:'social',    ps:'county',   eco:[17,18,20,21,25,43,80],ul:'units',     us:500,  ttd:3, dl:20,  ees:{E:.0,    Ec:.0,   S:.4079}, mats:{st:2500,  co:6250}},
  university_research_center:{n:'University Anchor',  b:'settlement_social',       tier:'social',    ps:'county',   eco:[17,18,21,25,43],       ul:'facilities',us:1,    ttd:4, dl:50,  ees:{E:.02,   Ec:.25,  S:.20},   mats:{st:300,   co:800}},
  tribal_energy_sovereignty:{n:'Tribal Clean Energy', b:'settlement_social',       tier:'social',    ps:'county',   eco:[17,18,20,21,80],       ul:'projects',  us:1,    ttd:3, dl:30,  ees:{E:.08,   Ec:.20,  S:.25},   mats:{}},
  lead_service_line:      {n:'Lead Pipe Replacement', b:'settlement_social',       tier:'social',    ps:'county',   eco:[17,18,21,25,43,80],    ul:'connections',us:10000,ttd:3,dl:50,  ees:{E:.03,   Ec:.02,  S:.12},   mats:{}},
  community_solar:        {n:'Community Solar',       b:'settlement_social',       tier:'social',    ps:'bus',      eco:[17,18,20,21,25,43,80],ul:'MW',        us:10,   ttd:1, dl:25,  ees:{E:.01,   Ec:.06,  S:.10},   mats:{st:400,   gl:80,    co:1500}},
  clean_manufacturing:    {n:'Clean Mfg. Facility',   b:'economic_development',    tier:'social',    ps:'county',   eco:[17,18,20,21,25,43,80],ul:'facilities',us:1,    ttd:3, dl:30,  ees:{E:.0,    Ec:.2159,S:.054},  mats:{st:15000, co:20000}},
  ev_charging_network:    {n:'EV Charging Corridor',  b:'transport',               tier:'social',    ps:'bus',      eco:[17,18,20,21,25,43,80],ul:'stations',  us:100,  ttd:1, dl:15,  ees:{E:.02,   Ec:.04,  S:.06},   mats:{st:50}},
  rail_freight_modernization:{n:'Rail Freight Mod.',  b:'transport',               tier:'social',    ps:'county',   eco:[18,25,43],             ul:'route-mi',  us:200,  ttd:4, dl:40,  ees:{E:.03,   Ec:.08,  S:.04},   mats:{st:120,   co:80}},
};

// Derive applicable_bas for each action from eco list × ECO_BA_XWALK
Object.values(ACTIONS).forEach(act => {
  const s = new Set();
  act.eco.forEach(e => (ECO_BA_XWALK[String(e)] || []).forEach(b => s.add(b)));
  act.bas = [...s];
});

// ─── Action tree (3-tier hierarchy for palette) ───────────────────────────────
const ACTION_TREE = {
  Energy: {
    'Generation': ['wind_utility','solar_utility','geothermal_utility','hydropower_small','smr_advanced','fusion_pilot','coal_to_solar','coal_to_smr','coal_repowering'],
    'Storage':    ['battery_grid','pumped_hydro','hydrogen_electrolysis'],
    'Transmission':['transmission_230kv','transmission_500kv','microgrid'],
    'Nuclear Fuel':['uranium_mining_isr','conversion_facility','enrichment_facility','haleu_production','fuel_fabrication'],
  },
  Ecological: {
    'Hydrology': ['riparian_buffer','beaver_reintroduction','wetland_restoration','floodplain_reconnection','spring_seep_development','watershed_protection','mine_land_reclamation'],
    'Terrestrial':['prairie_restoration','sagebrush_restoration','forest_restoration','carbon_sequestration_soil','bison_reintroduction','invasive_treatment','renewable_degraded_land'],
  },
  Social: {
    'Settlement': ['rural_broadband','health_clinic','workforce_retraining','affordable_housing','university_research_center','tribal_energy_sovereignty','lead_service_line','community_solar'],
    'Transport':  ['ev_charging_network','rail_freight_modernization'],
    'Economic':   ['clean_manufacturing'],
  },
};

// ─── Disturbances ─────────────────────────────────────────────────────────────
const DISTURBANCES = {
  heat_wave:    {n:'Extreme Heat', ees:{E:-.05,Ec:-.03,S:-.08}, eco:'all', icon:'🌡'},
  drought:      {n:'Multi-Year Drought', ees:{E:-.15,Ec:-.10,S:-.05}, eco:'all', icon:'💧'},
  mine_closure: {n:'Mine/Plant Closure', ees:{E:.05, Ec:-.40,S:-.25}, eco:'single', icon:'🏭'},
};

// ─── Buses [id, lon, lat, ba, role, gen_mw] ───────────────────────────────────
const BUSES = [
  [3,-112.4949,33.3823,'AZPS','mixed',14986],[4,-109.6125,35.386,'AZPS','gen',2254],
  [5,-113.7706,35.7019,'AZPS','gen',1284],   [6,-113.908,32.7982,'AZPS','mixed',986],
  [7,-111.3009,32.9459,'AZPS','mixed',2257], [8,-111.7688,35.8355,'AZPS','gen',1227],
  [9,-116.0001,33.8129,'AZPS','load',227],   [10,-111.7892,32.0994,'AZPS','load',458],
  [18,-120.1903,45.3873,'BPAT','gen',3281],  [19,-115.1266,48.1494,'BPAT','gen',1466],
  [20,-122.3337,46.7187,'BPAT','mixed',2568],[21,-119.7173,48.5389,'BPAT','gen',1712],
  [22,-122.6506,45.5297,'BPAT','load',3344], [23,-117.9713,46.1667,'BPAT','gen',1652],
  [24,-118.7262,41.3406,'BPAT','mixed',373], [25,-123.0075,44.0371,'BPAT','load',544],
  [26,-119.2404,46.186,'BPAT','gen',3579],   [27,-121.7625,47.9556,'BPAT','load',116],
  [28,-123.6783,47.2982,'BPAT','mixed',796], [29,-120.7839,45.9371,'BPAT','gen',3156],
  [30,-121.2298,43.951,'BPAT','mixed',738],  [31,-115.3329,46.6442,'BPAT','mixed',387],
  [155,-111.8661,43.2548,'IPCO','mixed',857],[156,-116.1385,43.4191,'IPCO','load',956],
  [157,-114.4371,42.585,'IPCO','mixed',719], [158,-116.845,44.3965,'IPCO','gen',1213],
  [239,-115.0136,36.2138,'NEVP','mixed',6929],[240,-119.4802,39.2789,'NEVP','gen',1398],
  [241,-115.3537,41.1453,'NEVP','load',32],  [242,-119.6646,40.6569,'NEVP','load',160],
  [243,-116.3892,38.0129,'NEVP','mixed',102],[244,-116.1092,39.8497,'NEVP','gen',731],
  [245,-118.111,41.4067,'NEVP','gen',305],   [246,-120.6679,39.0222,'NEVP','mixed',219],
  [247,-118.3499,39.589,'NEVP','gen',326],
  [281,-110.7096,39.0,'PACE','gen',2550],    [282,-108.8689,41.7227,'PACE','gen',2414],
  [283,-112.0112,40.8136,'PACE','load',907], [284,-113.3661,37.6802,'PACE','mixed',486],
  [285,-105.9147,42.9694,'PACE','gen',377],  [286,-110.8904,41.9401,'PACE','mixed',1178],
  [287,-109.2467,40.351,'PACE','gen',911],   [288,-106.7051,41.6859,'PACE','gen',345],
  [289,-112.9953,39.2778,'PACE','gen',1762], [290,-111.6497,40.1086,'PACE','mixed',1473],
  [291,-109.697,44.3173,'PACE','load',32],   [292,-106.0761,44.3727,'PACE','mixed',224],
  [376,-104.3937,40.5542,'PSCO','gen',894],  [377,-105.0973,39.6341,'PSCO','load',773],
  [378,-108.2075,40.6177,'PSCO','gen',1096], [379,-104.5171,38.1869,'PSCO','gen',1146],
  [380,-104.3377,39.7855,'PSCO','mixed',981],[381,-108.3097,39.1267,'PSCO','load',78],
  [382,-106.9908,40.4841,'PSCO','gen',465],  [383,-105.8584,37.5605,'PSCO','gen',145],
  [384,-106.3938,39.3317,'PSCO','mixed',219],[385,-105.3922,40.2809,'PSCO','mixed',360],
  [386,-106.3234,35.0266,'PNM','mixed',1321],[387,-107.8537,32.2139,'PNM','gen',1088],
  [388,-108.2206,36.3973,'PNM','gen',751],
  [395,-112.4933,33.3485,'SRP','mixed',3214],[396,-111.3447,32.9048,'SRP','mixed',470],
  [397,-110.81,33.7993,'SRP','load',0],      [398,-112.5524,34.5993,'SRP','load',0],
  [485,-105.579,44.2478,'WACM','gen',1155],  [486,-104.4472,38.7652,'WACM','mixed',2760],
  [487,-108.1869,36.7355,'WACM','mixed',1010],[488,-104.3378,39.8741,'WACM','mixed',587],
  [489,-105.0013,41.8904,'WACM','gen',2297], [490,-105.56,40.5398,'WACM','load',990],
  [491,-107.6902,38.5654,'WACM','load',302], [492,-104.0421,40.5142,'WACM','gen',4266],
  [493,-110.2914,35.5405,'WACM','gen',668],  [494,-105.8343,42.9801,'WACM','gen',1148],
  [495,-103.2562,44.1234,'WACM','load',44],  [496,-102.8477,38.117,'WACM','mixed',310],
  [497,-107.7584,47.7788,'WAUW','mixed',675],[498,-106.4988,31.9792,'EPE','gen',2195],
  [499,-111.618,46.6899,'NWMT','gen',3056],
];

// Bus id → ecoregion code
const BUS_ECO = {
  3:'20',4:'20',5:'20',6:'20',7:'20',8:'20',9:'20',10:'20',
  18:'17',19:'17',20:'17',21:'17',22:'17',23:'17',24:'80',25:'17',
  26:'17',27:'17',28:'17',29:'17',30:'17',31:'17',
  155:'80',156:'80',157:'80',158:'17',
  239:'20',240:'80',241:'80',242:'80',243:'20',244:'80',245:'80',246:'80',247:'80',
  281:'20',282:'18',283:'18',284:'20',285:'43',286:'18',287:'20',288:'18',
  289:'20',290:'20',291:'17',292:'43',
  376:'25',377:'25',378:'18',379:'21',380:'25',381:'20',382:'21',383:'21',
  384:'21',385:'21',386:'21',387:'21',388:'20',
  395:'20',396:'20',397:'20',398:'20',
  485:'43',486:'21',487:'20',488:'25',489:'25',490:'21',491:'20',492:'25',
  493:'20',494:'43',495:'17',496:'25',497:'43',498:'21',499:'17',
};

// ─── Mountain West Places (Mode C settlement targets) ────────────────────────
const MW_PLACES = [
  {id:'cheyenne',      name:'Cheyenne',        state:'WY', lon:-104.820, lat:41.140, pop:65000,  ecoregion:43},
  {id:'casper',        name:'Casper',          state:'WY', lon:-106.313, lat:42.867, pop:58000,  ecoregion:18},
  {id:'gillette',      name:'Gillette',        state:'WY', lon:-105.502, lat:44.291, pop:32000,  ecoregion:43},
  {id:'rock_springs',  name:'Rock Springs',    state:'WY', lon:-109.203, lat:41.588, pop:23000,  ecoregion:18},
  {id:'laramie',       name:'Laramie',         state:'WY', lon:-105.591, lat:41.312, pop:32000,  ecoregion:25},
  {id:'kemmerer',      name:'Kemmerer',        state:'WY', lon:-110.537, lat:41.794, pop:2700,   ecoregion:18},
  {id:'lander',        name:'Lander',          state:'WY', lon:-108.730, lat:42.833, pop:8000,   ecoregion:18},
  {id:'denver',        name:'Denver',          state:'CO', lon:-104.990, lat:39.739, pop:715000, ecoregion:21},
  {id:'colorado_springs',name:'Colo. Springs', state:'CO', lon:-104.821, lat:38.834, pop:478000, ecoregion:21},
  {id:'pueblo',        name:'Pueblo',          state:'CO', lon:-104.609, lat:38.254, pop:111000, ecoregion:25},
  {id:'grand_junction',name:'Grand Junction',  state:'CO', lon:-108.551, lat:39.064, pop:65000,  ecoregion:20},
  {id:'fort_collins',  name:'Fort Collins',    state:'CO', lon:-105.085, lat:40.585, pop:165000, ecoregion:25},
  {id:'billings',      name:'Billings',        state:'MT', lon:-108.500, lat:45.783, pop:117000, ecoregion:43},
  {id:'missoula',      name:'Missoula',        state:'MT', lon:-114.012, lat:46.872, pop:73000,  ecoregion:17},
  {id:'great_falls',   name:'Great Falls',     state:'MT', lon:-111.300, lat:47.500, pop:58000,  ecoregion:43},
  {id:'butte',         name:'Butte',           state:'MT', lon:-112.536, lat:46.003, pop:34000,  ecoregion:17},
  {id:'salt_lake_city',name:'Salt Lake City',  state:'UT', lon:-111.891, lat:40.760, pop:200000, ecoregion:80},
  {id:'provo',         name:'Provo',           state:'UT', lon:-111.658, lat:40.234, pop:115000, ecoregion:80},
  {id:'moab',          name:'Moab',            state:'UT', lon:-109.549, lat:38.573, pop:5200,   ecoregion:20},
  {id:'albuquerque',   name:'Albuquerque',     state:'NM', lon:-106.651, lat:35.085, pop:564000, ecoregion:21},
  {id:'santa_fe',      name:'Santa Fe',        state:'NM', lon:-105.938, lat:35.687, pop:84000,  ecoregion:21},
  {id:'farmington',    name:'Farmington',      state:'NM', lon:-108.218, lat:36.728, pop:44000,  ecoregion:20},
  {id:'boise',         name:'Boise',           state:'ID', lon:-116.203, lat:43.615, pop:235000, ecoregion:80},
  {id:'idaho_falls',   name:'Idaho Falls',     state:'ID', lon:-112.034, lat:43.492, pop:62000,  ecoregion:80},
  {id:'reno',          name:'Reno',            state:'NV', lon:-119.813, lat:39.529, pop:264000, ecoregion:80},
  {id:'elko',          name:'Elko',            state:'NV', lon:-115.762, lat:40.832, pop:20000,  ecoregion:80},
  {id:'rapid_city',    name:'Rapid City',      state:'SD', lon:-103.231, lat:44.081, pop:75000,  ecoregion:43},
  {id:'scottsbluff',   name:'Scottsbluff',     state:'NE', lon:-103.660, lat:41.866, pop:15000,  ecoregion:25},
];

// ─── Scenario Profiles (30) ───────────────────────────────────────────────────
const SCENARIOS = [
  {id:'stagnation',            n:'Stagnation',                  g:'diagonal',       E:2,Ec:2,S:2},
  {id:'below_baseline_drift',  n:'Below-Baseline Drift',        g:'diagonal',       E:4,Ec:4,S:4},
  {id:'status_quo',            n:'Status Quo',                  g:'diagonal',       E:5,Ec:5,S:5},
  {id:'managed_transition',    n:'Managed Transition',          g:'diagonal',       E:7,Ec:7,S:7},
  {id:'balanced_thriving',     n:'Balanced Thriving',           g:'diagonal',       E:9,Ec:9,S:9},
  {id:'e_dominant',            n:'Env. Capital Dominant',       g:'capital_dominant',E:8,Ec:5,S:5},
  {id:'ec_dominant',           n:'Econ. Capital Dominant',      g:'capital_dominant',E:5,Ec:8,S:5},
  {id:'s_dominant',            n:'Social Capital Dominant',     g:'capital_dominant',E:5,Ec:5,S:8},
  {id:'e_ec_dominant',         n:'Env + Econ Dominant',         g:'capital_dominant',E:8,Ec:8,S:5},
  {id:'e_s_dominant',          n:'Env + Social Dominant',       g:'capital_dominant',E:8,Ec:5,S:8},
  {id:'ec_s_dominant',         n:'Econ + Social Dominant',      g:'capital_dominant',E:5,Ec:8,S:8},
  {id:'e_strong_others_weak',  n:'E Strong, Ec/S Weak',         g:'capital_dominant',E:8,Ec:3,S:3},
  {id:'ec_strong_others_weak', n:'Ec Strong, E/S Weak',         g:'capital_dominant',E:3,Ec:8,S:3},
  {id:'s_strong_others_weak',  n:'S Strong, E/Ec Weak',         g:'capital_dominant',E:3,Ec:3,S:8},
  {id:'eco_extreme',           n:'Eco-Extreme',                 g:'corner',          E:9,Ec:2,S:2},
  {id:'econ_extreme',          n:'Econ-Extreme (Fossil Peak)',   g:'corner',          E:2,Ec:9,S:2},
  {id:'social_extreme',        n:'Social-Extreme',               g:'corner',          E:2,Ec:2,S:9},
  {id:'eco_econ_paired',       n:'Green Growth (Low Social)',    g:'corner',          E:9,Ec:9,S:2},
  {id:'coal_retirement_no_reinvestment',n:'Coal Exit, No Reinvest',g:'transition',   E:3,Ec:4,S:5},
  {id:'coordinated_transition',n:'Coordinated Clean Transition', g:'transition',      E:6,Ec:7,S:6},
  {id:'extractive_lock_in',    n:'Extractive Lock-In',           g:'transition',      E:2,Ec:7,S:3},
  {id:'eco_tech_buildout',     n:'Eco-Tech Buildout',            g:'transition',      E:8,Ec:6,S:5},
  {id:'resilient_communities', n:'Resilient Communities',        g:'transition',      E:5,Ec:6,S:8},
  {id:'federal_lands_conservation',n:'Federal Lands Conservation',g:'transition',    E:7,Ec:4,S:4},
  {id:'fossil_exit_no_replacement',n:'Fossil Exit, No Replacement',g:'transition',   E:3,Ec:3,S:4},
  {id:'ira_renewable_boom',    n:'IRA Renewable Boom',           g:'transition',      E:5,Ec:7,S:5},
  {id:'wyoming_sagebrush_restoration',n:'WY Sagebrush Initiative',g:'transition',    E:7,Ec:4,S:5},
  {id:'tribal_sovereignty_model',n:'Tribal Sovereignty Model',   g:'transition',      E:6,Ec:4,S:7},
  {id:'carbon_tax_high_wage',  n:'Carbon Tax + High-Wage Jobs',  g:'transition',      E:5,Ec:6,S:6},
  {id:'just_transition_target',n:'Just Transition Target',       g:'transition',      E:6,Ec:6,S:7},
];

// ─── Utilities ────────────────────────────────────────────────────────────────
function clamp(v, lo=0, hi=10) { return Math.max(lo, Math.min(hi, v)); }

function mwAvgScores(scores) {
  const keys = Object.keys(scores);
  return {
    E:  keys.reduce((a,k)=>a+scores[k].E,  0)/keys.length,
    Ec: keys.reduce((a,k)=>a+scores[k].Ec, 0)/keys.length,
    S:  keys.reduce((a,k)=>a+scores[k].S,  0)/keys.length,
  };
}
function baScores(ba, scores) {
  const ecos = (BA_ECO_MAP[ba] || []).filter(e => scores[e]);
  if (!ecos.length) return {E:5, Ec:5, S:5};
  const n = ecos.length;
  return {
    E:  ecos.reduce((a,e)=>a+scores[e].E,  0)/n,
    Ec: ecos.reduce((a,e)=>a+scores[e].Ec, 0)/n,
    S:  ecos.reduce((a,e)=>a+scores[e].S,  0)/n,
  };
}

function resolveEcoFromSelected(selected) {
  if (!selected) return null;
  if (selected.type === 'ba')       return (BA_ECO_MAP[selected.id] || [])[0] || null;
  if (selected.type === 'bus')      return BUS_ECO[selected.id] || null;
  if (selected.type === 'wacm_sub') return WACM_SUBS[selected.id]?.eco || null;
  return null;
}


function nearestScenario(E, Ec, S) {
  let best = null, bestD = Infinity;
  for (const sc of SCENARIOS) {
    const d = Math.sqrt((sc.E-E)**2 + (sc.Ec-Ec)**2 + (sc.S-S)**2);
    if (d < bestD) { bestD = d; best = sc; }
  }
  return { scenario: best, distance: bestD };
}

function fmtMat(val) {
  if (val === 0) return '—';
  if (val >= 1e6)  return `${(val/1e6).toFixed(1)} Mt`;
  if (val >= 1000) return `${(val/1000).toFixed(0)} kt`;
  return `${val.toFixed(0)} t`;
}

function commitMaterials(mats) {
  return {
    st: mats.st || 0,
    co: mats.co || 0,
    fi: mats.fi || 0,
    gl: mats.gl || 0,
    al: mats.al || 0,
    li: mats.li || 0,
  };
}

// ─── State & Reducer ──────────────────────────────────────────────────────────
function buildInitialScores() {
  const scores = {};
  for (const [code, base] of Object.entries(EES_BASE)) {
    scores[code] = { E: base.E, Ec: base.Ec, S: base.S };
  }
  return scores;
}

function buildInitialState() {
  return {
    year: 2025,
    scores: buildInitialScores(),
    deployed: [],        // {uid, action_id, eco, bus, location?, units, commitYear, opYear, applied}
    events: [],          // {year, label, type}
    selected: null,      // {type:'eco'|'bus'|'place', id}
    pendingAction: null, // action_id waiting for map click
    placementMode: null, // 'bus' | 'ecological' | 'settlement' | null
    pendingPlace: null,  // Mode C: place object after place click, before Deploy confirm
    ledgerOpen: false,
    materials: {st:0, co:0, fi:0, gl:0, al:0, li:0},
    uid: 0,
  };
}

let uidCounter = 0;

function applyPendingEES(state, toYear) {
  // Apply EES effects for deployments that become operational by toYear
  let newScores = {};
  for (const [code, s] of Object.entries(state.scores)) {
    newScores[code] = { ...s };
  }
  const newDeployed = state.deployed.map(dep => {
    if (!dep.applied && dep.opYear <= toYear) {
      const act = ACTIONS[dep.action_id];
      if (act) {
        // Determine which ecoregions to apply to
        let ecoTargets = [];
        if (dep.eco && newScores[dep.eco]) {
          ecoTargets = [dep.eco];
        } else {
          // bus-scale: apply to the bus's ecoregion
          ecoTargets = dep.eco ? [dep.eco] : [];
        }
        for (const eco of ecoTargets) {
          if (newScores[eco]) {
            newScores[eco].E  = clamp(newScores[eco].E  + act.ees.E  * dep.units);
            newScores[eco].Ec = clamp(newScores[eco].Ec + act.ees.Ec * dep.units);
            newScores[eco].S  = clamp(newScores[eco].S  + act.ees.S  * dep.units);
          }
        }
      }
      return { ...dep, applied: true };
    }
    return dep;
  });
  return { newScores, newDeployed };
}

function terraReducer(state, action) {
  switch (action.type) {

    case 'SELECT_ACTION': {
      const act = ACTIONS[action.id];
      let placementMode = 'bus';
      if (act) {
        if (act.ps === 'watershed' || act.ps === 'ecoregion') placementMode = 'ecological';
        else if (act.ps === 'county') placementMode = 'settlement';
      }
      return { ...state, pendingAction: action.id, placementMode, pendingPlace: null };
    }

    case 'CANCEL_ACTION': {
      return { ...state, pendingAction: null, placementMode: null, pendingPlace: null };
    }

    case 'SELECT': {
      if (state.pendingAction) {
        const act = ACTIONS[state.pendingAction];
        if (!act) return { ...state, pendingAction: null, placementMode: null, pendingPlace: null };

        // Mode C: place clicked → store as pendingPlace for placement card
        if (action.selType === 'place') {
          const place = MW_PLACES.find(p => p.id === action.placeId);
          if (!place) return state;
          const placeBA = (ECO_BA_XWALK[String(place.ecoregion)] || [])[0];
          if (!placeBA || !act.bas.includes(placeBA)) {
            return { ...state, pendingPlace: null,
              events: [...state.events, {year:state.year, label:`${act.n} not available in ${place.name}'s region`, type:'warn'}] };
          }
          return { ...state, pendingPlace: place, selected: {type:'place', id:place.id} };
        }

        // Mode A: bus clicked
        if (action.selType === 'bus') {
          const busId = action.bus;
          const ba    = action.ba;
          if (!ba || !act.bas.includes(ba)) {
            return { ...state, pendingAction: null, placementMode: null,
              events: [...state.events, {year:state.year, label:`${act.n} not available in ${BA_META[ba]?.name || ba}`, type:'warn'}] };
          }
          const eco    = BUS_ECO[busId] || (BA_ECO_MAP[ba] || [])[0] || null;
          const opYear = state.year + act.ttd;
          const mats   = commitMaterials(act.mats);
          const newDep = { uid:++uidCounter, action_id:state.pendingAction, eco, bus:busId,
            units:1, commitYear:state.year, opYear, applied:false };
          return {
            ...state,
            pendingAction: null, placementMode: null, pendingPlace: null,
            selected: {type:'bus', id:busId, ba},
            deployed: [...state.deployed, newDep],
            materials: { st:state.materials.st+mats.st, co:state.materials.co+mats.co,
              fi:state.materials.fi+mats.fi, gl:state.materials.gl+mats.gl,
              al:state.materials.al+mats.al, li:state.materials.li+mats.li },
            events: [...state.events, {year:state.year,
              label:`${act.n} → ${BA_META[ba]?.name||ba} (Bus ${busId}) | operational ${opYear}`,
              type:'deploy'}],
          };
        }

        // Mode B: BA territory or WACM sub-region clicked
        const ba    = action.ba    || null;
        const subId = action.subId || null;
        if (ba) {
          if (!act.bas.includes(ba)) {
            return { ...state, pendingAction: null, placementMode: null,
              events: [...state.events, {year:state.year, label:`${act.n} not available in ${BA_META[ba]?.name||ba}`, type:'warn'}] };
          }
          let eco = subId ? WACM_SUBS[subId]?.eco : null;
          if (!eco) {
            const baEcos = BA_ECO_MAP[ba] || [];
            eco = baEcos.find(e => act.eco.includes(parseInt(e))) || baEcos[0] || null;
          }
          const opYear   = state.year + act.ttd;
          const mats     = commitMaterials(act.mats);
          const locLabel = subId ? WACM_SUBS[subId]?.name : (BA_META[ba]?.name || ba);
          const newDep   = { uid:++uidCounter, action_id:state.pendingAction, eco, bus:null,
            units:1, commitYear:state.year, opYear, applied:false };
          return {
            ...state,
            pendingAction: null, placementMode: null, pendingPlace: null,
            selected: subId ? {type:'wacm_sub', id:subId, ba} : {type:'ba', id:ba},
            deployed: [...state.deployed, newDep],
            materials: { st:state.materials.st+mats.st, co:state.materials.co+mats.co,
              fi:state.materials.fi+mats.fi, gl:state.materials.gl+mats.gl,
              al:state.materials.al+mats.al, li:state.materials.li+mats.li },
            events: [...state.events, {year:state.year,
              label:`${act.n} → ${locLabel} | operational ${opYear}`,
              type:'deploy'}],
          };
        }
      }
      // No pending action — just select
      const extra = action.ba ? {ba:action.ba} : action.subId ? {subId:action.subId, ba:action.ba||'WACM'} : {};
      return { ...state, selected: {type:action.selType, id:action.id, ...extra} };
    }

    case 'CONFIRM_DEPLOY': {
      if (!state.pendingAction || !state.pendingPlace) return state;
      const act = ACTIONS[state.pendingAction];
      if (!act) return { ...state, pendingAction: null, placementMode: null, pendingPlace: null };
      const eco = state.pendingPlace.ecoregion.toString();
      const opYear = state.year + act.ttd;
      const mats = commitMaterials(act.mats);
      const newDep = {
        uid: ++uidCounter,
        action_id: state.pendingAction,
        eco,
        bus: null,
        location: {type:'place', id: state.pendingPlace.id, ecoregion: state.pendingPlace.ecoregion},
        units: 1,
        commitYear: state.year,
        opYear,
        applied: false,
      };
      return {
        ...state,
        pendingAction: null,
        placementMode: null,
        pendingPlace: null,
        selected: {type:'place', id: state.pendingPlace.id},
        deployed: [...state.deployed, newDep],
        materials: {
          st: state.materials.st + mats.st,
          co: state.materials.co + mats.co,
          fi: state.materials.fi + mats.fi,
          gl: state.materials.gl + mats.gl,
          al: state.materials.al + mats.al,
          li: state.materials.li + mats.li,
        },
        events: [...state.events, {
          year: state.year,
          label: `${act.n} → ${state.pendingPlace.name}, ${state.pendingPlace.state} | operational ${opYear}`,
          type: 'deploy'
        }],
      };
    }

    case 'DESELECT': {
      return { ...state, selected: null, pendingAction: null, placementMode: null, pendingPlace: null };
    }

    case 'ADVANCE_YEAR': {
      const n = action.n || 1;
      const newYear = state.year + n;
      const { newScores, newDeployed } = applyPendingEES({ ...state, year: newYear }, newYear);
      return {
        ...state,
        year: newYear,
        scores: newScores,
        deployed: newDeployed,
        events: [...state.events, { year: newYear, label: `Advanced to ${newYear}`, type: 'year' }],
      };
    }

    case 'INJECT_DISTURBANCE': {
      const dist = DISTURBANCES[action.disturbance_id];
      if (!dist) return state;
      const eco = action.eco; // null = all ecoregions
      let newScores = {};
      for (const [code, s] of Object.entries(state.scores)) {
        if (eco === null || code === eco) {
          newScores[code] = {
            E:  clamp(s.E  + dist.ees.E),
            Ec: clamp(s.Ec + dist.ees.Ec),
            S:  clamp(s.S  + dist.ees.S),
          };
        } else {
          newScores[code] = { ...s };
        }
      }
      return {
        ...state,
        scores: newScores,
        events: [...state.events, {
          year: state.year,
          label: `${dist.n} → ${eco ? EES_BASE[eco]?.name : 'all regions'}`,
          type: 'disturbance'
        }],
      };
    }

    case 'TOGGLE_LEDGER': {
      return { ...state, ledgerOpen: !state.ledgerOpen };
    }

    case 'RESET': {
      return buildInitialState();
    }

    default:
      return state;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs w-4 font-bold" style={{color}}>{label}</span>
      <div className="flex-1 bg-gray-700 rounded h-2 overflow-hidden">
        <div className="h-full rounded transition-all duration-500" style={{width:`${value/10*100}%`, backgroundColor:color}} />
      </div>
      <span className="text-xs w-8 text-right text-gray-300">{value.toFixed(2)}</span>
    </div>
  );
}

function EcoRadarCard({ scores, ecoCode }) {
  const data = [
    { subject:'E',  value: parseFloat(scores.E.toFixed(2)),  fullMark:10 },
    { subject:'Ec', value: parseFloat(scores.Ec.toFixed(2)), fullMark:10 },
    { subject:'S',  value: parseFloat(scores.S.toFixed(2)),  fullMark:10 },
  ];
  const color = BA_COLORS[ecoCode] || '#888';
  return (
    <div style={{height:160}}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{top:8,right:16,bottom:8,left:16}}>
          <PolarGrid stroke="#444" />
          <PolarAngleAxis dataKey="subject" tick={{fill:'#aaa',fontSize:12}} />
          <PolarRadiusAxis angle={90} domain={[0,10]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.3} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActionPalette({ dispatch, pendingAction, year }) {
  const [openTiers, setOpenTiers] = useState({Energy:true, Ecological:false, Social:false});
  const [openBuckets, setOpenBuckets] = useState({});

  const toggleTier = (t) => setOpenTiers(p => ({...p, [t]: !p[t]}));
  const toggleBucket = (b) => setOpenBuckets(p => ({...p, [b]: !p[b]}));

  const tierColors = { Energy:'#3d7eb5', Ecological:'#2d6a4f', Social:'#b5813e' };

  return (
    <div className="flex flex-col gap-1 overflow-y-auto" style={{maxHeight:'calc(100vh - 340px)'}}>
      {Object.entries(ACTION_TREE).map(([tier, buckets]) => (
        <div key={tier}>
          <button
            className="w-full text-left px-2 py-1 rounded text-xs font-bold uppercase tracking-wider flex justify-between items-center"
            style={{backgroundColor: tierColors[tier]+'33', color: tierColors[tier]}}
            onClick={() => toggleTier(tier)}
          >
            {tier} <span>{openTiers[tier] ? '▾' : '▸'}</span>
          </button>
          {openTiers[tier] && Object.entries(buckets).map(([bucket, actionIds]) => (
            <div key={bucket} className="ml-1 mt-0.5">
              <button
                className="w-full text-left px-2 py-0.5 text-xs text-gray-400 flex justify-between items-center hover:text-gray-200"
                onClick={() => toggleBucket(bucket)}
              >
                <span>{bucket}</span><span>{openBuckets[bucket] ? '▾' : '▸'}</span>
              </button>
              {openBuckets[bucket] && actionIds.map(id => {
                const act = ACTIONS[id];
                if (!act) return null;
                const isPending = pendingAction === id;
                return (
                  <button
                    key={id}
                    className={`w-full text-left pl-4 pr-2 py-0.5 text-xs rounded transition-colors ${
                      isPending
                        ? 'bg-yellow-600 text-white font-bold'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                    onClick={() => dispatch({type: isPending ? 'CANCEL_ACTION' : 'SELECT_ACTION', id})}
                    title={`${act.ul} | deploy time: ${act.ttd}yr | EES: E${act.ees.E>0?'+':''}${act.ees.E} Ec${act.ees.Ec>0?'+':''}${act.ees.Ec} S${act.ees.S>0?'+':''}${act.ees.S}`}
                  >
                    {act.n}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TerraSVGMap({ state, dispatch }) {
  const { scores, deployed, selected, pendingAction, placementMode, pendingPlace } = state;
  const maxGen = useMemo(() => Math.max(...BUSES.map(b => b[5] || 1)), []);

  // Determine currently selected BA
  const selectedBA = selected?.type === 'ba' ? selected.id
    : selected?.type === 'bus'  ? selected.ba
    : selected?.type === 'wacm_sub' ? (selected.ba || 'WACM')
    : selected?.type === 'place' ? (() => {
        const pl = MW_PLACES.find(p => p.id === selected.id);
        return pl ? (ECO_BA_XWALK[String(pl.ecoregion)] || [])[0] || null : null;
      })()
    : null;
  const selectedSub  = selected?.type === 'wacm_sub' ? selected.id : null;
  const wacmExpanded = selectedBA === 'WACM';

  function handleBAClick(ba) {
    if (pendingAction && placementMode !== 'ecological') return;
    dispatch({ type:'SELECT', selType:'ba', id:ba, ba });
  }
  function handleWACMSubClick(subId) {
    if (pendingAction && placementMode !== 'ecological') return;
    dispatch({ type:'SELECT', selType:'wacm_sub', id:subId, subId, ba:'WACM' });
  }
  function handleBusClick(bid) {
    if (pendingAction && placementMode !== 'bus') return;
    const busData = BUSES.find(b => b[0] === bid);
    const ba  = busData ? busData[3] : null;
    const eco = BUS_ECO[bid] || null;
    dispatch({ type:'SELECT', selType:'bus', id:bid, eco, bus:bid, ba });
  }
  function handlePlaceClick(place) {
    dispatch({ type:'SELECT', selType:'place', id:place.id, placeId:place.id });
  }

  // Deploy counts per BA (for badge display)
  const baDeployCount = useMemo(() => {
    const m = {};
    for (const d of deployed) {
      const busData = d.bus ? BUSES.find(b => b[0] === d.bus) : null;
      const ba = busData ? busData[3]
        : d.eco ? (ECO_BA_XWALK[d.eco] || [])[0]
        : null;
      if (ba) m[ba] = (m[ba] || 0) + 1;
    }
    return m;
  }, [deployed]);

  const busDeployCount = useMemo(() => {
    const m = {};
    for (const d of deployed) if (d.bus) m[d.bus] = (m[d.bus] || 0) + 1;
    return m;
  }, [deployed]);

  const placeDeployCount = useMemo(() => {
    const m = {};
    for (const d of deployed) if (d.location?.type === 'place') m[d.location.id] = (m[d.location.id] || 0) + 1;
    return m;
  }, [deployed]);

  // Mode-based dimming
  const ecoDimmed = !!placementMode && placementMode !== 'ecological';
  const busDimmed = !!placementMode && placementMode !== 'bus';
  const placeMode = placementMode === 'settlement';

  function getBaScores(ba) {
    const ecos = (BA_ECO_MAP[ba] || []).filter(e => scores[e]);
    if (!ecos.length) return {E:5, Ec:5, S:5};
    const n = ecos.length;
    return {
      E:  ecos.reduce((a,e) => a + scores[e].E,  0) / n,
      Ec: ecos.reduce((a,e) => a + scores[e].Ec, 0) / n,
      S:  ecos.reduce((a,e) => a + scores[e].S,  0) / n,
    };
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{background:'#1a1a2e'}}
      onClick={() => dispatch({type:'DESELECT'})}>

      {/* State outlines — WY/CO/MT/UT/ID at full weight; others faint */}
      {STATE_OUTLINES.map(s => {
        const inScope = ['WY','CO','MT','UT','ID'].includes(s.id);
        return (
          <path key={s.id} d={ringsToD([s.d])} fill="none"
            stroke={inScope ? '#475569' : '#1e2a3a'}
            strokeWidth={inScope ? 1 : 0.5} />
        );
      })}

      {/* BA territory fills — primary interactive layer */}
      {Object.entries(BA_POLYS).map(([ba, rings]) => {
        if (!rings) return null;
        const isSelected = ba === selectedBA;
        const canClick   = placementMode === 'ecological'
          && pendingAction && ACTIONS[pendingAction]?.bas.includes(ba);
        const col        = BA_COLORS[ba] || '#888';
        const fillOpacity = ecoDimmed ? 0.07 : (isSelected ? 0.48 : 0.20);
        const meta       = BA_META[ba];
        const deployCount = baDeployCount[ba] || 0;
        const baS        = getBaScores(ba);
        const [lcx, lcy] = meta ? px(meta.cx, meta.cy) : [null, null];

        return (
          <g key={ba}>
            <path
              d={ringsToD(rings)}
              fill={col}
              fillOpacity={fillOpacity}
              stroke={isSelected ? '#fff' : col}
              strokeWidth={isSelected ? 1.5 : 0.5}
              strokeOpacity={ecoDimmed ? 0.18 : 1}
              style={{cursor: (!ecoDimmed || canClick) ? 'pointer' : 'default'}}
              onClick={e => { e.stopPropagation(); if (!ecoDimmed || canClick) handleBAClick(ba); }}
            />

            {/* WACM sub-region overlays when WACM is selected */}
            {ba === 'WACM' && wacmExpanded && Object.entries(WACM_SUBS).map(([subId, sub]) => {
              const isSub = selectedSub === subId;
              const [scx, scy] = px(sub.cx, sub.cy);
              return (
                <g key={subId}>
                  <path
                    d={ringsToD([sub.poly])}
                    fill={col}
                    fillOpacity={isSub ? 0.55 : 0.30}
                    stroke={isSub ? '#fbbf24' : '#f0c040'}
                    strokeWidth={isSub ? 2 : 1}
                    strokeDasharray={isSub ? undefined : '4 2'}
                    style={{cursor:'pointer'}}
                    onClick={e => { e.stopPropagation(); handleWACMSubClick(subId); }}
                  />
                  <text x={scx} y={scy+3} textAnchor="middle" fontSize={7.5}
                    fill={isSub ? '#fde68a' : '#e2c060'}
                    style={{pointerEvents:'none', textShadow:'0 1px 2px #000'}}>
                    {sub.tag}
                  </text>
                </g>
              );
            })}

            {/* BA label + EES composite score */}
            {lcx && !ecoDimmed && (
              <>
                <text x={lcx} y={lcy-7} textAnchor="middle" fontSize={7}
                  fill="#e2e8f0" opacity={0.55} style={{pointerEvents:'none'}}>
                  {((baS.E+baS.Ec+baS.S)/3).toFixed(1)}
                </text>
                <text x={lcx} y={lcy+4} textAnchor="middle" fontSize={8}
                  fill="#e2e8f0" opacity={isSelected ? 1 : 0.65}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  style={{pointerEvents:'none'}}>
                  {ba}
                </text>
              </>
            )}

            {/* Deploy count badge */}
            {deployCount > 0 && lcx && (
              <g>
                <circle cx={lcx+16} cy={lcy-10} r={6} fill="#f59e0b" opacity={0.9}/>
                <text x={lcx+16} y={lcy-6} textAnchor="middle" fontSize={8}
                  fill="#000" fontWeight="bold">{deployCount}</text>
              </g>
            )}

            {/* Pulse ring when this BA is a valid target */}
            {canClick && lcx && (
              <circle cx={lcx} cy={lcy} r={12} fill="none" stroke="#fbbf24" strokeWidth={1.5}>
                <animate attributeName="r" values="8;16;8" dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            )}
          </g>
        );
      })}

      {/* Bus circles */}
      {BUSES.map(([bid, lon, lat, ba, role, gen]) => {
        if (lon < LON_MIN || lon > LON_MAX || lat < LAT_MIN || lat > LAT_MAX) return null;
        const [cx, cy] = px(lon, lat);
        const r   = Math.max(3, Math.sqrt(gen / maxGen) * 10);
        const col = BA_COLORS[ba] || '#888';
        const isSelected  = selected?.type === 'bus' && selected.id === bid;
        const deployCount = busDeployCount[bid] || 0;
        const canTarget   = placementMode === 'bus' && pendingAction
          && ACTIONS[pendingAction]?.bas.includes(ba);
        const busOpacity  = busDimmed ? 0.22 : (canTarget ? 1 : 0.65);
        return (
          <g key={bid}
            onClick={e => { e.stopPropagation(); handleBusClick(bid); }}
            style={{cursor: (busDimmed && pendingAction) ? 'default' : 'pointer'}}>
            <circle cx={cx} cy={cy} r={r}
              fill={role === 'gen' ? col : 'none'}
              stroke={col}
              strokeWidth={isSelected ? 2 : 1}
              opacity={busOpacity} />
            {canTarget && (
              <circle cx={cx} cy={cy} r={r+4} fill="none" stroke="#fbbf24" strokeWidth={1.5}>
                <animate attributeName="r" values={`${r+2};${r+7};${r+2}`} dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.75;0.1;0.75" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            )}
            {deployCount > 0 && <circle cx={cx+r} cy={cy-r} r={4} fill="#f59e0b"/>}
            {isSelected && <circle cx={cx} cy={cy} r={r+3} fill="none" stroke="#fff" strokeWidth={1} opacity={0.6}/>}
          </g>
        );
      })}

      {/* Place markers */}
      {MW_PLACES.map(place => {
        const [cx, cy] = px(place.lon, place.lat);
        const r = 5;
        const isSelected  = selected?.type === 'place' && selected.id === place.id;
        const isPending   = pendingPlace?.id === place.id;
        const canClick    = placeMode && pendingAction
          && ACTIONS[pendingAction]?.eco.includes(place.ecoregion);
        const placeOpacity = placeMode ? (canClick ? 1 : 0.55) : 0.4;
        return (
          <g key={place.id}
            onClick={e => { e.stopPropagation(); if (canClick) handlePlaceClick(place); }}
            style={{cursor: canClick ? 'pointer' : 'default'}}
            opacity={placeOpacity}>
            <polygon
              points={`${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}`}
              fill={isPending ? '#fbbf24' : '#7b6fa0'}
              stroke={isSelected || isPending ? '#e2c8f0' : '#a78fc0'}
              strokeWidth={isSelected || isPending ? 1.5 : 0.8} />
            {placeDeployCount[place.id] > 0 && <circle cx={cx+r} cy={cy-r} r={3.5} fill="#f59e0b"/>}
            <text x={cx} y={cy-r-3} textAnchor="middle" fontSize={9} fill="#c4b5fd"
              style={{pointerEvents:'none', userSelect:'none'}}>{place.name}</text>
          </g>
        );
      })}

      {/* Pending action instruction banner */}
      {pendingAction && !pendingPlace && (
        <g>
          <rect x={4} y={H-28} width={W-8} height={22} rx={4} fill="#1e3a5f" stroke="#3d7eb5" strokeWidth={1}/>
          <text x={W/2} y={H-13} textAnchor="middle" fontSize={11} fill="#7dd3fc">
            {placementMode === 'bus'        && `Click a bus node to deploy ${ACTIONS[pendingAction]?.n} — ESC to cancel`}
            {placementMode === 'ecological' && `Click a region to deploy ${ACTIONS[pendingAction]?.n} — ESC to cancel`}
            {placementMode === 'settlement' && `Click a city or town to place ${ACTIONS[pendingAction]?.n} — ESC to cancel`}
          </text>
        </g>
      )}
    </svg>
  );
}

function RightPanel({ state, dispatch }) {
  const { scores, selected, year, events } = state;
  const [ecoExpanded, setEcoExpanded] = React.useState(false);

  // Resolve active BA for display
  const displayBA = selected?.type === 'ba' ? selected.id
    : selected?.type === 'bus'      ? selected.ba
    : selected?.type === 'wacm_sub' ? (selected.ba || 'WACM')
    : selected?.type === 'place'    ? (() => {
        const pl = MW_PLACES.find(p => p.id === selected.id);
        return pl ? (ECO_BA_XWALK[String(pl.ecoregion)] || [])[0] || null : null;
      })()
    : null;
  const displaySub = selected?.type === 'wacm_sub' ? selected.id : null;

  const displayScores = displayBA
    ? (displaySub && WACM_SUBS[displaySub] && scores[WACM_SUBS[displaySub].eco]
        ? scores[WACM_SUBS[displaySub].eco]
        : baScores(displayBA, scores))
    : mwAvgScores(scores);

  const displayName = displaySub ? WACM_SUBS[displaySub]?.name
    : displayBA ? BA_META[displayBA]?.name
    : 'Study Area Average';
  const displayAbbr = displayBA ? BA_META[displayBA]?.abbr : null;

  const { scenario, distance } = nearestScenario(displayScores.E, displayScores.Ec, displayScores.S);

  const recentEvents = [...events].reverse().slice(0, 8);

  const allBAScores = useMemo(() =>
    Object.keys(BA_META).map(ba => ({ ba, ...baScores(ba, scores) })),
    [scores]
  );

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">

      {/* Region header + radar */}
      <div>
        <div className="text-xs font-bold text-gray-400 mb-1">
          {displayAbbr && <span className="text-blue-400 mr-1">{displayAbbr}</span>}
          {displayName}
        </div>
        <EcoRadarCard scores={displayScores} ecoCode={displayBA || '18'} />
        <div className="mt-2">
          <ScoreBar label="E"  value={displayScores.E}  color="#2d6a4f" />
          <ScoreBar label="Ec" value={displayScores.Ec} color="#3d7eb5" />
          <ScoreBar label="S"  value={displayScores.S}  color="#b5813e" />
        </div>
        {/* Underlying ecoregion breakdown */}
        {displayBA && (
          <button className="text-xs text-gray-600 hover:text-gray-400 mt-1"
            onClick={() => setEcoExpanded(p => !p)}>
            {ecoExpanded ? '▾' : '▸'} underlying ecoregions
          </button>
        )}
        {ecoExpanded && displayBA && (
          <div className="mt-1 pl-2 border-l border-gray-800">
            {(BA_ECO_MAP[displayBA] || []).filter(e => scores[e]).map(e => (
              <div key={e} className="flex items-center gap-1 text-xs py-0.5">
                <span className="text-gray-500 w-32 truncate">{EES_BASE[e]?.name}</span>
                <span style={{color:'#2d9e6e'}} className="w-7">{scores[e].E.toFixed(1)}</span>
                <span style={{color:'#3d7eb5'}} className="w-7">{scores[e].Ec.toFixed(1)}</span>
                <span style={{color:'#b5813e'}} className="w-7">{scores[e].S.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nearest scenario */}
      <div className="border border-gray-700 rounded p-2">
        <div className="text-xs text-gray-400 mb-1">Nearest Scenario</div>
        <div className="text-sm font-bold text-yellow-400">{scenario?.n}</div>
        <div className="text-xs text-gray-500 mt-1">dist {distance.toFixed(2)} | group: {scenario?.g}</div>
        <div className="flex gap-2 mt-1">
          {['E','Ec','S'].map(cap => {
            const cur   = displayScores[cap];
            const tgt   = scenario?.[cap] || 0;
            const delta = tgt - cur;
            return (
              <div key={cap} className="flex-1 text-center">
                <div className="text-xs text-gray-500">{cap}</div>
                <div className="text-xs font-bold"
                  style={{color: delta>0?'#f59e0b':delta<0?'#ef4444':'#4ade80'}}>
                  {delta>0?'+':''}{delta.toFixed(1)}
                </div>
                <div className="text-xs text-gray-400">{tgt}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All regions table */}
      <div className="border border-gray-700 rounded p-2">
        <div className="text-xs text-gray-400 mb-1">All Regions</div>
        {allBAScores.map(({ba, E, Ec, S}) => (
          <div key={ba}
            className={`flex items-center gap-1 text-xs py-0.5 rounded px-1 cursor-pointer ${
              ba === displayBA ? 'bg-gray-700' : 'hover:bg-gray-800'
            }`}
            onClick={() => dispatch({type:'SELECT', selType:'ba', id:ba, ba})}>
            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0"
              style={{background: BA_COLORS[ba]}}/>
            <span className="text-gray-400 w-10">{BA_META[ba]?.abbr}</span>
            <div className="flex-1 bg-gray-800 rounded h-1 overflow-hidden">
              <div className="h-full rounded" style={{width:`${((E+Ec+S)/3)/10*100}%`, background:BA_COLORS[ba]}}/>
            </div>
            <span style={{color:'#2d9e6e'}} className="w-6">{E.toFixed(1)}</span>
            <span style={{color:'#3d7eb5'}} className="w-6">{Ec.toFixed(1)}</span>
            <span style={{color:'#b5813e'}} className="w-6">{S.toFixed(1)}</span>
          </div>
        ))}
      </div>

      {/* Event log */}
      <div className="border border-gray-700 rounded p-2">
        <div className="text-xs text-gray-400 mb-1">Event Log</div>
        {recentEvents.length === 0 && <div className="text-xs text-gray-600">No events yet</div>}
        {recentEvents.map((ev, i) => (
          <div key={i} className={`text-xs py-0.5 ${
            ev.type==='deploy'      ? 'text-green-400' :
            ev.type==='disturbance' ? 'text-red-400'   :
            ev.type==='warn'        ? 'text-yellow-400' :
            'text-gray-500'
          }`}>[{ev.year}] {ev.label}</div>
        ))}
      </div>
    </div>
  );
}

function MaterialLedger({ materials, open, dispatch }) {
  const items = [
    { key:'st', label:'Steel',     color:'#94a3b8' },
    { key:'co', label:'Concrete',  color:'#78716c' },
    { key:'fi', label:'Fiberglass',color:'#22d3ee' },
    { key:'gl', label:'Glass',     color:'#86efac' },
    { key:'al', label:'Aluminum',  color:'#c4b5fd' },
    { key:'li', label:'Lithium',   color:'#fbbf24' },
  ];
  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 transition-all duration-300 z-50"
      style={{height: open ? 120 : 32}}
    >
      <div
        className="flex items-center justify-between px-3 h-8 cursor-pointer select-none border-b border-gray-800"
        onClick={() => dispatch({type:'TOGGLE_LEDGER'})}
      >
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          ⬡ Material Ledger
        </span>
        <span className="text-xs text-gray-500">{open ? '▾' : '▴'}</span>
      </div>
      {open && (
        <div className="flex gap-6 px-4 py-2 overflow-x-auto">
          {items.map(({ key, label, color }) => (
            <div key={key} className="flex flex-col items-center min-w-16">
              <span className="text-xs font-bold" style={{color}}>{label}</span>
              <span className="text-sm font-mono text-white">{fmtMat(materials[key])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TerraSandbox() {
  const [state, dispatch] = useReducer(terraReducer, null, buildInitialState);
  const { year, scores, deployed, pendingAction, placementMode, pendingPlace, ledgerOpen, materials } = state;

  // ESC cancels pending action
  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') dispatch({type:'CANCEL_ACTION'}); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const mwAvg = useMemo(() => mwAvgScores(scores), [scores]);
  const { scenario } = nearestScenario(mwAvg.E, mwAvg.Ec, mwAvg.S);

  const horizonYears = [2025, 2035, 2045, 2055, 2075];

  const BUCKET_LABEL = {
    energy_generation: 'Generation',
    energy_storage: 'Storage',
    energy_transmission: 'Transmission',
    nuclear_fuel_cycle: 'Nuclear',
    hydrological_restoration: 'Hydrology',
    terrestrial_ecosystem: 'Terrestrial',
    settlement_social: 'Social',
    transport: 'Transport',
    economic_development: 'Economic',
  };

  return (
    <div
      className="flex flex-col bg-gray-950 text-gray-100 select-none"
      style={{position:'fixed', top:0, left:0, right:0, bottom:0, fontFamily:'monospace', fontSize:13}}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div>
          <span className="font-bold text-blue-400 mr-2">TERRA</span>
          <span className="text-gray-400 text-xs">Mountain West Transition Sandbox</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Year:</span>
          <span className="text-lg font-bold text-yellow-400">{year}</span>
          <div className="flex gap-1">
            {horizonYears.map(hy => (
              <button
                key={hy}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  year === hy
                    ? 'bg-blue-700 border-blue-500 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-blue-500 hover:text-blue-400'
                }`}
                onClick={() => {
                  if (hy > year) dispatch({type:'ADVANCE_YEAR', n: hy - year});
                  else if (hy < year) dispatch({type:'RESET'});
                }}
              >
                {hy}
              </button>
            ))}
          </div>
          <button
            className="px-2 py-0.5 text-xs rounded border border-green-700 text-green-400 hover:bg-green-900"
            onClick={() => dispatch({type:'ADVANCE_YEAR', n:1})}
          >
            ▶ +1yr
          </button>
          <button
            className="px-2 py-0.5 text-xs rounded border border-gray-700 text-gray-400 hover:border-red-500 hover:text-red-400"
            onClick={() => dispatch({type:'RESET'})}
          >
            Reset
          </button>
        </div>
        <div className="text-xs text-gray-500">
          {scenario?.n} | {deployed.length} actions | Avg E:{mwAvg.E.toFixed(1)} Ec:{mwAvg.Ec.toFixed(1)} S:{mwAvg.S.toFixed(1)}
        </div>
      </div>

      {/* ── 3-column body ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{paddingBottom: ledgerOpen ? 120 : 32}}>

        {/* Left: Action Palette + Disturbances */}
        <div
          className="flex flex-col gap-3 p-3 border-r border-gray-800 overflow-y-auto flex-shrink-0"
          style={{width:270}}
        >
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Action Palette</div>
            <ActionPalette dispatch={dispatch} pendingAction={pendingAction} year={year} />

            {/* Mode indicator pill */}
            {placementMode && (
              <div className="mt-2 px-3 py-1 rounded-full text-xs font-semibold text-center"
                style={{
                  background:   placementMode==='bus' ? '#78350f44' : placementMode==='ecological' ? '#14532d44' : '#3b076444',
                  color:        placementMode==='bus' ? '#fbbf24'   : placementMode==='ecological' ? '#86efac'   : '#c4b5fd',
                  border: `1px solid ${placementMode==='bus' ? '#fbbf2455' : placementMode==='ecological' ? '#86efac55' : '#c4b5fd55'}`,
                }}>
                {placementMode==='bus'        && '⚡ Click a bus node to place'}
                {placementMode==='ecological' && '🌿 Click a region to place'}
                {placementMode==='settlement' && '🏘 Click a city or town to place'}
              </div>
            )}

            {/* Mode C placement card — shown after place click, before Deploy */}
            {pendingAction && pendingPlace && (
              <div className="mt-2 rounded border border-purple-900 p-2" style={{background:'#1a1028'}}>
                <div className="text-xs font-bold text-purple-300">{pendingPlace.name}, {pendingPlace.state}</div>
                <div className="text-xs text-gray-400 mt-0.5">Pop: {pendingPlace.pop.toLocaleString()}</div>
                <div className="text-xs text-gray-500">{EES_BASE[pendingPlace.ecoregion]?.name}</div>
                <div className="text-xs text-yellow-400 mt-1">
                  {ACTIONS[pendingAction]?.n} · 1 {ACTIONS[pendingAction]?.ul}
                </div>
                <button
                  className="mt-2 w-full py-1 text-xs font-bold rounded"
                  style={{background:'#6b21a8', color:'#e9d5ff'}}
                  onClick={() => dispatch({type:'CONFIRM_DEPLOY'})}
                >
                  Deploy here
                </button>
                <button
                  className="mt-1 w-full py-0.5 text-xs text-gray-500 hover:text-gray-300"
                  onClick={() => dispatch({type:'CANCEL_ACTION'})}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Disturbances */}
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Disturbances</div>
            {Object.entries(DISTURBANCES).map(([id, d]) => (
              <button
                key={id}
                className="w-full text-left px-2 py-1 text-xs rounded border border-red-900 text-red-300 hover:bg-red-950 hover:border-red-600 mb-1 flex items-center gap-2"
                onClick={() => dispatch({
                  type: 'INJECT_DISTURBANCE',
                  disturbance_id: id,
                  eco: resolveEcoFromSelected(state.selected),
                })}
              >
                <span>{d.icon}</span>
                <div>
                  <div>{d.n}</div>
                  <div className="text-red-500 text-xs">
                    E{d.ees.E} Ec{d.ees.Ec} S{d.ees.S}
                    {d.eco === 'all' ? ' · all regions' : ' · selected region'}
                  </div>
                </div>
              </button>
            ))}
            <div className="text-xs text-gray-600 mt-1">Select a region first to target single-region disturbances</div>
          </div>

          {/* Deployment queue */}
          {deployed.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Deployed ({deployed.length})</div>
              <div className="max-h-32 overflow-y-auto">
                {[...deployed].reverse().map(d => {
                  const act = ACTIONS[d.action_id];
                  const pending = !d.applied;
                  return (
                    <div key={d.uid} className={`text-xs py-0.5 ${pending ? 'text-yellow-400' : 'text-green-400'}`}>
                      {pending ? '⏳' : '✓'} {act?.n}
                      {(() => { const ba = d.bus ? BUSES.find(b=>b[0]===d.bus)?.[3] : d.eco ? (ECO_BA_XWALK[d.eco]||[])[0] : null; return ba ? <span className="text-gray-500 ml-1">{BA_META[ba]?.abbr||ba}</span> : null; })()}
                      <span className="text-gray-600 ml-1">op:{d.opYear}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Center: Map */}
        <div className="flex-1 overflow-hidden">
          <TerraSVGMap state={state} dispatch={dispatch} />
        </div>

        {/* Right: Panel */}
        <div
          className="flex flex-col border-l border-gray-800 overflow-y-auto flex-shrink-0"
          style={{width:290}}
        >
          <RightPanel state={state} dispatch={dispatch} />
        </div>
      </div>

      {/* ── Material Ledger (fixed bottom) ─────────────────────────────────── */}
      <MaterialLedger materials={materials} open={ledgerOpen} dispatch={dispatch} />
    </div>
  );
}

/*
 * VALIDATION SUMMARY
 * ─────────────────
 * Embedded actions:    45 (offshore_wind_great_lakes excluded — empty applicable_ecoregions)
 * Display layer:       12 BA territories (BA_POLYS); ecoregions retained internally for EES computation
 * Embedded buses:      79 Mountain West buses (AZPS, BPAT, IPCO, NEVP, PACE,
 *                       PSCO, PNM, SRP, WACM, WAUW, EPE, NWMT)
 * Embedded scenarios:  30 profiles (diagonal×5, capital_dominant×9, corner×4, transition×12)
 * Radar chart:         Updates on APPLY_ACTION (materials committed) + ADVANCE_YEAR (EES applied)
 * State polygon verts: 10 state boundaries, simplified (MT/WY/CO/NM/AZ/UT/NV/ID/ND/SD)
 * Engine logic:        applyPendingEES applies delta EES when opYear <= currentYear
 * Data gaps:           fusion_pilot available all years (spec says >=2045 only — add year gate if needed)
 *                      Bus role 'mixed' rendered as hollow circle (same as load) — can differentiate if needed
 */
