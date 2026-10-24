//! Integration test: stopping a service while it is still Starting leaves its
//! supervisor able to start it again.
//!
//! The drain-while-starting path cancels the in-progress health probe. If that
//! cancellation outlives the aborted run, the next start's probe reports
//! `Cancelled` at once and the supervisor task exits, so every later request
//! fails with "supervisor unreachable" until the daemon restarts.
#![cfg(feature = "test-fakes")]

mod common;

use std::{sync::atomic::Ordering, time::Duration};

use ananke::{
    api::management::router,
    supervise::{EnsureSource, state::ServiceState},
};
use ananke_api::services::StartResponse;
use axum::{body::to_bytes, http::StatusCode};
use common::{build_harness, minimal_llama_service};
use tower::util::ServiceExt;

async fn post(app: &axum::Router, uri: &str) -> (StatusCode, Vec<u8>) {
    let req = axum::http::Request::builder()
        .method("POST")
        .uri(uri)
        .body(axum::body::Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    (status, bytes.to_vec())
}

#[tokio::test(flavor = "multi_thread")]
async fn stop_while_starting_then_start_succeeds() {
    let h = build_harness(vec![minimal_llama_service("demo", 0)]).await;
    let app = router(h.state.clone());
    let handle = h.supervisors[0].clone();

    // Health never passes, so the first start parks in Starting.
    h.echo_state.unhealthy.store(true, Ordering::Relaxed);
    let first = handle
        .ensure(EnsureSource::UserRequest)
        .await
        .expect("supervisor answers the first ensure");
    drop(first);
    tokio::time::timeout(Duration::from_secs(5), async {
        while handle.peek_state() != ServiceState::Starting {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("service reaches Starting");

    let (status, _) = post(&app, "/api/services/demo/stop").await;
    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(handle.peek_state(), ServiceState::Idle);

    // The child is healthy now; a fresh start must reach Running.
    h.echo_state.unhealthy.store(false, Ordering::Relaxed);
    let (status, body) = post(&app, "/api/services/demo/start").await;
    assert_eq!(
        status,
        StatusCode::ACCEPTED,
        "start after stop-while-starting failed: {}",
        String::from_utf8_lossy(&body)
    );
    let parsed: StartResponse = serde_json::from_slice(&body).unwrap();
    assert!(
        matches!(parsed, StartResponse::Started { .. }),
        "unexpected start response: {parsed:?}"
    );
    assert_eq!(handle.peek_state(), ServiceState::Running);

    h.cleanup().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn disable_while_starting_then_enable_and_start_succeeds() {
    let h = build_harness(vec![minimal_llama_service("demo", 0)]).await;
    let app = router(h.state.clone());
    let handle = h.supervisors[0].clone();

    h.echo_state.unhealthy.store(true, Ordering::Relaxed);
    drop(handle.ensure(EnsureSource::UserRequest).await);
    tokio::time::timeout(Duration::from_secs(5), async {
        while handle.peek_state() != ServiceState::Starting {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("service reaches Starting");

    let (status, _) = post(&app, "/api/services/demo/disable").await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = post(&app, "/api/services/demo/enable").await;
    assert_eq!(status, StatusCode::OK);

    h.echo_state.unhealthy.store(false, Ordering::Relaxed);
    let (status, body) = post(&app, "/api/services/demo/start").await;
    assert_eq!(
        status,
        StatusCode::ACCEPTED,
        "start after disable-while-starting failed: {}",
        String::from_utf8_lossy(&body)
    );
    assert_eq!(handle.peek_state(), ServiceState::Running);

    h.cleanup().await;
}
