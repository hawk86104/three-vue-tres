use chrono::{DateTime, Utc};
use media_export::{PngDimensions, validate_png_and_hash};
use project_io::{
    CreateProjectRequest, PROJECT_EXPORT_MAX_CHUNK_BYTES, ProjectExportPreset, ProjectExportSeed,
    ProjectProfile, begin_project_export_with_seed, create_project, open_project,
};
use std::{fs, fs::File, io::BufReader, path::Path};
use tempfile::tempdir;
use uuid::Uuid;

const WIDTH: u32 = 1_920;
const HEIGHT: u32 = 1_080;
const BYTE_LENGTH: usize = 8_294_400;
const STAGE_PREFIX: &str = ".aethertwin-export-";

fn seed(id: &str) -> ProjectExportSeed {
    ProjectExportSeed {
        export_id: Uuid::parse_str(id).unwrap(),
        timestamp: DateTime::parse_from_rfc3339("2026-08-09T12:34:56.789Z")
            .unwrap()
            .with_timezone(&Utc),
    }
}

fn corner_frame() -> Vec<u8> {
    let mut rgba = vec![0_u8; BYTE_LENGTH];
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[0, 0, 0, 255]);
    }
    let row_bytes = WIDTH as usize * 4;
    rgba[..4].copy_from_slice(&[11, 22, 33, 255]);
    rgba[row_bytes - 4..row_bytes].copy_from_slice(&[44, 55, 66, 255]);
    rgba[BYTE_LENGTH - row_bytes..BYTE_LENGTH - row_bytes + 4].copy_from_slice(&[77, 88, 99, 255]);
    rgba[BYTE_LENGTH - 4..].copy_from_slice(&[111, 122, 133, 255]);
    rgba
}

fn decode_rgba(path: &Path) -> (png::OutputInfo, Option<png::SrgbRenderingIntent>, Vec<u8>) {
    let decoder = png::Decoder::new(BufReader::new(File::open(path).unwrap()));
    let mut reader = decoder.read_info().unwrap();
    let srgb = reader.info().srgb;
    let mut buffer = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut buffer).unwrap();
    buffer.truncate(info.buffer_size());
    (info, srgb, buffer)
}

fn assert_no_stage(path: &Path) {
    assert!(fs::read_dir(path.join("exports")).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(STAGE_PREFIX)
    }));
}

#[test]
fn publishes_decodable_top_left_rgba_without_mutating_the_project() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_owned(),
        name: "M2.5 Vertical".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let original = opened.snapshot.clone();
    let floor_id = original.project.floors[0].id;
    let mut operation = begin_project_export_with_seed(
        &opened.project_path,
        &original,
        floor_id,
        ProjectExportPreset::FullHd,
        seed("e2500000-0000-4000-8000-000000009201"),
    )
    .unwrap();
    let rgba = corner_frame();
    for chunk in rgba.chunks(PROJECT_EXPORT_MAX_CHUNK_BYTES) {
        let index = operation.next_chunk_index();
        operation.write_chunk(index, chunk).unwrap();
    }
    let result = operation.finish().unwrap();
    assert_eq!(result.preset, ProjectExportPreset::FullHd);
    assert_eq!((result.width, result.height), (WIDTH, HEIGHT));
    assert!(Path::new(&result.relative_path).is_relative());
    assert!(result.relative_path.starts_with("exports/"));
    assert!(!result.relative_path.contains('\\'));

    let published = opened.project_path.join(&result.relative_path);
    let (info, srgb, decoded) = decode_rgba(&published);
    assert_eq!((info.width, info.height), (WIDTH, HEIGHT));
    assert_eq!(info.color_type, png::ColorType::Rgba);
    assert_eq!(info.bit_depth, png::BitDepth::Eight);
    assert_eq!(&decoded[..4], &[11, 22, 33, 255]);
    assert_eq!(
        &decoded[WIDTH as usize * 4 - 4..WIDTH as usize * 4],
        &[44, 55, 66, 255]
    );
    assert_eq!(
        &decoded[BYTE_LENGTH - WIDTH as usize * 4..BYTE_LENGTH - WIDTH as usize * 4 + 4],
        &[77, 88, 99, 255]
    );
    assert_eq!(&decoded[BYTE_LENGTH - 4..], &[111, 122, 133, 255]);
    assert!(decoded.chunks_exact(4).all(|pixel| pixel[3] == 255));
    assert_eq!(srgb, Some(png::SrgbRenderingIntent::Perceptual));
    let mut file = File::open(&published).unwrap();
    let summary = validate_png_and_hash(
        &mut file,
        PngDimensions {
            width: WIDTH,
            height: HEIGHT,
        },
    )
    .unwrap();

    let mut repeated = begin_project_export_with_seed(
        &opened.project_path,
        &original,
        floor_id,
        ProjectExportPreset::FullHd,
        seed("e2500000-0000-4000-8000-000000009204"),
    )
    .unwrap();
    for chunk in rgba.chunks(PROJECT_EXPORT_MAX_CHUNK_BYTES) {
        let index = repeated.next_chunk_index();
        repeated.write_chunk(index, chunk).unwrap();
    }
    let repeated_result = repeated.finish().unwrap();
    assert_eq!(repeated_result.byte_size, result.byte_size);
    assert_eq!(repeated_result.sha256, result.sha256);
    assert_eq!(summary.byte_size, result.byte_size);
    assert_eq!(summary.sha256, result.sha256);
    assert_eq!(
        open_project(&opened.project_path).unwrap().snapshot,
        original
    );
    assert_no_stage(&opened.project_path);
}

#[test]
fn cancellation_before_and_during_upload_leaves_no_publication_or_stage() {
    for (suffix, partial) in [("9202", false), ("9203", true)] {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: format!("Cancel {suffix}"),
            profile: ProjectProfile::Showroom,
        })
        .unwrap();
        let mut operation = begin_project_export_with_seed(
            &opened.project_path,
            &opened.snapshot,
            opened.snapshot.project.floors[0].id,
            ProjectExportPreset::FullHd,
            seed(&format!("e2500000-0000-4000-8000-00000000{suffix}")),
        )
        .unwrap();
        if partial {
            operation.write_chunk(0, &[1, 2, 3, 255]).unwrap();
        }
        operation.cancel().unwrap();
        assert_eq!(
            fs::read_dir(opened.project_path.join("exports"))
                .unwrap()
                .count(),
            0
        );
        assert_no_stage(&opened.project_path);
    }
}
