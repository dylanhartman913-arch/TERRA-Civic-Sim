# Wyoming Forage & Rangeland Assumptions — Review Packet

**Prepared for:** Domain reviewer (rancher, Extension agent, or range specialist)
**Date:** September 2026
**Scope:** 23 Wyoming counties in the study area

---

## What This Packet Is

We are building an energy-transition planning tool for Wyoming. Part of that
tool tracks how energy development interacts with agricultural land — grazing
capacity, irrigated cropland, and rangeland value. Before we rely on these
numbers for planning, we need someone who knows Wyoming ranching to tell us
where we got it right and where we're off.

This document lays out every agricultural assumption the tool uses, where each
number came from, and where we're guessing. We'd rather you tell us a number
is wrong now than discover it later.

---

## 1. How We Estimate Grazing Capacity

### Private land

We estimate each county's grazing capacity by multiplying forage acres
(pastureland plus non-crop, non-woodland agricultural land from the 2022
Census of Agriculture) by a stocking rate.

**We use a single stocking rate for the entire state: 30 acres per AUM
(0.033 AUM per acre).** This comes from the NRCS Wyoming Grazing Lands
Technical Note, which gives a range of 20-40 acres per AUM. We picked the
midpoint.

That produces a statewide private grazing capacity of roughly **865,000 AUM
per year** across all 23 counties.

**This is our biggest known weakness.** A flat 30-ac/AUM rate treats the
Red Desert the same as the Bighorn Basin. In reality, stocking rates vary
enormously by range condition, elevation, precipitation, and soil type.
We did not have county-level stocking-rate data and used the state average
as a placeholder.

### Federal land (Forest Service allotments)

We identified 686 USFS grazing allotments in Wyoming from the Forest Service
EDW shapefile (2024). We assigned each allotment to a county by centroid and
totaled the authorized-use acres per county. Twenty-one of the 23 counties
have Forest Service allotments; Goshen and Laramie counties do not.

**The Forest Service source does not include authorized AUM counts — only
allotment acreage.** To estimate federal AUM capacity, we multiplied each
county's federal allotment acreage by the same 30-ac/AUM stocking rate. This
is a rough proxy. Total estimated federal AUM across the study area is roughly
**202,000 AUM/year**, or about 19% of total estimated AUM.

### BLM allotments — missing entirely

**We have no BLM grazing data.** The BLM Rangeland Administration System
(RAS) has no public API or downloadable dataset that we could access. Every
county's BLM authorized AUM is blank.

For context, BLM administers more grazing land in Wyoming than the Forest
Service does. The absence of BLM data means our federal grazing numbers are
significantly understated, and the private/federal split in any county with
substantial BLM allotments is wrong. We are not trying to hide this — it is
the single largest data gap in the agricultural side of the tool.

---

## 2. Cattle Numbers

Beef cow counts come from two USDA sources:

- **NASS Quick Stats (2022 survey):** Used for 16 counties where the survey
  value was published. These are rounded to the nearest 500 or 1,000 head.
  We treat these as high-confidence.
- **Census of Agriculture (2022):** Used for 4 counties where NASS survey
  values were suppressed or unavailable (Albany, Goshen, Platte, Teton).
  These are medium-confidence.
- **Three counties have no usable cattle count:** Hot Springs, Laramie, and
  Park. NASS suppressed the values (marked "D" for disclosure protection).
  In the tool, these counties carry a null cattle inventory — they are not
  zeroed out or estimated.

The sum of the 20 counties with data is roughly **629,000 beef cows**. The
three missing counties would add to that total, so the statewide figure is
higher.

---

## 3. How Cattle Respond to Forage Changes

When available forage goes up or down — whether from drought, land conversion,
or a restoration project — we assume cattle numbers follow, but not
one-for-one.

**We use an elasticity of 0.75.** That means if forage drops 20%, we assume
the herd shrinks about 15%. The idea is that ranchers absorb some of the loss
through supplemental feed, reduced weight gain, or other adjustments before
they sell off pairs.

This 0.75 value is the same for every county. The plausible range is 0.5 to
1.0 (i.e., ranchers absorb half the loss at one extreme, or destock
proportionally at the other). We chose 0.75 as a middle estimate.

---

## 4. How We Handle Drought

The tool models drought as a temporary hit to forage production and an
increase in irrigation water demand. We use only one drought severity level
in the current version — roughly equivalent to the US Drought Monitor's
"D1 / Moderate Drought."

At standard severity:

- **Forage production drops 20%.** (Meaning 80% of normal-year forage is
  available.)
- **Irrigation water demand increases 15%.** (Reflecting higher
  evapotranspiration and supplemental watering.)

Severity can be scaled from mild (half of standard, so a 10% forage drop) to
intense (double standard, so a 40% forage drop). When multiple drought years
overlap, the worst year's forage reduction applies — they do not stack.

The tool does not model D2-D4 drought directly. Those severity tiers exist
in the underlying data but are not activated. This means exceptional drought
— the kind that triggers emergency destocking — is not represented.

---

## 5. Land Values for Tax Assessment

