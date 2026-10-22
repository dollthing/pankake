//! `GET /api/services/{name}/logs/stream` WebSocket — live log tail for a single service.

use std::{sync::Arc, time::Duration};

use ananke_api::services::logs_stream::LogStreamMessage;
use ananke_db::logs::LogBatch;
use axum::{
    extract::{Path, State, WebSocketUpgrade, ws::Message},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use smol_str::SmolStr;
use tokio::{select, sync::broadcast::error::RecvError};
use tracing::warn;

use crate::{
    api::{errors::ApiErrorCode, management::origin::same_origin},
    daemon::app_state::AppState,
};

pub async fn get_logs_ws(
    State(state): State<AppState>,
    Path(name): Path<String>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !same_origin(&headers) {
        return (
            StatusCode::FORBIDDEN,
            "logs: the WebSocket origin does not match the host",
        )
            .into_response();
    }
    let service_id = match resolve_service_id(&state, &name).await {
        Some(id) => id,
        None => {
            return ApiErrorCode::ServiceNotFound {
                name: SmolStr::new(&name),
            }
            .into_response();
        }
    };

    let rx = state.batcher.subscribe();
    ws.on_upgrade(move |socket| serve_logs(socket, service_id, rx))
}

async fn serve_logs(
    mut socket: axum::extract::ws::WebSocket,
    service_id: i64,
    mut rx: tokio::sync::broadcast::Receiver<Arc<LogBatch>>,
) {
    loop {
        select! {
            recv = rx.recv() => match recv {
                Ok(batch) => {
                    for line in batch.for_service(service_id) {
                        let msg = LogStreamMessage::Line(line.clone());
                        let json = match serde_json::to_string(&msg) {
                            Ok(s) => s,
                            Err(e) => { warn!(error = %e, "log line serialise failed"); continue; }
                        };
                        if socket.send(Message::Text(json)).await.is_err() { return; }
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    let msg = LogStreamMessage::Overflow { dropped: n };
                    if let Ok(s) = serde_json::to_string(&msg)
                        && socket.send(Message::Text(s)).await.is_err()
                    {
                        return;
                    }
                }
                Err(RecvError::Closed) => return,
            },
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => return,
                    Some(Ok(Message::Ping(p))) => {
                        let _ = socket.send(Message::Pong(p)).await;
                    }
                    _ => {}
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(30)) => {
                // Heartbeat; keeps intermediaries from closing an idle WS.
                if socket.send(Message::Ping(vec![])).await.is_err() { return; }
            }
        }
    }
}

async fn resolve_service_id(state: &AppState, name: &str) -> Option<i64> {
    state.db.resolve_service_id(name).await.ok().flatten()
}
