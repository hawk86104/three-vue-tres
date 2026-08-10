use std::{
    fs::{File, OpenOptions},
    io::{BufReader, Error, ErrorKind, Write},
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use media_export::{PngDimensions, PngRgbaStream, validate_png_and_hash};

fn opaque_pixels(dimensions: PngDimensions) -> Vec<u8> {
    let byte_count =
        usize::try_from(u64::from(dimensions.width) * u64::from(dimensions.height) * 4).unwrap();
    let mut pixels = vec![0_u8; byte_count];
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[17, 34, 51, 255]);
    }
    pixels
}

fn decode_rgba(path: &Path) -> Vec<u8> {
    let decoder = png::Decoder::new(BufReader::new(File::open(path).unwrap()));
    let mut reader = decoder.read_info().unwrap();
    let mut buffer = vec![0; reader.output_buffer_size().expect("RGBA output size")];
    let info = reader.next_frame(&mut buffer).unwrap();
    buffer.truncate(info.buffer_size());
    buffer
}

fn read_png(path: &Path) -> Vec<u8> {
    std::fs::read(path).unwrap()
}

fn chunks(bytes: &[u8]) -> Vec<([u8; 4], Vec<u8>)> {
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    let mut chunks = Vec::new();
    let mut offset = 8;
    while offset < bytes.len() {
        let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let kind = bytes[offset + 4..offset + 8].try_into().unwrap();
        let data_start = offset + 8;
        let data_end = data_start + length;
        chunks.push((kind, bytes[data_start..data_end].to_vec()));
        offset = data_end + 4;
    }
    chunks
}

#[derive(Clone)]
struct ArmedFailWriter {
    armed: Arc<AtomicBool>,
}

impl Write for ArmedFailWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if self.armed.load(Ordering::SeqCst) {
            Err(Error::new(ErrorKind::Other, "injected output failure"))
        } else {
            Ok(bytes.len())
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        if self.armed.load(Ordering::SeqCst) {
            Err(Error::new(ErrorKind::Other, "injected flush failure"))
        } else {
            Ok(())
        }
    }
}

#[test]
fn streams_opaque_rgba_as_eight_bit_srgb_png() {
    let target = tempfile::NamedTempFile::new().unwrap();
    let dimensions = PngDimensions {
        width: 2,
        height: 2,
    };
    let pixels = [
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ];
    let mut stream = PngRgbaStream::new(target.reopen().unwrap(), dimensions).unwrap();
    stream.write_rgba(&pixels[..5]).unwrap();
    stream.write_rgba(&pixels[5..]).unwrap();
    stream.finish().unwrap();

    let mut png_file = target.reopen().unwrap();
    let summary = validate_png_and_hash(&mut png_file, dimensions).unwrap();
    assert!(summary.byte_size > 8);
    assert_eq!(summary.sha256.len(), 64);
    assert_eq!(decode_rgba(target.path()), pixels);
}

#[test]
fn rejects_zero_and_overflow_dimensions() {
    for dimensions in [
        PngDimensions {
            width: 0,
            height: 1,
        },
        PngDimensions {
            width: 1,
            height: 0,
        },
        PngDimensions {
            width: u32::MAX,
            height: u32::MAX,
        },
    ] {
        assert!(PngRgbaStream::new(Vec::new(), dimensions).is_err());
    }
}

#[test]
fn accepts_empty_chunks_without_changing_raw_accounting() {
    let dimensions = PngDimensions {
        width: 1,
        height: 1,
    };
    let mut stream = PngRgbaStream::new(Vec::new(), dimensions).unwrap();
    stream.write_rgba(&[]).unwrap();
    assert_eq!(stream.written_raw_bytes(), 0);
    assert_eq!(stream.expected_raw_bytes(), 4);
    stream.write_rgba(&[1, 2, 3, 255]).unwrap();
    stream.finish().unwrap();
}

#[test]
fn rejects_nonopaque_alpha_at_every_global_rgba_offset_across_chunk_boundaries() {
    let dimensions = PngDimensions {
        width: 4,
        height: 1,
    };
    for alpha_offset in [3_usize, 7, 11, 15] {
        let mut stream = PngRgbaStream::new(Vec::new(), dimensions).unwrap();
        stream.write_rgba(&vec![255; alpha_offset]).unwrap();
        assert!(stream.write_rgba(&[0]).is_err(), "offset {alpha_offset}");
    }
}

#[test]
fn rejects_raw_byte_overrun() {
    let dimensions = PngDimensions {
        width: 1,
        height: 1,
    };
    let mut stream = PngRgbaStream::new(Vec::new(), dimensions).unwrap();
    stream.write_rgba(&[1, 2, 3, 255]).unwrap();
    assert!(stream.write_rgba(&[4]).is_err());
}

