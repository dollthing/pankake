The `/api/live` WebSocket carries read-only, multiplexed subscriptions to the management API's live state. The embedded frontend reads everything except logs through it. Each subscription delivers a full snapshot of its resource straight away, then another whenever something the resource depends on changes and the new body differs from the last one sent. Snapshot bodies are the same DTOs the resource's HTTP `GET` returns, so a client can load over HTTP and switch to the socket, or fall back to HTTP while the socket is down.

The socket carries no commands. Starting, stopping, and editing config stay on their HTTP endpoints; the resulting state changes arrive as snapshots.

### Requests

The client sends JSON text frames, each a `LiveRequest`. The `id` is chosen by the client, is 1 to 128 bytes long, and must not already be active on the connection.

```json
{"type": "subscribe", "id": "services", "resource": {"kind": "services"}}
{"type": "subscribe", "id": "detail:demo", "resource": {"kind": "service", "name": "demo"}}
{"type": "cancel", "id": "detail:demo"}
```

Cancelling an unknown id does nothing.

### Resources

| Resource | Body | Pushed when |
| --- | --- | --- |
| `{"kind": "services"}` | `GET /api/services` | any event, a device sample, an in-flight count change, an activity stamp, or a supervisor's state, run id, or pid changing |
| `{"kind": "service", "name": "…"}` | `GET /api/services/{name}` | the same as `services`, with events limited to that service and config reloads |
| `{"kind": "devices"}` | `GET /api/devices` | a device sample, an `allocation_changed` event, or a config reload |
| `{"kind": "events"}` | `GET /api/events/history` | any event |
| `{"kind": "info"}` | `GET /api/info` | a config reload |

"Pushed when" lists what makes the daemon recompute the body; it sends the result only if it differs byte for byte from the previous frame for that subscription. Changes within 100 ms of each other are coalesced into one recompute. A `services` subscription recomputes on every device sample (about every 2 seconds), so fit verdicts and free memory follow the hardware even when no event fires.

### Messages

The daemon sends JSON text frames, each a `LiveMessage`.

A snapshot carries the subscription id and a body tagged with its resource:

```json
{"type": "snapshot", "id": "services", "data": {"resource": "services", "body": {"services": [], "openai_api_port": 7070}}}
```

An error carries the subscription id, the HTTP status the same error would have, and the standard error envelope:

```json
{"type": "error", "id": "detail:ghost", "status": 404, "error": {"error": {"code": "service_not_found", "message": "service `ghost` not found", "type": "invalid_request_error"}}}
```

A resource error such as `service_not_found` leaves the subscription active: a config reload can make the name valid, and the next snapshot supersedes the error. Protocol errors use `invalid_live_request` (400; `id` is `null` when the frame could not be parsed), `duplicate_subscription_id` (409), and `subscription_limit` (429).

### Limits and keepalive

A connection holds at most 64 subscriptions. Inbound frames are capped at 64 KiB. Outbound frames queue in a bounded buffer; if one takes more than 10 seconds to send, the daemon closes the connection with code 1008. The daemon sends a Ping every 30 seconds and answers Pings with Pongs.

### Origin

A handshake with an `Origin` header must match the `Host` header in scheme, host, and port, or it is refused with 403. This stops pages on other sites from reading the daemon's state through a visitor's browser. Clients that send no `Origin`, such as `anankectl` and scripts, are allowed.

### Reconnecting

Subscriptions do not survive a disconnect. A client reconnects with backoff and subscribes again; the first frame for each subscription is a full snapshot, so nothing needs replaying.
