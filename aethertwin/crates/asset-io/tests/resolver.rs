use asset_io::{AssetIssue, AssetResolver};
use project_io::{AssetRecord, ProjectSnapshot};
use sha2::{Digest, Sha256};
use std::{fs, sync::Arc};
use tempfile::tempdir;
use uuid::Uuid;

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn asset(bytes: &[u8], media_type: &str) -> AssetRecord {
    let sha256 = digest(bytes);
    let extension = match media_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/svg+xml" => "svg",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        _ => panic!("unsupported test media type"),
    };
    AssetRecord {
        id: Uuid::new_v4(),
        relative_path: format!("assets/sha256/{}/{sha256}.{extension}", &sha256[..2]),
        sha256,
        media_type: media_type.into(),
        size: bytes.len() as u64,
    }
}

fn snapshot_with(asset: AssetRecord) -> ProjectSnapshot {
    let mut snapshot: ProjectSnapshot =
        serde_json::from_str(include_str!("../../../fixtures/contracts/snapshot.v3.json")).unwrap();
    snapshot.assets = vec![asset];
    snapshot
}

fn publish(root: &std::path::Path, asset: &AssetRecord, bytes: &[u8]) {
    let destination = root.join(&asset.relative_path);
    fs::create_dir_all(destination.parent().unwrap()).unwrap();
    fs::write(destination, bytes).unwrap();
}

#[test]
fn verifies_once_reuses_the_cached_handle_and_reads_by_offset() {
    let temp = tempdir().unwrap();
    let bytes = b"0123456789";
    let asset = asset(bytes, "image/png");
    publish(temp.path(), &asset, bytes);
    let snapshot = snapshot_with(asset.clone());
    let session_id = Uuid::new_v4();
    let resolver = AssetResolver::default();

    let first = resolver
        .resolve(session_id, temp.path(), &snapshot, asset.id)
        .unwrap();
    let second = resolver
        .resolve(session_id, temp.path(), &snapshot, asset.id)
        .unwrap();

    assert!(Arc::ptr_eq(&first, &second));
    assert_eq!(first.media_type(), "image/png");
    assert_eq!(first.len(), bytes.len() as u64);
    assert_eq!(first.read_range(3, 4).unwrap(), b"3456");
    assert_eq!(first.read_range(0, bytes.len() as u64).unwrap(), bytes);
}

#[test]
fn rejects_unknown_assets_and_rederives_the_canonical_path_from_record_identity() {
    let temp = tempdir().unwrap();
    let bytes = b"canonical";
    let mut asset = asset(bytes, "image/png");
    let canonical_relative_path = asset.relative_path.clone();
    let outside = temp.path().join("private-native-path.png");
    fs::write(&outside, b"outside").unwrap();
    asset.relative_path = "../private-native-path.png".into();
    let canonical = temp.path().join(canonical_relative_path);
    fs::create_dir_all(canonical.parent().unwrap()).unwrap();
    fs::write(&canonical, bytes).unwrap();
    let snapshot = snapshot_with(asset.clone());
    let resolver = AssetResolver::default();
    let session_id = Uuid::new_v4();

    assert_eq!(
        resolver
            .resolve(session_id, temp.path(), &snapshot, Uuid::new_v4())
            .unwrap_err(),
        AssetIssue::NotFound
    );
    let resolved = resolver
        .resolve(session_id, temp.path(), &snapshot, asset.id)
        .unwrap();
    assert_eq!(resolved.read_range(0, bytes.len() as u64).unwrap(), bytes);
    assert_eq!(fs::read(outside).unwrap(), b"outside");
}

#[test]
fn reports_missing_non_regular_and_size_mismatch_without_leaking_paths() {
    let temp = tempdir().unwrap();
    let bytes = b"expected";
    let asset = asset(bytes, "image/png");
    let snapshot = snapshot_with(asset.clone());
    let resolver = AssetResolver::default();
    let session_id = Uuid::new_v4();

    assert_eq!(
        resolver
            .resolve(session_id, temp.path(), &snapshot, asset.id)
            .unwrap_err(),
        AssetIssue::Missing
    );

    let destination = temp.path().join(&asset.relative_path);
    fs::create_dir_all(&destination).unwrap();
    assert_eq!(
        resolver
            .resolve(session_id, temp.path(), &snapshot, asset.id)
            .unwrap_err(),
        AssetIssue::NotRegularFile
    );

    fs::remove_dir(&destination).unwrap();
    fs::write(&destination, b"wrong length").unwrap();
    let error = resolver
        .resolve(session_id, temp.path(), &snapshot, asset.id)
        .unwrap_err();
    assert_eq!(error, AssetIssue::SizeMismatch);
    assert!(!format!("{error:?}").contains(&temp.path().to_string_lossy().to_string()));
}

