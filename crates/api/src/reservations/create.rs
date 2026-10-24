//! `POST /api/reservations` — place a manual reservation.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::reservations::list::ManualReservation;

/// Request body for `POST /api/reservations`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateReservationRequest {
    /// Bytes to reserve per device id (`"cpu"` or `"gpu:N"`). At least one
    /// device; each amount is rounded up to a whole MiB.
    pub devices: BTreeMap<String, u64>,
    /// Free-form label naming what the memory is for.
    #[serde(default)]
    pub label: Option<String>,
    /// Eviction priority, as for a service. Placing the reservation evicts
    /// services through the same rules a service start uses: idle services
    /// may be evicted, busy ones only from a strictly higher priority.
    /// Defaults to the service default.
    #[serde(default)]
    pub priority: Option<u8>,
}

/// Response from `POST /api/reservations`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub struct CreateReservationResponse {
    /// The reservation as stored.
    pub reservation: ManualReservation,
    /// Services evicted to make room, in eviction order. The response is
    /// sent once they have stopped.
    pub evicted: Vec<String>,
}
