//! Normal stops inherit an explicit grace; omitted settings retain 10 seconds.
use std::path::Path;

use ananke_config::load_config_from_str;

const SERVICE: &str = r#"
[[service]]
name = "slow"
template = "command"
command = ["fake"]
port = 8001
allocation = { mode = "static", reserve_gb = 1 }
"#;

#[test]
fn stop_grace_default_override_and_invalid_duration() {
    let parse = |setting: &str| {
        load_config_from_str(&format!("{SERVICE}{setting}\n"), Path::new("/config.toml"))
    };
    assert_eq!(parse("").unwrap().0.services[0].stop_grace_ms, 10_000);
    assert_eq!(
        parse("stop_grace = \"45s\"").unwrap().0.services[0].stop_grace_ms,
        45_000
    );
    assert!(
        parse("stop_grace = \"invalid\"")
            .unwrap_err()
            .to_string()
            .contains("stop_grace")
    );
}

#[test]
fn stop_grace_inherits_and_can_be_overridden() {
    let source = format!(
        r#"{SERVICE}
stop_grace = "45s"
[[service]]
name = "inherited"
template = "command"
extends = "slow"
port = 8002
[[service]]
name = "overridden"
template = "command"
extends = "slow"
port = 8003
stop_grace = "20s"
"#
    );
    let config = load_config_from_str(&source, Path::new("/config.toml"))
        .unwrap()
        .0;
    assert_eq!(
        config
            .services
            .iter()
            .find(|s| s.name == "inherited")
            .unwrap()
            .stop_grace_ms,
        45_000
    );
    assert_eq!(
        config
            .services
            .iter()
            .find(|s| s.name == "overridden")
            .unwrap()
            .stop_grace_ms,
        20_000
    );
}
