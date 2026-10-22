# Changelog

Notable changes to ananke. Entries are grouped by release; the top section collects what has landed since the last one.

The audience is an operator deciding whether to upgrade and what they will have to change. Behaviour changes and anything that touches an existing config belong here; refactors and internal tidying do not.

## Unreleased

### Breaking

- Placeholders are now written `${name}`, not `{name}`. The old form could not be distinguished from an argument's own braces without guessing, which made JSON arguments fail to launch and silently rewrote Jinja templates. Only `${` and `$$` are special now: a bare `{` never is, so JSON, Jinja, and format strings pass through exactly as written and need no escaping. `$$` is a literal `$`, which is how a literal `${port}` is written.

  Rename every placeholder in `command`, `shutdown_command`, `launcher`, `env` values, and `container.gpu_device`. A config still using `{name}` does not error, because the text is now literal, so confirm a service's rendered command still contains the expected value, through `GET /api/services/{name}/command` or the launch-command panel.

  An unknown name, or a `${` with no closing brace, is a config error. A known name written bare, such as `{port}`, is a warning naming the service and the entry, since it cannot be an error: a JSON or format-string argument may hold `{model}` on purpose. Write `$${model}` to say that and silence the warning.
- The per-service log socket, `/api/services/{name}/logs/stream`, is removed. Follow logs on the `/api/live` WebSocket instead, with a `follow` request whose feed is `{"kind": "logs", "service": "…"}`: pass a logs page's new `follow_after` as `after` and the follow continues exactly where the page ended, then sends new lines as they are written. A follower that falls behind rereads the store rather than dropping lines, so the old `overflow` frame has no replacement; `log_gap` reports only lines skipped when more than 1000 are pending at once.
- The `/api/events` WebSocket is removed, along with its `overflow` event and `?service=` filter. Read events through the `/api/live` WebSocket instead: subscribe to `{"kind": "events"}` for the newest 1000 events, pushed again as each one arrives, or fetch the same body from `GET /api/events/history`. Every other live resource updates on the same events.
- `GET /api/services/{name}` no longer includes `recent_logs`. Building it read the service's whole retained log on every request and on every live update to the service, and the lines it carried went stale between log writes. Fetch `GET /api/services/{name}/logs?limit=N` for the newest lines instead.

### Added

- Container workloads. Either template can run its workload in a Docker or Podman container through a `[service.container]` block, without a wrapper script. ananke owns the whole lifecycle: it creates, starts, follows logs, reads the authoritative exit status, signals, removes, and reconciles leftovers after a crash. The template still decides what argv is produced; the block decides where it runs. It covers host and bridge networking with a loopback-only publication, bind mounts with automatic path translation for llama.cpp's model fields, CDI GPU injection scoped to the devices the allocator picked, explicit environment plus a name-only passthrough allowlist, and IPC mode. See [Container Workloads](docs/configuration.md#container-workloads).
- A `combined` log stream for container output. Neither runtime's CLI documents a framing that preserves stdout from stderr across the process boundary, so container output is labelled `combined` rather than being passed off as either. Native processes keep their split streams. Available through the API, the WebSocket, `anankectl logs --stream`, and the log viewer.
- Container detail in the API and UI: runtime, image, network mode, and live container identity, alongside the exact `create` argv a service would launch with. Passthrough variables appear by name only.
- An offline config validator: `cargo run -p ananke-supervise --example validate-config -- <file>` parses, validates, and renders the create argv each containerized service would launch with. `anankectl server-config validate` needs a running daemon; this does not.
- Self-healing auto-restart. Watchdogs detect and restart a degraded running service without operator action, configured under `[service.auto_restart]` with fleet-wide defaults under `[defaults.auto_restart]`. Five triggers cover distinct failure modes:
  - Error rate, on by default.
  - Time-to-first-token stall.
  - Generation stall.
  - Speculative-decoding collapse.
  - Periodic, time-based restart.
- Anti-flap guards cap auto-restarts within a sliding window and require a minimum uptime before a fresh run can trigger. A service past its restart budget is disabled with reason `auto_restart_loop` until it is re-enabled.
- Restart history is persisted and exposed:
  - `GET /api/restarts`, paginated by service and time range.
  - The `ananke_auto_restarts_total` counter, labelled by service and trigger.
  - `auto_restarted` events carrying the trigger and the observed detail.
  - A chart in the web UI.
