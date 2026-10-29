# Snaplevel

Photograph anything — a desk, a room, a street corner — and get a playable 2D platformer level in under a minute.

Solo entry for the Meta Global AI Developer Hackathon (Indie Developer track). Snaplevel is a creation tool: objects in the photo become platforms, bouncy things, and hazards in a game you play and share.

## How to run

Prerequisites: [bun](https://bun.sh) 1.x.

```sh
bun install
cp .env.example .env.local
bun run dev
```

Then open http://localhost:3000 in a browser.

- Mock mode (no API key, serves fixtures): `MOCK_MODE=1 bun run dev`
- Live mode (calls Meta's models server-side): set `MODEL_API_KEY` in `.env.local`, unset `MOCK_MODE`, `bun run dev`

Other commands: `bun test`, `bun run build`.

## Meta models used

All calls are server-side; the key never reaches the browser.

- Muse Spark (`muse-spark-1.3`) — lists objects in the photo and assigns each a game role.
- SAM 3.1 (`sam-3.1`) — segments each object; masks become collision polygons.
- Muse Image (`muse-image-1.0`) — optional restyle of the level background.
- Muse Voice Transcribe (`muse-voice-transcribe-1.0`) — optional spoken rules (planned).

See `docs/api-notes.md` for verified API behavior and measurements.

## Built during the hackathon

(Empty — entries are added as features land.)
