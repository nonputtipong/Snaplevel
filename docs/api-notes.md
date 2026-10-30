# Meta Model API notes

Working notes on the Meta Model API as used by Snaplevel. No keys or account identifiers here.

## Verified

- Base URL `https://api.meta.ai/v1` with `Authorization: Bearer $MODEL_API_KEY`; works with the OpenAI SDK by changing base URL and key.
- Model IDs: `muse-spark-1.3`, `sam-3.1`, `muse-image-1.0`, `muse-voice-transcribe-1.0`.
- Spark: Responses API (`client.responses.create`); Chat Completions also available; vision input via URL or base64; structured output supported.
- SAM: `POST /v1/responses`, one short noun phrase per request, base64 data URLs accepted, `stream: true`. Zero matches is valid (empty output). Boxes in source pixels; masks parsed with `@meta-sam/parser`.
- Muse Image: `POST /v1/images/generations` and `/v1/images/edits`; edits take base64 data URLs; output background always opaque; `mask` unsupported on edits.
- Voice: file transcription via `POST /v1/asr/transcribe`.
- Smoke test (Oct 30): `responses.create({ model: "muse-spark-1.3", input })` via the OpenAI SDK succeeded; billing accepted, no auth errors.
- Spark vision+structured (Oct 30, cookbook `01_api_fundamentals/07` + `04`, verified live): `input=[{role:"user",content:[{type:"input_text",text},{type:"input_image",image_url:<data URL string>}]}]`, `text.format={type:"json_schema",name,schema,strict:true}` with `additionalProperties:false`+`required` at every level, output read from `output_text`. `reasoning={"effort":"low"|"medium"|"high"}` accepted. No faster Spark variant found. Gotchas: images in user messages only; `max_output_tokens` budget includes reasoning tokens (512 truncated an 8-object reply; 2048 safe).

## Unverified

- Whether SAM masks are cropped to their box and what offset places them (verify by overlaying the SVG path on the photo).
- Whether Muse Image restyle keeps object geometry stable enough to reuse the original polygons.
- Whether `detail:"low"` preserves listObjects quality while cutting latency further (not yet tested; SDK requires `detail`, currently `"auto"`).

## Latency

- Text smoke call (5-word reply): ~27 s first, then 13.0 s / 7.4 s / 7.5 s back-to-back (Oct 30) — warms to ~7.5 s steady.
- listObjects vision+structured (desk photo, 1024 px JPEG, ≤8 objects): default 27.1 s (8 objs) then 21.6 s warm (6 objs); `reasoning:{"effort":"low"}` 19.3–20.4 s (8 objs, valid with `max_output_tokens: 2048`). Steady state ≈20 s — above the 10 s gate, STOPPED per gate (Oct 30).
- 512 px input (merged prompt, reasoning low, 2048): 24.7 s / 27.8 s, quality good — no speedup vs 1024, staying at 1024 (Oct 30).
- 8-sample run, merged prompt (objects+roles), reasoning low, max 2048, `detail:"auto"` (SDK types require it): 5.1–8.0 s each, 8/8 valid (Oct 30). Far faster than the earlier 20 s probes — possibly `detail:auto` resolving low, possibly load. Gate concern lifted for listObjects.

## Rate limits

- (None observed yet.)

## Pricing

- Muse Image: $0.01 per image. Voice transcription: $0.18 per hour of audio. (SAM/Spark pricing to confirm.)

## Open questions

- Per-request caps and rate limits for SAM and Spark.
- Whether the Meta console offers a spend limit.

## listObjects sample results (Oct 30, merged prompt, all valid)

- desk.jpg (7.2 s, 6): 4×platform (desk, laptop, plant pot, mug), slippery mouse, bouncy earbud case. All concrete.
- garage-full-of-clutter.jpg (7.9 s, 7): 4×platform, bouncy tub, slippery tray, hazard drill press (1/7). All concrete.
- kitchen-counter-with-a-fruit-bowl.jpg (8.0 s, 8): 5×platform, 2×slippery (stove, dishwasher), decor curtain. Max items, all concrete.
- lamp-glowing-in-a-dark-room.jpg (5.9 s, 4): 2×platform (sofa, side table), slippery door (odd but harmless), decor frame.
- minimal-coffee-table.jpg (6.4 s, 6): 3×platform, 2×bouncy (pillow, vase), slippery floor tile. Sparse photo still satisfies ≥2 platforms.
- scooters-locked-to-a-pole-on-a-street.jpg (6.9 s, 5): 4×platform (sidewalk, scooter, pole, bollard), slippery car. All concrete.
- single-park-bench-on-a-lawn.jpg (5.9 s, 5): 4×platform (bench, slab, lawn, distant parked car), decor canopy. Note: model lists distant objects (car) — may need filtering at design time.
- toy-shelves-with-a-rug.jpg (5.1 s, 7): 5×platform, slippery floorboard, decor mural. All concrete.

No people/faces and no color adjectives in any output; hazard share ≤20% everywhere (validator-enforced).

## Mock SSE event format

`POST /api/build-level` with `MOCK_MODE=1` streams `text/event-stream`:

- `event: progress`, data `{ step, status, current?, total? }`: one
  `find_objects`, then `segment` once per object with `current`/`total`, then
  `design_level`. Events are ~400ms apart so progress UI feels realistic.
- `event: complete`, data: the Level JSON.

Example:

```text
event: progress
data: {"step":"find_objects","status":"done"}

event: progress
data: {"step":"segment","status":"done","current":1,"total":5}

event: complete
data: {"width":1024,"height":768,...}
```

`?fixture=0|1|2|3` selects the served fixture (default 0; 3 is the empty
level); anything else returns a 400 JSON error. Without `MOCK_MODE=1` the
route returns 501 until the live pipeline lands.