- ik_llama.cpp runtime selection. A `llama-cpp` service selects between mainline llama.cpp (default) and the ik_llama.cpp fork through the `runtime` field, a tagged table (`{ kind = "ik-llama", mla = 1, dsa = true, attn_max_batch = 512, runtime_repack = false }`). ananke emits the matching `-mla`, `-dsa -fidx`, `-amb`, and `-rtr` flags and the ik `--spec-type` dialect, reserves whole GPUs for an ik service under `placement = "fit"`, and reads ik_llama.cpp's quantised tensor dtypes.
- Heterogeneous GPU tensor-split. `devices.tensor_split_weights` balances layer-parallel work across unequal GPUs by weight, scaling each GPU's share and the emitted `--tensor-split` ratio.
- Automatic expert offload for MoE models. `expert_offload = "auto"` offloads whole expert layers to host RAM through llama-server's `--n-cpu-moe`, keeping attention and the KV cache on the GPU, and balances the offload across GPUs with a room-based tensor split.
- NUMA placement. The `numa` field (`distribute`, `interleave`, or `local`) passes `--numa` to llama-server for explicit thread and memory placement.
- `env_inherit` (default on) copies the daemon's environment into a spawned host child; set it off to pass only the service's explicit `env` plus `CUDA_VISIBLE_DEVICES`. A container's environment is always explicit, regardless of this flag.
- `cache_ram_mb` caps the host RAM llama-server may use for its prompt cache. The value is passed through explicitly so the packer's host reservation matches the runtime's cap; `0` disables the cache.
- The VRAM estimator adds support for the laguna, glm-dsa, deepseek4, lfm2, and gemma4 architectures, and now models host RAM, quantised KV cache, sliding-window and recurrent (hybrid) KV, tensor-split compute buffers, and speculative-decoding overhead.
- Token throughput is split into input (prompt processing) and output (decode) tokens per second, with an effective-generation figure (completion tokens over wall-clock) as the end-to-end fallback. The per-service reverse proxy records per-request token counts at the HTTP layer, and the web UI shows the split alongside the effective rate.
- A `llama-cpp` service with `modality = "embedding"` now passes `--embeddings` to llama-server, enabling its embeddings endpoint.
- A responsive web UI for small screens, with bottom-tab navigation and layouts adapted for touch and narrow viewports.
- The service memory footprint is broken out per device in both the API and the UI, showing where a service's allocation lands.
- The service detail view surfaces runtime and serving configuration (binary path, KV cache types, batch, context, and thread settings, speculative decoding, and expert-offload mode) in the API and the UI.
- A shared time-window selector across logs, per-service stats, global metrics, and the dashboard, adding a 5-minute preset and a custom absolute range.
- Chat renders LaTeX math, markdown in reasoning traces, and correctly escaped code blocks.
- `anankectl logs` accepts human-friendly `--since` and `--until` values: RFC 3339 timestamps, local datetimes and dates, or relative ages like `2h` and `30m`, in addition to epoch milliseconds.
- Llama.cpp-native endpoints on the OpenAI listener. `/tokenize`, `/detokenize`, `/apply-template`, `/completion`, `/infill`, `/embedding`, `/embeddings`, `/rerank`, `/reranking`, `/props`, `/slots`, `/slots/{id}`, `/lora-adapters`, `/health`, `/v1/health`, and `/metrics` are now served on the main inference URL and forwarded verbatim to the upstream of a `llama-cpp` template service (started on demand). A `model` field in the body selects the service; without one, the sole llama-cpp service is the target. The OpenAI-shape aliases (`/v1/*`, `/models`, `/completions`, `/chat/completions`, …) are not proxied.
- `GET /api/info` and the live `info` resource report `uptime_ms`, the time since the daemon started.

### Changed

- The reservation field `vram_gb` is renamed `reserve_gb` (with `min_reserve_gb` and `max_reserve_gb` for dynamic mode), a device-neutral name since it holds host RAM for a cpu-only service and VRAM otherwise. The old spellings are still accepted.
- The VRAM estimator's tuned constants are now derived from a measurement dataset and checked in CI, so a constant cannot drift from its evidence. An architecture the estimator is not calibrated for is refused rather than under-reserved: such a service must declare an explicit reservation (`mode` plus `reserve_gb`).
- `anankectl logs --follow` follows over `/api/live`. It now honours `--run` and `--stream` while following, no longer loses the lines written between the history fetch and the start of the follow, and reports lines it had to skip as `[N lines skipped]` on stderr. With `--json`, a follow prints each line as its own JSON object, one per line, history included. `--stream` rejects values other than `stdout`, `stderr`, and `combined` instead of silently matching nothing, and `--follow` can no longer be combined with `--until`.
- The management API returns the documented error envelope (`{"error": {"code", "message", "type"}}`) rather than a bare string, so a client can dispatch on `error.code`.

### Fixed

- A `}` with nothing to close made the placeholder scanner loop forever, hanging config load.
- A typo in an `env` or `container.env` value now fails at config load, naming the variable, rather than at the launch it breaks.
- Container removal waits for the log follower to finish, so the tail of a stopped container's output (the part saying why it stopped) is no longer lost to the removal that deletes the runtime's log store.
- A runtime that cannot be reached is no longer read as a container that is not there. Reconciliation kept deleting the record in that case, which strands a running container with nothing pointing at it. The startup leak sweep also asks every runtime the records name, rather than whichever this process defaults to: on a Podman-only host it was running `docker ps` and finding nothing.
- The daemon removes every container it owns on shutdown when a drain overruns `shutdown_timeout`, rather than exiting and leaving the workload holding its reservation.
- `pid 0` is no longer registered for memory attribution. It parents init, so attributing its descendants summed the whole machine into one service.

### Notes

- Images are not pulled or built. ananke starts and stops the image named by the service; the image must already be in the runtime's local store.
- A container cannot inherit `PR_SET_PDEATHSIG`, so one survives a `SIGKILL`ed daemon until startup reconciliation removes it. The allocator reads real free VRAM, so a survivor makes ananke conservative rather than wrong. See [What happens when ananke stops](docs/configuration.md#container-workloads).

## 0.2.0

Released before this file existed. See the git history for the changes it carried.