#[test]
fn detects_same_size_digest_corruption_before_serving_any_bytes() {
    let temp = tempdir().unwrap();
    let bytes = b"good";
    let asset = asset(bytes, "image/png");
    publish(temp.path(), &asset, b"evil");
    let snapshot = snapshot_with(asset.clone());
    let resolver = AssetResolver::default();

    assert_eq!(
        resolver
            .resolve(Uuid::new_v4(), temp.path(), &snapshot, asset.id)
            .unwrap_err(),
        AssetIssue::DigestMismatch
    );
}

#[test]
fn cached_handle_survives_destination_replacement_without_serving_replacement_bytes() {
    let temp = tempdir().unwrap();
    let bytes = b"verified";
    let asset = asset(bytes, "image/png");
    publish(temp.path(), &asset, bytes);
    let snapshot = snapshot_with(asset.clone());
    let resolver = AssetResolver::default();
    let session_id = Uuid::new_v4();
    let verified = resolver
        .resolve(session_id, temp.path(), &snapshot, asset.id)
        .unwrap();
    let destination = temp.path().join(&asset.relative_path);

    #[cfg(windows)]
    {
        assert!(
            fs::remove_file(&destination).is_err(),
            "verified handles must deny delete sharing on Windows"
        );
    }
    #[cfg(not(windows))]
    {
        fs::remove_file(&destination).unwrap();
        fs::write(&destination, b"replaced").unwrap();
    }

    assert_eq!(verified.read_range(0, bytes.len() as u64).unwrap(), bytes);
}

#[test]
fn preflight_reports_only_cheap_degraded_issues_and_structural_state_stays_usable() {
    let temp = tempdir().unwrap();
    let missing = asset(b"missing", "image/png");
    let wrong_size = asset(b"right", "image/jpeg");
    publish(temp.path(), &wrong_size, b"bad");
    let mut snapshot = snapshot_with(missing.clone());
    snapshot.assets.push(wrong_size.clone());
    let resolver = AssetResolver::default();

    let issues = resolver.preflight(Uuid::new_v4(), temp.path(), &snapshot);
    assert_eq!(issues.len(), 2);
    assert_eq!(issues[0].asset_id, missing.id);
    assert_eq!(issues[0].issue, AssetIssue::Missing);
    assert_eq!(issues[1].asset_id, wrong_size.id);
    assert_eq!(issues[1].issue, AssetIssue::SizeMismatch);
    assert_eq!(snapshot.project.name, "Demo");
}

#[test]
fn reconcile_and_session_invalidation_close_only_stale_cached_handles() {
    let temp = tempdir().unwrap();
    let first_bytes = b"first";
    let second_bytes = b"second";
    let first = asset(first_bytes, "image/png");
    let second = asset(second_bytes, "image/jpeg");
    publish(temp.path(), &first, first_bytes);
    publish(temp.path(), &second, second_bytes);
    let mut snapshot = snapshot_with(first.clone());
    snapshot.assets.push(second.clone());
    let session_id = Uuid::new_v4();
    let resolver = AssetResolver::default();
    let first_handle = resolver
        .resolve(session_id, temp.path(), &snapshot, first.id)
        .unwrap();
    let second_handle = resolver
        .resolve(session_id, temp.path(), &snapshot, second.id)
        .unwrap();

    let mut changed = snapshot.clone();
    changed.assets.remove(0);
    resolver.reconcile_session(session_id, &changed);
    let still_cached = resolver
        .resolve(session_id, temp.path(), &changed, second.id)
        .unwrap();
    assert!(Arc::ptr_eq(&second_handle, &still_cached));
    assert_eq!(
        resolver
            .resolve(session_id, temp.path(), &changed, first.id)
            .unwrap_err(),
        AssetIssue::NotFound
    );

    let replacement_bytes = b"new-second";
    let mut replacement = asset(replacement_bytes, "image/jpeg");
    replacement.id = second.id;
    changed.assets[0] = replacement.clone();
    resolver.reconcile_session(session_id, &changed);
    drop(still_cached);
    drop(second_handle);
    let old_destination = temp.path().join(&second.relative_path);
    fs::remove_file(old_destination).unwrap();
    publish(temp.path(), &replacement, replacement_bytes);
    let replaced = resolver
        .resolve(session_id, temp.path(), &changed, replacement.id)
        .unwrap();
    assert_eq!(
        replaced
            .read_range(0, replacement_bytes.len() as u64)
            .unwrap(),
        replacement_bytes
    );

    resolver.invalidate_session(session_id);
    let reopened = resolver
        .resolve(session_id, temp.path(), &changed, replacement.id)
        .unwrap();
    assert!(!Arc::ptr_eq(&replaced, &reopened));
    drop(first_handle);
}
