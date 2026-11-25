# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/SUNRAKU0/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/SUNRAKU0/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — every pre-token protocol in a sealed DefiLlama snapshot, ranked by the implied value of a launch that hasn't happened yet, each with a farm plan. Built for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).

## How it works

`main.ts` (Node 22, standard library only) reads the sealed snapshot, scores every rankable pre-token protocol with the `comps-2` model in `lib/radar.ts`, and writes `board.json`, `data.js`, the static `dashboard/` page, the three `screenshots/`, and `dossier.json` (via `vendor/makefun-board.ts`).

The model is calibrated from the snapshot's own figures: each category's multiple is the median market-cap-to-TVL ratio of its live-token protocols (thin categories fall back to the global median), then growth, a saturating maturity factor from the protocol's age with no token, and a multi-chain breadth bonus. The board covers all 198 rankable pre-token protocols — the 40-protocol watchlist, 20 more above the floor, and 138 early ones below it — and every row carries a six-step farm plan with a cost and a time on each step. Protocols whose token already trades are set aside in a live view with their market caps.

The dashboard renders with no network: open `dashboard/index.html` beside `data.js` and it works offline, with search, category / segment / chain filters, sortable columns, a detail view per protocol, and the model stated in full.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=h4qpnq0g&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
