//! The live session's functional core: which subscriptions a connection
//! holds, and what each inbound frame should do to them. No I/O; the
//! session shell carries out the returned [`Effect`].

use std::collections::BTreeSet;

use ananke_api::live::{LiveMessage, LiveRequest, LiveResource};

use crate::api::errors::ApiErrorCode;

/// Subscriptions one connection may hold at once.
pub(crate) const MAX_SUBSCRIPTIONS: usize = 64;

/// Longest subscription id accepted, in bytes.
pub(crate) const MAX_ID_BYTES: usize = 128;

/// What the shell must do in response to one inbound frame.
#[derive(Debug, PartialEq)]
pub(crate) enum Effect {
    /// Start a subscription task.
    Spawn { id: String, resource: LiveResource },
    /// Stop the subscription task with this id.
    Abort { id: String },
    /// Send this message and change nothing else.
    Reply(LiveMessage),
    /// Nothing to do.
    Ignore,
}

/// The ids active on one connection.
#[derive(Debug, Default)]
pub(crate) struct Session {
    ids: BTreeSet<String>,
}

impl Session {
    /// Parse and apply one text frame.
    pub(crate) fn apply_text(&mut self, text: &str) -> Effect {
        match serde_json::from_str::<LiveRequest>(text) {
            Ok(request) => self.apply(request),
            Err(e) => Effect::Reply(error_message(
                None,
                ApiErrorCode::InvalidLiveRequest {
                    reason: e.to_string(),
                },
            )),
        }
    }

    pub(crate) fn apply(&mut self, request: LiveRequest) -> Effect {
        match request {
            LiveRequest::Subscribe { id, resource } => self.subscribe(id, resource),
            LiveRequest::Cancel { id } => {
                if self.ids.remove(&id) {
                    Effect::Abort { id }
                } else {
                    Effect::Ignore
                }
            }
        }
    }

    fn subscribe(&mut self, id: String, resource: LiveResource) -> Effect {
        if id.is_empty() || id.len() > MAX_ID_BYTES {
            let reason = format!("subscription ids must be 1 to {MAX_ID_BYTES} bytes long");
            return Effect::Reply(error_message(
                Some(id),
                ApiErrorCode::InvalidLiveRequest { reason },
            ));
        }
        if self.ids.contains(&id) {
            let code = ApiErrorCode::DuplicateSubscriptionId { id: id.clone() };
            return Effect::Reply(error_message(Some(id), code));
        }
        if self.ids.len() >= MAX_SUBSCRIPTIONS {
            let code = ApiErrorCode::SubscriptionLimit {
                limit: MAX_SUBSCRIPTIONS,
            };
            return Effect::Reply(error_message(Some(id), code));
        }
        self.ids.insert(id.clone());
        Effect::Spawn { id, resource }
    }
}

/// Render an error frame for `id` carrying the code's status and envelope.
pub(crate) fn error_message(id: Option<String>, code: ApiErrorCode) -> LiveMessage {
    LiveMessage::Error {
        id,
        status: code.status().as_u16(),
        error: code.into(),
    }
}

#[cfg(test)]
mod tests {
    use ananke_api::shared::errors::ApiErrorCodeSlug;

    use super::*;

    fn subscribe(id: &str) -> LiveRequest {
        LiveRequest::Subscribe {
            id: id.into(),
            resource: LiveResource::Services,
        }
    }

    fn error_parts(effect: Effect) -> (Option<String>, u16, ApiErrorCodeSlug) {
        match effect {
            Effect::Reply(LiveMessage::Error { id, status, error }) => {
                (id, status, error.error.code)
            }
            other => panic!("expected an error reply, got {other:?}"),
        }
    }

    #[test]
    fn subscribe_spawns_and_cancel_aborts() {
        let mut session = Session::default();
        assert_eq!(
            session.apply(subscribe("a")),
            Effect::Spawn {
                id: "a".into(),
                resource: LiveResource::Services
            }
        );
        assert_eq!(
            session.apply(LiveRequest::Cancel { id: "a".into() }),
            Effect::Abort { id: "a".into() }
        );
        // A cancelled id is free to reuse.
        assert!(matches!(
            session.apply(subscribe("a")),
            Effect::Spawn { .. }
        ));
    }

    #[test]
    fn unknown_cancel_is_ignored() {
        let mut session = Session::default();
        assert_eq!(
            session.apply(LiveRequest::Cancel { id: "nope".into() }),
            Effect::Ignore
        );
    }

    #[test]
    fn duplicate_id_is_a_conflict() {
        let mut session = Session::default();
        session.apply(subscribe("a"));
        assert_eq!(
            error_parts(session.apply(subscribe("a"))),
            (
                Some("a".into()),
                409,
                ApiErrorCodeSlug::DuplicateSubscriptionId
            )
        );
    }

    #[test]
    fn the_subscription_limit_is_enforced() {
        let mut session = Session::default();
        for i in 0..MAX_SUBSCRIPTIONS {
            assert!(matches!(
                session.apply(subscribe(&i.to_string())),
                Effect::Spawn { .. }
            ));
        }
        assert_eq!(
            error_parts(session.apply(subscribe("one-more"))),
            (
                Some("one-more".into()),
                429,
                ApiErrorCodeSlug::SubscriptionLimit
            )
        );
    }

    #[test]
    fn id_length_is_bounded() {
        let mut session = Session::default();
        let (_, status, code) = error_parts(session.apply(subscribe("")));
        assert_eq!((status, code), (400, ApiErrorCodeSlug::InvalidLiveRequest));

        let long = "x".repeat(MAX_ID_BYTES + 1);
        let (_, status, _) = error_parts(session.apply(subscribe(&long)));
        assert_eq!(status, 400);
        assert!(matches!(
            session.apply(subscribe(&"x".repeat(MAX_ID_BYTES))),
            Effect::Spawn { .. }
        ));
    }

    #[test]
    fn unparseable_frames_reply_without_an_id() {
        let mut session = Session::default();
        for text in [
            "not json",
            r#"{"type":"subscribe","id":"a"}"#,
            r#"{"type":"subscribe","id":"a","resource":{"kind":"services"},"extra":1}"#,
            r#"{"type":"query","id":"a"}"#,
        ] {
            assert_eq!(
                error_parts(session.apply_text(text)),
                (None, 400, ApiErrorCodeSlug::InvalidLiveRequest),
                "{text}"
            );
        }
    }

    #[test]
    fn service_resources_parse_with_a_name() {
        let mut session = Session::default();
        assert_eq!(
            session.apply_text(
                r#"{"type":"subscribe","id":"d","resource":{"kind":"service","name":"demo"}}"#
            ),
            Effect::Spawn {
                id: "d".into(),
                resource: LiveResource::Service {
                    name: "demo".into()
                }
            }
        );
    }
}
