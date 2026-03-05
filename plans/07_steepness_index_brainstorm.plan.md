---
name: Steepness Index Brainstorm
overview: Design a per-resort steepness rating (0–100) by computing a per-run steepness score and then aggregating across all runs weighted by run length, so resorts with more flat terrain score proportionally lower.
todos: []
isProject: false
---

# Steepness Index Brainstorm

## Data characteristics (22,145 runs)

- `average_pitch_%`: decimal tangent of slope angle (0.01–0.81, median 0.22)
- `max_pitch_%`: steepest single section (0.01–1.00 capped, median 0.38)
- `inclined_length_m`: along-slope distance — used as the per-run weight

Pitch is the tangent of angle: verified `avg ≈ descent / horizontal_distance`.

---

## Two design axes

### 1. Pitch Intensity — _how steep is it?_

Neither `avg_pitch` nor `max_pitch` alone tells the full story:

- "1st Gully": avg=0.81, max=0.95 → uniformly terrifying
- "Stoker": avg=0.33, max=1.00 → one cliff band, otherwise moderate

A weighted blend rewards runs that are steep _throughout_:

```
pitch_intensity = 0.6 * avg_pitch + 0.4 * max_pitch
```

(Weights are tunable; 60/40 keeps the floor defined by the average while the peak adds a bonus.)

### 2. Sustained-ness — _how long is the steep terrain?_

`inclined_length_m` is used as the per-run weight in the resort-level weighted mean, so longer steep runs naturally contribute more to the resort score than short ones. No separate factor needed in the per-run formula.

---

## Recommended per-run formula

Pure pitch intensity — `inclined_length_m` handles sustained-ness through weighting at the resort level:

```python
def run_steepness(r: dict) -> float:
    avg   = r.get("average_pitch_%") or 0
    max_p = r.get("max_pitch_%")     or 0
    return 0.6 * avg + 0.4 * max_p
```

Sample per-run scores (before length-weighting):

- "Fox Hollow" (easy): `0.6×0.17 + 0.4×0.33 ≈ 0.23`
- "North Hoback" (black): `0.6×0.55 + 0.4×0.64 ≈ 0.59`
- "1st Gully" (uniformly steep): `0.6×0.81 + 0.4×0.95 ≈ 0.87`

---

## Implementation: `compute_aggregate_stats.py`

Yes — this is the right place. The script already loops over every resort file in a single `main()` call and writes `data/aggregate_stats.json`. The steepness score is computed entirely inside the existing loop with no second pass required.

### Step 1 — per-run score (computed inside the existing resort loop)

```python
def run_steepness(r: dict) -> float:
    avg   = r.get("average_pitch_%") or 0
    max_p = r.get("max_pitch_%")     or 0
    return 0.6 * avg + 0.4 * max_p
```

### Step 2 — per-resort raw score (length-weighted mean, inside the resort loop)

Accumulate raw scores during the loop; normalization happens after:

```python
resort_steepness_raw: dict[str, float] = {}

# inside the per-resort loop:
weighted_sum, total_weight = 0.0, 0.0
for r in runs:
    score  = run_steepness(r)
    weight = r.get("inclined_length_m") or 0
    weighted_sum  += score * weight
    total_weight  += weight
resort_steepness_raw[resort_name] = weighted_sum / total_weight if total_weight else 0.0
```

### Step 3 — percentile rank normalization (after the resort loop)

Convert raw scores to percentile ranks across all 596 resorts. A score of 75 means "steeper than 75% of all tracked resorts":

```python
all_raw = list(resort_steepness_raw.values())

def percentile_rank(all_scores: list[float], score: float) -> float:
    below = sum(1 for s in all_scores if s < score)
    equal = sum(1 for s in all_scores if s == score)
    return round((below + 0.5 * equal) / len(all_scores) * 100, 1)

resort_steepness = {
    name: percentile_rank(all_raw, raw)
    for name, raw in resort_steepness_raw.items()
}
```

### Step 4 — add to `payload` (no new file needed)

Add one new key to the existing `payload` dict before `json.dump`:

```python
payload["resort_steepness"] = resort_steepness
# e.g. {"Jackson Hole Mountain Resort": 92.5, "Thunderhill Ski Area": 18.0, ...}
# Score = percentile rank: 92.5 means steeper than 92.5% of all resorts
```

---

## Alternative formulations

**A — Uniformity bonus** (rewards runs where `avg ≈ max`, i.e. uniformly steep throughout):

```
uniformity = avg_pitch / max_pitch   # closer to 1 = no spike, sustained steep
pitch_intensity = max_pitch * (α + (1-α) * uniformity)
```

Penalizes "one scary cliff, mellow otherwise" runs more aggressively than the default blend.

**B — Angle-based** (convert pitch to degrees for more intuitive weights):

```
avg_angle = degrees(atan(avg_pitch))
max_angle = degrees(atan(max_pitch))
pitch_intensity = 0.6 * avg_angle + 0.4 * max_angle
```

`atan` compresses the high end (pitch > 0.8), softening the score difference between extreme and merely-very-steep runs.
