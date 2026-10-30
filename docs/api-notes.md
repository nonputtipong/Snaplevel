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

## Unverified

- Whether SAM masks are cropped to their box and what offset places them (verify by overlaying the SVG path on the photo).
- Exact Spark vision request shape in the Responses API.
- Whether Muse Image restyle keeps object geometry stable enough to reuse the original polygons.

## Latency

- Text smoke call (5-word reply): ~27 s wall time (Oct 30; first request, may include cold start).

## Rate limits

- (None observed yet.)

## Pricing

- Muse Image: $0.01 per image. Voice transcription: $0.18 per hour of audio. (SAM/Spark pricing to confirm.)

## Open questions

- Per-request caps and rate limits for SAM and Spark.
- Whether the Meta console offers a spend limit.

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
