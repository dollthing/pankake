//! `/api/events` endpoints — the system-wide event bus and its history.

pub mod history;
pub mod stream;

pub use history::EventHistory;

pub use crate::internal::event::Event;
