//! `GET /api/live` WebSocket — multiplexed, read-only subscriptions.
//!
//! A client sends [`LiveRequest`]s naming a [`LiveResource`] under an id of
//! its choosing. The daemon answers each subscription with a full snapshot
//! straight away and another whenever the resource's body changes, as a
//! [`LiveMessage`]. Every snapshot body is the same DTO the resource's HTTP
//! `GET` returns.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    devices::list::DeviceSummary,
    events::EventHistory,
    info::get::DaemonInfoResponse,
    services::{detail::ServiceDetail, list::ServicesResponse},
    shared::errors::ApiError,
};

/// A frame the client sends on `/api/live`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum LiveRequest {
    /// Start a subscription. The daemon replies with a snapshot, then with
    /// another each time the resource's body changes.
    Subscribe {
        /// A connection-local id, 1 to 128 bytes, that every reply for this
        /// subscription carries. It must not be in use on this connection.
        id: String,
        /// What to subscribe to.
        resource: LiveResource,
    },
    /// End a subscription. Unknown ids are ignored.
    Cancel {
        /// The id the subscription was started with.
        id: String,
    },
}

/// A resource a client can subscribe to on `/api/live`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum LiveResource {
    /// The body of `GET /api/services`.
    Services,
    /// The body of `GET /api/devices`.
    Devices,
    /// The body of `GET /api/events/history`.
    Events,
    /// The body of `GET /api/info`.
    Info,
    /// The body of `GET /api/services/{name}`.
    Service {
        /// The service's name.
        name: String,
    },
}

/// A frame the daemon sends on `/api/live`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LiveMessage {
    /// The full current body of a subscribed resource.
    Snapshot {
        /// The subscription's id.
        id: String,
        /// The resource body, tagged by resource kind.
        data: LiveData,
    },
    /// A subscription or protocol error. A resource error, such as an
    /// unknown service, leaves the subscription active; a later snapshot
    /// supersedes it.
    Error {
        /// The subscription the error belongs to, or `null` when the frame
        /// it answers could not be parsed.
        id: Option<String>,
        /// The HTTP status the same error would carry.
        status: u16,
        /// The standard error envelope.
        error: ApiError,
    },
}

/// A snapshot body, tagged by the resource it belongs to.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(tag = "resource", content = "body", rename_all = "snake_case")]
pub enum LiveData {
    /// A `services` snapshot.
    Services(ServicesResponse),
    /// A `devices` snapshot.
    Devices(Vec<DeviceSummary>),
    /// An `events` snapshot.
    Events(EventHistory),
    /// An `info` snapshot.
    Info(DaemonInfoResponse),
    /// A `service` snapshot.
    Service(Box<ServiceDetail>),
}
