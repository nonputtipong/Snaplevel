# Meta Model API notes

Working notes on the Meta Model API as used by Snaplevel. No keys or account identifiers here.

## Verified

- Base URL `https://api.meta.ai/v1` with `Authorization: Bearer $MODEL_API_KEY`; works with the OpenAI SDK by changing base URL and key.
- Model IDs: `muse-spark-1.3`, `sam-3.1`, `muse-image-1.0`, `muse-voice-transcribe-1.0`.
- Spark: Responses API (`client.responses.create`); Chat Completions also available; vision input via URL or base64; structured output supported.
- SAM: `POST /v1/responses`, one short noun phrase per request, base64 data URLs accepted, `stream: true`. Zero matches is valid (empty output). Boxes in source pixels; masks parsed with `@meta-sam/parser`.
- SAM stream finalization (Oct 30, cookbook `07_sam/01_api_basics/typescript/sam-api.ts`, verified live): the API streams `response.content_part.done` but not `response.output_text.done`, so synthesize the latter from the content part or the parser never finalizes. Request shape: `responses.create({ model: "sam-3.1", stream: true, input: [{ type: "message", role: "user", content: [{ type: "input_text", text: phrase }, { type: "input_image", image_url: dataURL, detail: "auto" }] }] })`.
- SAM masks are cropped to their box (Oct 30, verified live + overlay): mask raster dims equal (box width+1)×(box height+1) (e.g. 301×121 raster for box [60,300,361,421]); `decodeMaskToSVGPath` coords are raster-local (x −0.5..width−0.5); placing the path at `translate(box x1, box y1)` aligns exactly on 3/3 photos, while origin-placed outlines land in the wrong spot. Mask `bounds` equal the box record for the same `objectId`.
- SAM mask paths may carry interior hole loops as extra same-winding subpaths (e.g. bench slat gaps, basket weave); the converter keeps all parts, and hole-corrected polygon area matches the mask within 2% on 3 captures (Oct 30).
- Muse Image: `POST /v1/images/generations` and `/v1/images/edits`; edits take base64 data URLs; output background always opaque; `mask` unsupported on edits.
- Voice: file transcription via `POST /v1/asr/transcribe`.
- Smoke test (Oct 30): `responses.create({ model: "muse-spark-1.3", input })` via the OpenAI SDK succeeded; billing accepted, no auth errors.
- Spark vision+structured (Oct 30, cookbook `01_api_fundamentals/07` + `04`, verified live): `input=[{role:"user",content:[{type:"input_text",text},{type:"input_image",image_url:<data URL string>}]}]`, `text.format={type:"json_schema",name,schema,strict:true}` with `additionalProperties:false`+`required` at every level, output read from `output_text`. `reasoning={"effort":"low"|"medium"|"high"}` accepted. No faster Spark variant found. Gotchas: images in user messages only; `max_output_tokens` budget includes reasoning tokens (512 truncated an 8-object reply; 2048 safe).

## Unverified

- Whether Muse Image restyle keeps object geometry stable enough to reuse the original polygons.
- Whether `detail:"low"` preserves listObjects quality while cutting latency further (not yet tested; SDK requires `detail`, currently `"auto"`).

## Latency

- Text smoke call (5-word reply): ~27 s first, then 13.0 s / 7.4 s / 7.5 s back-to-back (Oct 30) — warms to ~7.5 s steady.
- listObjects vision+structured (desk photo, 1024 px JPEG, ≤8 objects): default 27.1 s (8 objs) then 21.6 s warm (6 objs); `reasoning:{"effort":"low"}` 19.3–20.4 s (8 objs, valid with `max_output_tokens: 2048`). Steady state ≈20 s — above the 10 s gate, STOPPED per gate (Oct 30).
- 512 px input (merged prompt, reasoning low, 2048): 24.7 s / 27.8 s, quality good — no speedup vs 1024, staying at 1024 (Oct 30).
- 8-sample run, merged prompt (objects+roles), reasoning low, max 2048, `detail:"auto"` (SDK types require it): 5.1–8.0 s each, 8/8 valid (Oct 30). Far faster than the earlier 20 s probes — possibly `detail:auto` resolving low, possibly load. Gate concern lifted for listObjects.
- SAM segment per phrase, 1024 px JPEG (Oct 30, via /debug/masks, concurrency 4): desk 2.2–3.2 s (wall 3.6 s for 4 phrases); kitchen 1.9–2.5 s (wall 2.5 s); bench 3.1–3.2 s (wall 3.3 s for 3); absent-object probe 1.7 s with 0 matches. Wall ≈ slowest single call, so concurrency works. Synthetic 512 px capture: 1.5–1.7 s.
- SAM filtering observed live (Oct 30): multi-match phrases keep the largest (bench 2→1, tree 3→1); computer mouse and small vase matches dropped under the 1% area rule; absent object returns 0 matches and is a valid skip.

## Rate limits

- SAM (Oct 30): 14 calls (12 via /debug/masks in batches up to 4 concurrent, 2 synthetic captures) — no 429s, errors, or throttling observed. Documented limits still unknown.

## Pricing

- Muse Image: $0.01 per image. Voice transcription: $0.18 per hour of audio. (SAM/Spark pricing to confirm.)

## Open questions

- Per-request caps and rate limits for SAM and Spark.
- Whether the Meta console offers a spend limit.

## Synonym-retry probe (Oct 31, P1 evaluation, not built)

- 6 zero-match phrases retried once with a simpler noun (sequential, ~2.7 s
  each): toolbox→rescued (2 matches), box→rescued (21 matches, kept largest),
  stove→rescued (1), curtain→rescued (3), table→still zero (dark lamp photo),
  mug→still zero (tiny cup). 4/6 rescued; failures look genuinely hard (dark,
  tiny), not phrasing. A single retry with a simpler synonym looks worthwhile.

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
