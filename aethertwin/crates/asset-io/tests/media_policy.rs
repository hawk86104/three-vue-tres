use asset_io::{AssetMediaFacts, AssetMediaType, ImportStage, inspect_asset_media};

const MAX_RASTER_BYTES: u64 = 256 * 1024 * 1024;
const MAX_SVG_BYTES: u64 = 32 * 1024 * 1024;
const MAX_VIDEO_BYTES: u64 = 4 * 1024 * 1024 * 1024;

fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend_from_slice(&13_u32.to_be_bytes());
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
    bytes.extend_from_slice(&[0; 4]);
    bytes.extend_from_slice(&0_u32.to_be_bytes());
    bytes.extend_from_slice(b"IEND");
    bytes.extend_from_slice(&[0; 4]);
    bytes
}

fn jpeg(marker: u8, width: u16, height: u16) -> Vec<u8> {
    let mut bytes = vec![0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, marker, 0, 17, 8];
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&[3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9]);
    bytes
}

fn mp4() -> Vec<u8> {
    let mut bytes = 24_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(b"ftypisom");
    bytes.extend_from_slice(&0_u32.to_be_bytes());
    bytes.extend_from_slice(b"isomiso2");
    bytes
}

fn webm() -> Vec<u8> {
    vec![0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00]
}

fn svg() -> Vec<u8> {
    br#"<svg width="1" height="1"/>"#.to_vec()
}

fn assert_code<T: std::fmt::Debug>(result: Result<T, asset_io::AssetIoError>, code: &str) {
    let error = result.unwrap_err();
    assert_eq!(error.code(), code, "unexpected error: {error:?}");
}

#[test]
fn progress_stage_contract_exactly_matches_typescript() {
    let stages = [
        ImportStage::Capture,
        ImportStage::Validate,
        ImportStage::Hash,
        ImportStage::Publish,
        ImportStage::Complete,
    ];
    assert_eq!(
        stages.map(ImportStage::as_str),
        ["capture", "validate", "hash", "publish", "complete"]
    );
}

#[test]
fn recognizes_each_supported_signature_and_canonical_extension() {
    let png = png(640, 480);
    let jpeg = jpeg(0xc0, 320, 200);
    let svg = svg();
    let mp4 = mp4();
    let webm = webm();
    let cases = [
        (
            "PLAN.PNG",
            png.as_slice(),
            AssetMediaType::Png,
            "png",
            AssetMediaFacts::Image {
                width: 640,
                height: 480,
            },
        ),
        (
            "photo.jpg",
            jpeg.as_slice(),
            AssetMediaType::Jpeg,
            "jpg",
            AssetMediaFacts::Image {
                width: 320,
                height: 200,
            },
        ),
        (
            "drawing.svg",
            svg.as_slice(),
            AssetMediaType::Svg,
            "svg",
            AssetMediaFacts::Image {
                width: 1,
                height: 1,
            },
        ),
        (
            "clip.mp4",
            mp4.as_slice(),
            AssetMediaType::Mp4,
            "mp4",
            AssetMediaFacts::Video,
        ),
        (
            "clip.webm",
            webm.as_slice(),
            AssetMediaType::Webm,
            "webm",
            AssetMediaFacts::Video,
        ),
    ];
    for (name, probe, media_type, extension, facts) in cases {
        let inspected = inspect_asset_media(name, probe.len() as u64, probe).unwrap();
        assert_eq!(
            (
                inspected.media_type,
                inspected.canonical_extension,
                inspected.facts
            ),
            (media_type, extension, facts)
        );
    }
}

#[test]
fn rejects_unsupported_or_truncated_signatures() {
    for (name, bytes) in [
        ("asset.gif", b"GIF89a".as_slice()),
        ("asset.png", b"\x89PNG".as_slice()),
        ("asset.jpg", b"\xff\xd8\xff".as_slice()),
        ("asset.mp4", b"\0\0\0\x18fty".as_slice()),
        ("asset.webm", b"\x1a\x45\xdf".as_slice()),
    ] {
        assert_code(
            inspect_asset_media(name, bytes.len() as u64, bytes),
            "UNSUPPORTED_ASSET_TYPE",
        );
    }
}

