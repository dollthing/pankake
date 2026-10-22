//! Pure mappings from a validated service config to the detail DTOs.

use ananke_api::services::detail::{IkParams, RuntimeInfo, ServingConfig};

use crate::config::{OffloadMode, ServiceConfig};

/// Which llama-server implementation serves a llama-cpp service, plus
/// the fork-specific parameters when it is not mainline. Computed for the
/// detail view so the frontend can render a runtime card without a spawn.
pub(crate) fn runtime_info(svc_cfg: &ServiceConfig) -> Option<RuntimeInfo> {
    let lc = svc_cfg.llama_cpp()?;
    let ik = match lc.runtime.ik() {
        None => {
            return Some(RuntimeInfo {
                kind: "llama-cpp".into(),
                ik: None,
            });
        }
        Some(ik) => ik,
    };
    Some(RuntimeInfo {
        kind: "ik-llama".into(),
        ik: Some(IkParams {
            mla: ik.mla,
            dsa: ik.dsa,
            attn_max_batch: ik.attn_max_batch,
            runtime_repack: ik.runtime_repack,
        }),
    })
}

/// Curated serving knobs for the detail view, including the derived
/// per-slot context (`context / parallel` under a statically-split KV
/// pool — the number that actually bounds a request, and one no single
/// config key states).
pub(crate) fn serving_config(svc_cfg: &ServiceConfig) -> Option<ServingConfig> {
    let lc = svc_cfg.llama_cpp()?;
    let parallel = lc.parallel.unwrap_or(1);
    let kv_unified = lc.kv_unified.unwrap_or(false);
    let effective_context_per_slot = lc
        .context
        .and_then(|c| (parallel > 1 && !kv_unified).then_some(c / parallel.max(1)));
    Some(ServingConfig {
        binary: lc.binary.to_string_lossy().into_owned(),
        cache_type_k: lc.cache_type_k.as_deref().unwrap_or("f16").to_string(),
        cache_type_v: lc.cache_type_v.as_deref().unwrap_or("f16").to_string(),
        flash_attn: lc.flash_attn.unwrap_or(false),
        parallel,
        kv_unified,
        effective_context_per_slot,
        spec_type: lc.spec_type.as_deref().map(str::to_string),
        draft_model: lc
            .draft_model
            .as_deref()
            .and_then(|p| p.file_name().map(|f| f.to_string_lossy().into_owned())),
        expert_offload: match lc.expert_offload {
            OffloadMode::Off => "off".to_string(),
            OffloadMode::Auto => "auto".to_string(),
            OffloadMode::Layers(n) => format!("{n} layers"),
        },
        batch_size: lc.batch_size,
        ubatch_size: lc.ubatch_size,
        threads: lc.threads,
        threads_batch: lc.threads_batch,
        numa: lc.numa.map(|n| n.as_flag().to_string()),
        mmap: lc.mmap.unwrap_or(true),
        mlock: lc.mlock.unwrap_or(false),
    })
}
