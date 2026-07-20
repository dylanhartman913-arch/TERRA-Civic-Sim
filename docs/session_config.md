# TERRA Session Config — Schema & Examples

A **session config** is a facilitator-authored JSON file that customises a
workshop run. Participants load it on the session start screen (or the
facilitator distributes a pre-built URL with `?session=<code>`). The file
sets a shared seed so every participant draws the same stochastic events,
caps how far the clock can run, and activates annotation prompts that
appear at auto-pause moments.

---

## Schema (version `1.0`)

```jsonc
{
  "schema_version": "1.0",          // required; must be exactly "1.0"
  "session_code":   "string",        // required; short alphanumeric key shown in the UI
  "title":          "string",        // required; displayed on the session start screen
  "description":    "string",        // optional; one-line context shown below the title

  // Which scenario or campaign to use
  "campaign_id":         "string",   // optional; if set, auto-starts that campaign on Join
  "scenario_profile_id": "string",   // optional; ignored if campaign_id is also set

  // Reproducibility — every participant who loads this file gets the same events
  "fixed_seed": 123456789,           // optional; integer in [1, 2^31-1]

  // Session duration
  "max_year": 2035,                  // optional; reflection card auto-pops when year reached

  // Annotation prompts — shown inside the auto-pause modal for matching trigger types
  "annotation_prompts": [
    {
      "trigger": "build_decision",   // fires on build_complete or coupling_activated pause
      "prompt":  "Why this move?"
    },
    {
      "trigger": "disturbance_event", // fires on event_fired pause
      "prompt":  "How are you responding?"
    },
    {
      "trigger": "era_transition",    // fires on era_transition pause
      "prompt":  "What's your priority for the next era?"
    }
    // trigger values: "build_decision" | "disturbance_event" | "era_transition" | "manual" | "drought_onset" | "irrigated_conversion"
  ],

  // Panel / feature locks (all default to false / unlocked)
  "locked_settings": {
    "disable_stress_test": false,    // hide the stress-test injection panel
    "disable_comparison":  false,    // hide the comparison mode button
    "max_year": 2035                 // redundant with root max_year; used for panel-level checks
  }
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | `"1.0"` | yes | Exact string match; app rejects any other value |
| `session_code` | string | yes | Alphanumeric; shown in the participant badge and stamped in the exported `.terra.json` |
| `title` | string | yes | Displayed on the session start screen |
| `description` | string | no | Subtitle shown below the title |
| `campaign_id` | string | no | Must match a `campaign_id` in `campaigns.json`. Auto-starts on Join |
| `scenario_profile_id` | string | no | Used only when `campaign_id` is absent; loads a free-play scenario |
| `fixed_seed` | integer | no | Ensures all participants see identical stochastic events. Omit for each participant to draw their own seed |
| `max_year` | integer | no | Year at which the reflection card is automatically shown and the game pauses |
| `ag_category` | boolean | no | Enables agriculture actions in the palette; omitted preserves energy-only sessions |
| `drought` | boolean | no | Enables seeded AG2 drought sampling and consequences during yearly play |
| `climate_lens` | `"historical"` \| `"ssp245"` \| `"ssp370"` | no | Climate projection lens used for replay and, when drought is enabled, drought modulation |
| `annotation_prompts` | array | no | Each entry maps a trigger type to a one-line prompt text |
| `annotation_prompts[].trigger` | string | yes | One of `build_decision`, `disturbance_event`, `era_transition`, `manual`, `drought_onset`, `irrigated_conversion` |
| `annotation_prompts[].prompt` | string | yes | The question shown in the auto-pause modal |
| `locked_settings.disable_stress_test` | bool | no | Hides the stress-test panel |
| `locked_settings.disable_comparison` | bool | no | Hides comparison mode |

### Trigger → auto-pause mapping

| `trigger` value | Fires on these auto-pause reasons |
|---|---|
| `build_decision` | `build_complete`, `coupling_activated` |
| `disturbance_event` | `event_fired` |
| `era_transition` | `era_transition` |
| `manual` | Participant-initiated from the reflection card |
| `drought_onset` | First active seeded AG drought in a county |
| `irrigated_conversion` | First conversion of irrigated agricultural land |

---

## Example 1 — 45-minute "Wyoming 2032" session

Structured intro session. Fixed seed for comparability, capped at 2032,
two annotation prompts, stress panel disabled.

```json
{
  "schema_version": "1.0",
  "session_code": "WY2032",
  "title": "Wyoming Energy Futures — 2032 Scenario",
  "description": "45-minute facilitated session. Build the county portfolio that best balances fiscal stability and grid reliability by 2032.",

  "campaign_id": "wyoming_2032_nuclear_dc",
  "fixed_seed": 314159265,
  "max_year": 2032,

  "annotation_prompts": [
    {
      "trigger": "build_decision",
      "prompt": "Why this investment in this county?"
    },
    {
      "trigger": "disturbance_event",
      "prompt": "How does this change your next move?"
    }
  ],

  "locked_settings": {
    "disable_stress_test": true,
    "disable_comparison": false
  }
}
```

**Facilitator notes:**
- Distribute this file to all participants before the session.
- Share the URL `https://<your-host>/?session=WY2032` so participants skip the title screen.
- At the 2032 wall, the reflection card auto-pops; export `.terra.json` files for
  debrief comparison using the built-in Comparison View.