#[test]
fn rejects_every_extension_signature_mismatch() {
    let png = png(1, 1);
    let jpeg = jpeg(0xc0, 1, 1);
    let svg = svg();
    let mp4 = mp4();
    let webm = webm();
    for (name, bytes) in [
        ("wrong.jpg", png.as_slice()),
        ("wrong.png", jpeg.as_slice()),
        ("wrong.png", svg.as_slice()),
        ("wrong.webm", mp4.as_slice()),
        ("wrong.mp4", webm.as_slice()),
        ("wrong.jpeg", jpeg.as_slice()),
        ("no-extension", png.as_slice()),
    ] {
        assert_code(
            inspect_asset_media(name, bytes.len() as u64, bytes),
            "ASSET_EXTENSION_SIGNATURE_MISMATCH",
        );
    }
}

#[test]
fn enforces_inclusive_media_byte_limits() {
    let png = png(1, 1);
    let svg = svg();
    let mp4 = mp4();
    let webm = webm();
    for (name, maximum, bytes) in [
        ("asset.png", MAX_RASTER_BYTES, png.as_slice()),
        ("asset.svg", MAX_SVG_BYTES, svg.as_slice()),
        ("asset.mp4", MAX_VIDEO_BYTES, mp4.as_slice()),
        ("asset.webm", MAX_VIDEO_BYTES, webm.as_slice()),
    ] {
        inspect_asset_media(name, maximum, bytes).unwrap();
        assert_code(
            inspect_asset_media(name, maximum + 1, bytes),
            "ASSET_TOO_LARGE",
        );
    }
}

#[test]
fn parses_png_ihdr_dimensions_and_rejects_unsafe_boundaries() {
    for (width, height) in [(1, 1), (16_384, 16_384), (16_384, 1)] {
        let bytes = png(width, height);
        assert_eq!(
            inspect_asset_media("asset.png", bytes.len() as u64, &bytes)
                .unwrap()
                .facts,
            AssetMediaFacts::Image { width, height }
        );
    }
    for (width, height) in [(0, 1), (1, 0), (16_385, 1), (1, 16_385)] {
        let bytes = png(width, height);
        assert_code(
            inspect_asset_media("asset.png", bytes.len() as u64, &bytes),
            "INVALID_ASSET_IMAGE_DIMENSIONS",
        );
    }
    let mut malformed = png(1, 1);
    malformed[8..12].copy_from_slice(&12_u32.to_be_bytes());
    assert_code(
        inspect_asset_media("asset.png", malformed.len() as u64, &malformed),
        "UNSUPPORTED_ASSET_TYPE",
    );
    let mut not_first = png(1, 1);
    not_first[12..16].copy_from_slice(b"IDAT");
    assert_code(
        inspect_asset_media("asset.png", not_first.len() as u64, &not_first),
        "UNSUPPORTED_ASSET_TYPE",
    );
}

#[test]
fn parses_baseline_and_progressive_jpeg_sof_and_rejects_malformed_segments() {
    for marker in [0xc0, 0xc1, 0xc2, 0xc9, 0xca] {
        let bytes = jpeg(marker, 16_384, 1);
        assert_eq!(
            inspect_asset_media("asset.jpg", bytes.len() as u64, &bytes)
                .unwrap()
                .facts,
            AssetMediaFacts::Image {
                width: 16_384,
                height: 1
            }
        );
    }
    for bytes in [jpeg(0xc0, 0, 1), jpeg(0xc0, 1, 0), jpeg(0xc0, 16_385, 1)] {
        assert_code(
            inspect_asset_media("asset.jpg", bytes.len() as u64, &bytes),
            "INVALID_ASSET_IMAGE_DIMENSIONS",
        );
    }
    let mut bad_length = jpeg(0xc0, 1, 1);
    bad_length[10] = 0;
    bad_length[11] = 1;
    assert_code(
        inspect_asset_media("asset.jpg", bad_length.len() as u64, &bad_length),
        "UNSUPPORTED_ASSET_TYPE",
    );
}

#[test]
fn validates_mp4_ftyp_box_and_webm_ebml_header() {
    let mut short_box = mp4();
    short_box[0..4].copy_from_slice(&7_u32.to_be_bytes());
    let mut oversized_box = mp4();
    oversized_box[0..4].copy_from_slice(&128_u32.to_be_bytes());
    let wrong_box = b"\0\0\0\x0cmoovdata";
    for (name, bytes) in [
        ("asset.mp4", short_box.as_slice()),
        ("asset.mp4", oversized_box.as_slice()),
        ("asset.mp4", wrong_box.as_slice()),
        ("asset.webm", b"\x1a\x45\xdf\xa2\x81\0".as_slice()),
    ] {
        assert_code(
            inspect_asset_media(name, bytes.len() as u64, bytes),
            "UNSUPPORTED_ASSET_TYPE",
        );
    }
}
