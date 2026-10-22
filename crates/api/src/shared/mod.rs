//! Types shared across multiple endpoints — error envelopes, metadata
//! passthrough, model modality, and service state.

pub mod errors;
pub mod metadata;
pub mod modality;
pub mod service_state;

pub use metadata::AnankeMetadata;
pub use modality::Modality;
pub use service_state::{DisableReason, ServiceStateKind};
