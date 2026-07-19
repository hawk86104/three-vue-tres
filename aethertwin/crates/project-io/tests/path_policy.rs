use project_io::{ProjectIoError, validate_relative_resource_path};
use serde_json::Value;
use std::fs;

fn assert_invalid(value: &str) {
    let error = validate_relative_resource_path(value).unwrap_err();
    assert_eq!(error.code(), "INVALID_RESOURCE_PATH", "accepted {value:?}");
}

#[test]
fn accepts_only_normalized_nonempty_project_relative_paths() {
    for valid in [
        "assets/item.png",
        "assets/models/chair.glb",
        "thumbnails/00000000-0000-4000-8000-000000000001.png",
    ] {
        validate_relative_resource_path(valid).unwrap();
    }

    for invalid in [
        "",
        ".",
        "./assets/item.png",
        "assets/./item.png",
        "assets//item.png",
        "assets/",
        "../assets/item.png",
        "assets/../item.png",
        "/assets/item.png",
        "C:/assets/item.png",
        "C:\\assets\\item.png",
        "C:assets/item.png",
        "\\\\server\\share\\item.png",
        "//server/share/item.png",
        "assets\\models/item.glb",
        "assets/models\\item.glb",
        "assets/\0item.png",
    ] {
        assert_invalid(invalid);
    }
}

#[test]
fn shared_contract_fixtures_contain_no_absolute_resource_paths() {
    let fixtures = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
    for entry in walk_files(&fixtures) {
        if entry.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let value: Value = serde_json::from_slice(&fs::read(&entry).unwrap()).unwrap();
        visit_json(&value, &mut |key, value| {
            if key == "relativePath" {
                validate_relative_resource_path(value.as_str().unwrap()).unwrap();
            }
        });
    }
}

fn walk_files(root: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(path) = pending.pop() {
        for entry in fs::read_dir(path).unwrap().map(Result::unwrap) {
            if entry.file_type().unwrap().is_dir() {
                pending.push(entry.path());
            } else {
                files.push(entry.path());
            }
        }
    }
    files
}

fn visit_json(value: &Value, visitor: &mut impl FnMut(&str, &Value)) {
    match value {
        Value::Object(object) => {
            for (key, value) in object {
                visitor(key, value);
                visit_json(value, visitor);
            }
        }
        Value::Array(values) => {
            for value in values {
                visit_json(value, visitor);
            }
        }
        _ => {}
    }
}

#[test]
fn invalid_path_uses_the_stable_public_error_variant() {
    assert_eq!(
        validate_relative_resource_path(".").unwrap_err().code(),
        ProjectIoError::InvalidResourcePath.code()
    );
}