Wyoming assesses agricultural land for property tax based on productive value
(what the land can produce, not its market price), per state statute W.S.
39-11-102(b). The assessed value is 9.5% of the productive value.

We use the following productive values:

| Land class | Productive value per acre | What it represents |
|---|---|---|
| Irrigated cropland | $1,767 | 3 tons of hay per acre, mid-quality soil |
| Dryland cropland | $376 | 28 bushels of wheat per acre, mid-quality soil |
| Grazing land | $126 | Range Group R-5, 0.3 AUM per acre |

These are statewide representative figures from the Wyoming Department of
Revenue 2026 agricultural valuation study. **They are the same number for
every county.** In reality, DOR assigns different values by Land Resource
Area and soil class. The actual range is wide:

- Irrigated: $589 to $3,239/acre across Wyoming
- Dryland: $134 to $617/acre
- Grazing: $10 to $1,006/acre

We used the statewide representative because we could not retrieve
county-level DOR assignments — the DOR website was unavailable during our
data collection (DNS failure on the property tax division domain). This is a
known gap: a county with high-quality irrigated bottom land is valued the same
as a county with marginal dry range.

---

## 6. Water

**We have no actual county-level water diversion or consumptive-use data.**
The Wyoming State Engineer's e-Permit system was inaccessible during data
collection (URL changed, returned 404). Every county's water observation is
null.

As a planning proxy, we estimate:
- **2.0 acre-feet diverted per irrigated acre**
- **1.2 acre-feet consumed per irrigated acre**

These are generic western-state averages, not Wyoming-specific measurements.
We flag this prominently because water is central to both ranching and energy
development in Wyoming, and these proxy numbers may be significantly off for
any given county.

---

## 7. Invasive Annual Grass

We track each county's invasive annual grass cover (cheatgrass and similar
species) using the Rangeland Analysis Platform, a satellite-derived dataset.
Current county-level cover ranges from about 2% (Teton) to 17% (Campbell).
The 10-year trend (2015 vs. 2025) is also tracked per county.

This feeds into the tool's estimate of how much rangeland restoration
would cost and how quickly treated areas re-invade. We assume **30% of
treated acreage re-invades per year** without ongoing maintenance — meaning
a one-time spray-and-seed effort loses most of its gains within 3-4 years
if not followed up.

---

## What We're Confident In and What We're Not

Of the 621 individual data values across all 23 counties:

| Confidence level | Count | Percentage | What's in this category |
|---|---|---|---|
| **High** | 39 | 6.3% | Published NASS cattle counts, BEA farm income |
| **Medium** | 414 | 66.7% | Census land-use acres, DOR productive values, USFS allotment acres |
| **Low** | 168 | **27.1%** | Forage acres (all 23 counties), stocking rates (all 23), AUM capacity (all 23), BLM data (all 23), water data (all 23), plus 3 suppressed cattle counts and a few land-class breakdowns |

**The low-confidence percentage is 27.1%.** For comparison, the fiscal
(tax revenue) side of the tool runs about 44% low-confidence. The ag side
is better, but the low-confidence items hit the things that matter most for
grazing: stocking rate, forage acreage, and the entire federal allotment
picture.

### Every low-confidence item, named plainly

1. **Stocking rate (all 23 counties):** Single statewide average (30 ac/AUM)
   applied everywhere. Reality varies by a factor of 2x or more.
2. **Forage acres (all 23 counties):** Derived as a residual (pastureland +
   non-crop/non-woodland ag land). Not a direct forage-quality measurement.
3. **Private AUM capacity (all 23 counties):** Product of the two items above
   — inherits both weaknesses.
4. **BLM authorized AUM (all 23 counties):** Null. No data retrieved.
5. **Federal AUM share (all 23 counties):** Cannot compute without BLM data.
6. **County water diversions (all 23 counties):** Null. Proxy only.
7. **County water consumptive use (all 23 counties):** Null. Proxy only.
8. **Beef cows in Hot Springs, Laramie, and Park counties:** NASS-suppressed,
   carried as null.
9. **Rangeland and woodland acre breakdowns (2 counties):** Minor
   classification uncertainty in the Census residual.

---

## Questions for the Reviewer

1. **Stocking rates by region:** We use 30 acres per AUM statewide. For the
   counties you know best, what stocking rate would you expect on typical
   private rangeland — and how much does it vary between the best and worst
   pastures in that county?

2. **Federal grazing reliance:** In counties along the Bighorn National Forest
   or the Bridger-Teton, roughly what share of a typical ranch operation's
   annual AUM comes from federal allotments (BLM + Forest Service combined)
   versus private deeded and leased land? We're estimating ~19% federal
   statewide based on Forest Service acres alone, but that's missing all BLM.

3. **Drought destocking timing:** We assume that when forage drops 20% in a
   drought year, ranchers reduce herd size by about 15% (the rest absorbed
   through supplemental feed, shorter grazing season, or accepting lower
   weights). Does that ratio feel right for a moderate (D1) drought year, or
   do most operations hold tighter / liquidate faster than that?
