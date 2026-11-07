# HoopDraft 82-0

A basketball roster-drafting game: spin a franchise + decade, draft a starting five from that pool, add a 6th man and a coaching system, then play an 82-game season and chase a perfect 82-0.

Stack: Vite + React 19 + TypeScript + Tailwind + Zustand + Motion, tested with Vitest.

> **Status: Phase 0 complete** (data pipeline, simulation engine, calibration tests — no UI yet).
> Phase 1 (Classic + Daily UI) and Phase 2 (CrazyGames SDK, ads, telemetry, audio) follow.

## Quick start

```bash
npm install
npm test               # all unit + calibration tests
npm run test:sim       # Phase 0 acceptance: 10k RandomBot + 10k GreedySkillBot
npm run validate:data  # pool / NaN validation of the bundled dataset
npm run typecheck
```

Rebuilding the dataset (not needed to play; output is committed):

```bash
npm run ingest:download   # fetch source CSVs into data/raw/ (git-ignored) and rebuild
npm run ingest            # rebuild from existing data/raw/*.csv
npm run calibrate -- 10000 <seed> [--sweep]   # balance exploration
```

## Data pipeline (`scripts/`)

| File | Role |
| --- | --- |
| `scripts/ingestRosterData.ts` | ETL: source CSVs → `src/data/players.min.json` + `src/data/opponents.min.json` |
| `scripts/lib/transform.ts` | Pure, deterministic transform (unit-tested against real-source fixtures in `tests/fixtures/`) |
| `scripts/validatePools.ts` | `npm run validate:data` |

- **Source:** Basketball-Reference season tables (per-game, advanced, team summaries) from the open [`sumitrodatta/bball-reference-datasets`](https://github.com/sumitrodatta/bball-reference-datasets) repo. I used it because `llimllib/nba_data` only starts in 2009-10 and the BBGM roster files only hold current rosters, and the game needs 1960s–2020s coverage. No stat is generated or recalled from memory. The one exception is steals/blocks before 1973-74, which the league did not record: those cards get a positional estimate, flagged `defEst`, and the engine rates them with an archetype coefficient instead of the estimate.
- **Scope:** NBA regular seasons 1959-60 → 2025-26, players with ≥ 20 games and ≥ 10 mpg. Each card is a player's **peak season with one franchise in one decade**, keeping the 20 most-used players per franchise-decade, topped up so every position has depth. 3,555 cards and 1,595 opponent team-seasons; `players.min.json` is ~440 KB raw / ~135 KB gzip.
- **Combo positions:** a card is eligible at every position the player was listed at for that franchise in that decade (e.g. `PG/SG`).
- **Relocation mapping** (`src/config/franchises.ts`): SEA→OKC, NJN/BRK/NYN→BKN, VAN→MEM, WSB/BAL/CAP/CHP/CHZ→WAS, SDC/BUF→LAC, NOH/NOK→NOP, KCK/KCO/CIN/ROC→SAC, STL/MLH/TRI→ATL, SDR→HOU, SFW/PHW→GSW, SYR→PHI, MNL→LAL, NOJ→UTA, FTW→DET, CHH/CHO→CHA, PHO→PHX. Multi-team aggregate rows (`2TM`, `TOT`) are dropped.
- **IP & alias layer:** teams are only ever shown as `<City> <Color>` (Los Angeles Gold, Chicago Red, Boston Green, …) with a two-colour HEX palette. No club nicknames or logos appear, and a test enforces this. Every card stores `id`, `realName` and `aliasName` (`"M. Jordan"`). Flip `USE_ALIAS_NAMES` in `src/config/ipConfig.ts` to switch the whole game between alias and real names.
- **Validation:** of the 30 × 7 franchise-decades, 174 are **active** (the franchise played ≥ 3 NBA seasons in that decade). Each active pool must have ≥ 12 cards and ≥ 2 eligible players at every position. The other 36 (e.g. Toronto 1960s) never appear on the wheel. Every stat must also be finite.

## Simulation engine (`src/engine/`)

| File | Role |
| --- | --- |
| `simulator.ts` | Stage 1 rating, Stage 2 TeamRating, Stage 3 p_win + seeded season |
| `draft.ts` | Pure draft state machine: spins, respins, picks, 6th man, coach, slot swaps |
| `bots.ts` | `RandomBot` and `GreedySkillBot` for calibration |
| `prng.ts` | mulberry32, string hashing, run seeds, daily seed |
| `dataset.ts`, `index.ts` | Decoding the compact JSON, pool building, `getEngine()` |

**Stage 1 — era-normalised individual rating.** PPG/RPG/APG/SPG/BPG are divided by that decade's minutes-weighted league mean, and TS% is taken relative to the decade's mean. Pre-1973-74 players get their position's average defensive value, nudged within a fixed band by archetype (rebounding share → rim protection, playmaking share → ball pressure). They do not get a flat inflated bonus.

**Stage 2 — TeamRating** = (mean starter IR + spacing + playmaking + usage + defense + bench) × coach-fit multiplier. All synergy sits inside the rating, before the logistic curve:
- Spacing: +1.5 for 2 outside shooters (+0.5 each up to 4); −3.0 with 4 non-shooters, −4.5 with 5. A shooter is defined by 3PA volume and accuracy versus the era, or by an FT% proxy before the 3-point line existed.
- Playmaking: +2.0 for an APG ≥ 7.5 creator; −1.5 if no starter averages 4.5 APG.
- Usage: diminishing returns of −(n−2)^1.5 once 3+ high-usage scorers share the floor (−5.2 with five).
- Defense: +1.5 rim protector (BPG ≥ 2.0), +1.0 perimeter defender (SPG ≥ 1.8), +0.5 more for having both; −1.0 with neither.
- Bonus round: 6th man adds 0.12 × (IR − 50). Coach systems (Pace & Space, Motion/Triangle, Grit & Grind) score their fit with the starting five's archetypes in [0, 1], which maps to a ×0.97–1.04 multiplier.

**Stage 3 — season.** p_win = min(P_MAX, logistic((TeamRating − opponentStrength) / 5)) with **P_MAX = 0.9625**, so the best possible 82-0 odds are 0.9625^82 ≈ 4.4%. Each of the 82 games is against a real historical team-season, with opponentStrength = 77 + SRS. Losses record the opponent and margin, e.g. `'96 Chicago Red by 6`.

**Exploit protection.** Each run gets a fresh crypto `runSeed`. The schedule depends only on the `runSeed`, and the outcomes depend on the `runSeed` plus a canonical roster key (5 slots + 6th man + coach). Re-simulating the same roster in the same run always returns the identical season. Wheel results are derived from the `runSeed` and the spin/respin index, so the Daily Challenge (seeded from `YYYY-MM-DD`) gives everyone the same wheel no matter what they pick.

## Phase 0 acceptance results

`npm run test:sim` (cold, no warm-up pass):

```
[calibration] ~1200 ms | RandomBot 82-0 0.000% (avg 11.0 W) | GreedySkillBot 82-0 4.10% (avg 78.6 W)
```

| Criterion | Target | Measured |
| --- | --- | --- |
| 10k random + 10k greedy drafts and seasons | < 2000 ms | ~1.15–1.3 s |
| RandomBot 82-0 rate | < 0.05% | 0.000% (≈ 0.003% analytic) |
| GreedySkillBot 82-0 rate | 3.0–4.5% | 4.10% (≈ 1 in 24); 3.9–4.0% on other seed sets |