- All tables draw the same event sequence (heat wave 2028, policy shock 2030)
  because `fixed_seed` is set.

---

## Example 2 — 90-minute open build

Free-play exploration session. No campaign lock, no seed (each participant
gets their own random draw), runs to 2045, all prompts active including era
transitions.

```json
{
  "schema_version": "1.0",
  "session_code": "OPEN90",
  "title": "Mountain West Energy Futures — Open Build",
  "description": "90-minute open exploration. No prescribed pathway — build the grid you think the region needs.",

  "fixed_seed": null,
  "max_year": 2045,

  "annotation_prompts": [
    {
      "trigger": "build_decision",
      "prompt": "Why this move?"
    },
    {
      "trigger": "disturbance_event",
      "prompt": "How are you responding?"
    },
    {
      "trigger": "era_transition",
      "prompt": "What's your priority for the next decade?"
    }
  ],

  "locked_settings": {
    "disable_stress_test": false,
    "disable_comparison": false
  }
}
```

**Facilitator notes:**
- Because `fixed_seed` is `null` (or omitted), each participant gets a unique
  random seed. Useful for exploring scenario diversity; not appropriate for
  controlled comparisons.
- The `max_year: 2045` cap covers the Foundation and Transition eras, giving
  participants two era-transition moments and a full annotation trail.
- Participants can click **◆ Report** at any time to see their running
  annotations without ending the session.

---

## Exported `.terra.json` structure (session mode)

When a participant clicks **Export .terra.json** from the reflection card,
the standard `ScenarioFile` gains two additional top-level keys:

```jsonc
{
  "schema_version": "3.0",
  // ... standard ScenarioFile fields ...
  "replay_digest": "<md5>",   // digest covers only engine state — unaffected by session fields

  "session_meta": {
    "session_code": "WY2032",
    "participant_label": "Table 3",
    "started_at": "2026-07-05T14:00:00.000Z",
    "app_version": "1.0"
  },

  "annotations": [
    {
      "id": "ann_1720185600000_x7k2p",
      "year": 2028,
      "trigger_type": "build_decision",
      "trigger_id": "build_complete_y2028",
      "prompt": "Why this investment in this county?",
      "text": "Campbell County has the site and workforce; SMR needs coal-plant proximity.",
      "timestamp": 1720185600000
    }
  ]
}
```

The `replay_digest` is computed only from the engine state fields (county EES,
bus state, active couplings, SC pools, year) — annotations and session metadata
do not affect it. A file with annotations replays to the same digest as the same
file without them.
