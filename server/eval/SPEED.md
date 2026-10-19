# Speed, load and fuzz

Measured 2026-10-19 with `node scripts/bench.mjs` against a local server (11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz, 4 threads, 12 GB, Node v24.19.0, win32). Every number is a full MCP round trip over Streamable HTTP, the way an Alexa+ host calls the add-on: request out, answer back. Amazon's MCP Toolkit budget is 500 ms per tool call.

## Every tool (20 scripted evenings)

**520 calls: p50 16 ms, p95 19 ms, slowest 28 ms. Every tool under 500 ms at p95.** Connecting (MCP initialize) p50 11 ms, p95 64 ms. No tool errors.

| Tool | Calls | p50 | p95 | Slowest |
|---|---|---|---|---|
| `order_dinner` | 20 | 17 ms | 23 ms | 23 ms |
| `start_handoff` | 20 | 18 ms | 22 ms | 22 ms |
| `door_check` | 20 | 19 ms | 21 ms | 21 ms |
| `log_event` | 40 | 17 ms | 20 ms | 21 ms |
| `end_handoff` | 20 | 17 ms | 19 ms | 19 ms |
| `check_parent_answer` | 20 | 17 ms | 19 ms | 19 ms |
| `tonight_plan` | 20 | 16 ms | 19 ms | 19 ms |
| `home_screen` | 40 | 16 ms | 19 ms | 19 ms |
| `pay_sitter` | 20 | 16 ms | 19 ms | 19 ms |
| `ask_house` | 40 | 16 ms | 19 ms | 19 ms |
| `ask_parent` | 20 | 16 ms | 18 ms | 18 ms |
| `order_status` | 20 | 16 ms | 18 ms | 18 ms |
| `request_order` | 20 | 16 ms | 18 ms | 18 ms |
| `emergency_step` | 40 | 16 ms | 18 ms | 28 ms |
| `where_is` | 20 | 15 ms | 18 ms | 18 ms |
| `emergency_status` | 20 | 16 ms | 17 ms | 17 ms |
| `teachback` | 80 | 14 ms | 17 ms | 18 ms |
| `emergency` | 20 | 15 ms | 17 ms | 17 ms |
| `play_message` | 20 | 13 ms | 16 ms | 16 ms |

Not timed here: `import_note` (it reads a parent's note with Gemini, so it's Google's speed, not ours) and `ask_parent_and_wait` (it waits for a person by design).

## Load

2000 calls from 50 MCP sessions at once, spread over 8 houses (a mix of asking, the home screen, the plan, the door and the log): **239 calls a second, p50 185 ms, p95 256 ms, p99 325 ms, 0 errors.**

## Fuzz

1500 malformed or hostile requests to one session: broken JSON, wrong JSON-RPC, unknown tools and methods, wrong types, 200 KB and 5 MB strings, control characters, script and SQL text, `__proto__` keys, deep nesting, batches, wrong content types. **0 server errors (5xx) or dropped connections.** (The demo server also limits new houses to 30 a minute, so a script can't fill it for everyone; that limit is why these runs share 8 houses.) Responses by status: 200 × 699, 202 × 31, 400 × 673, 413 × 24, 415 × 73. Afterwards the server still answered "Where is the EpiPen?" correctly: **yes**.