#[test]
fn rejects_raw_byte_underrun_when_finishing() {
    let dimensions = PngDimensions {
        width: 1,
        height: 1,
    };
    let mut stream = PngRgbaStream::new(Vec::new(), dimensions).unwrap();
    stream.write_rgba(&[1, 2, 3]).unwrap();
    assert!(stream.finish().is_err());
}

#[test]
fn propagates_write_failures_while_streaming() {
    let dimensions = PngDimensions {
        width: 16_384,
        height: 2,
    };
    let armed = Arc::new(AtomicBool::new(false));
    let mut stream = PngRgbaStream::new(
        ArmedFailWriter {
            armed: Arc::clone(&armed),
        },
        dimensions,
    )
    .unwrap();
    armed.store(true, Ordering::SeqCst);
    assert!(stream.write_rgba(&opaque_pixels(dimensions)).is_err());
}

#[test]
fn propagates_encoder_finish_failures() {
    let dimensions = PngDimensions {
        width: 1,
        height: 1,
    };
    let armed = Arc::new(AtomicBool::new(false));
    let mut stream = PngRgbaStream::new(
        ArmedFailWriter {
            armed: Arc::clone(&armed),
        },
        dimensions,
    )
    .unwrap();
    stream.write_rgba(&[1, 2, 3, 255]).unwrap();
    armed.store(true, Ordering::SeqCst);
    assert!(stream.finish().is_err());
}

#[test]
fn writes_png_signature_ihdr_rgba_eight_bit_and_srgb_chunks() {
    let target = tempfile::NamedTempFile::new().unwrap();
    let dimensions = PngDimensions {
        width: 2,
        height: 1,
    };
    let mut stream = PngRgbaStream::new(target.reopen().unwrap(), dimensions).unwrap();
    stream.write_rgba(&opaque_pixels(dimensions)).unwrap();
    stream.finish().unwrap();

    let bytes = read_png(target.path());
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    let chunks = chunks(&bytes);
    let ihdr = chunks.iter().find(|(kind, _)| kind == b"IHDR").unwrap();
    assert_eq!(&ihdr.1[..4], &dimensions.width.to_be_bytes());
    assert_eq!(&ihdr.1[4..8], &dimensions.height.to_be_bytes());
    assert_eq!(ihdr.1[8], 8);
    assert_eq!(ihdr.1[9], 6);
    assert_eq!(
        chunks.iter().find(|(kind, _)| kind == b"sRGB").unwrap().1,
        vec![0],
    );
}

#[test]
fn validation_returns_a_deterministic_hash_for_identical_pngs() {
    let dimensions = PngDimensions {
        width: 1,
        height: 1,
    };
    let pixels = opaque_pixels(dimensions);
    let first = tempfile::NamedTempFile::new().unwrap();
    let second = tempfile::NamedTempFile::new().unwrap();
    for target in [&first, &second] {
        let mut stream = PngRgbaStream::new(target.reopen().unwrap(), dimensions).unwrap();
        stream.write_rgba(&pixels).unwrap();
        stream.finish().unwrap();
    }

    let mut first_file = first.reopen().unwrap();
    let mut second_file = second.reopen().unwrap();
    assert_eq!(
        validate_png_and_hash(&mut first_file, dimensions).unwrap(),
        validate_png_and_hash(&mut second_file, dimensions).unwrap(),
    );
}

#[test]
fn validation_rejects_tampered_png_structure() {
    let target = tempfile::NamedTempFile::new().unwrap();
    let dimensions = PngDimensions {
        width: 1,
        height: 1,
    };
    let mut stream = PngRgbaStream::new(target.reopen().unwrap(), dimensions).unwrap();
    stream.write_rgba(&opaque_pixels(dimensions)).unwrap();
    stream.finish().unwrap();
    OpenOptions::new()
        .append(true)
        .open(target.path())
        .unwrap()
        .write_all(b"trailing corruption")
        .unwrap();

    let mut png_file = target.reopen().unwrap();
    assert!(validate_png_and_hash(&mut png_file, dimensions).is_err());
}

#[test]
fn validation_rejects_duplicate_terminal_iend() {
    let target = tempfile::NamedTempFile::new().unwrap();
    let dimensions = PngDimensions {
        width: 1,
        height: 1,
    };
    let mut stream = PngRgbaStream::new(target.reopen().unwrap(), dimensions).unwrap();
    stream.write_rgba(&opaque_pixels(dimensions)).unwrap();
    stream.finish().unwrap();
    let encoded = read_png(target.path());
    let terminal_iend = encoded[encoded.len() - 12..].to_vec();
    OpenOptions::new()
        .append(true)
        .open(target.path())
        .unwrap()
        .write_all(&terminal_iend)
        .unwrap();

    let mut png_file = target.reopen().unwrap();
    assert!(validate_png_and_hash(&mut png_file, dimensions).is_err());
}
