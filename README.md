# SUNSET BAY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gta6scam/sunset-bay-w5/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gta6scam/sunset-bay-w5/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SUNSET BAY is an original open-world crime game built for the Make GTA 6 bounty on make.fun. You roam a sun-soaked bay city on foot and by car through a 15-mission story, outrun a 5-star wanted system answered by SBPD dispatch, and live with the city's weather, shops, full map and pause stats.

This repository is my entry to the bounty: https://make.fun/bounty/gta6-01

## Play

Run `node serve.ts`, then open http://localhost:8080 in a desktop browser. The game itself is plain static files under `game/` — no build step, no network requests — and plays with keyboard and mouse.

## Hand-in

Running `node main.ts` copies `game/` and `screenshots/` into the output directory and writes `dossier.json` there, built with `buildDossier` from `vendor/makefun-game.ts`. Outside the grader, `MAKEFUN_OUTPUT_DIR` names that output directory.

## Join make.fun

Sign up through my referral link: https://make.fun/r/kvykfv6e

## License

MIT — see `LICENSE`.
