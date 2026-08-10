use std::io::{BufReader, Read, Seek, SeekFrom};

use sha2::{Digest, Sha256};

use crate::{MediaExportError, PNG_STREAM_BUFFER_BYTES, PngDimensions};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PngSummary {
    pub byte_size: u64,
    pub sha256: String,
}

pub fn validate_png_and_hash<R: Read + Seek>(
    reader: &mut R,
    expected: PngDimensions,
) -> Result<PngSummary, MediaExportError> {
    expected.expected_raw_bytes()?;
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| MediaExportError::ValidationFailed)?;

    let mut hasher = Sha256::new();
    let mut byte_size = 0_u64;
    let mut buffer = [0_u8; PNG_STREAM_BUFFER_BYTES];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| MediaExportError::ValidationFailed)?;
        if read == 0 {
            break;
        }
        byte_size = byte_size
            .checked_add(u64::try_from(read).map_err(|_| MediaExportError::ValidationFailed)?)
            .ok_or(MediaExportError::ValidationFailed)?;
        hasher.update(&buffer[..read]);
    }

    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| MediaExportError::ValidationFailed)?;
    {
        let decoder = png::Decoder::new(BufReader::new(&mut *reader));
        let mut png_reader = decoder
            .read_info()
            .map_err(|_| MediaExportError::ValidationFailed)?;
        let info = png_reader.info();
        if info.width != expected.width
            || info.height != expected.height
            || info.color_type != png::ColorType::Rgba
            || info.bit_depth != png::BitDepth::Eight
            || info.srgb != Some(png::SrgbRenderingIntent::Perceptual)
        {
            return Err(MediaExportError::ValidationFailed);
        }

        while png_reader
            .next_row()
            .map_err(|_| MediaExportError::ValidationFailed)?
            .is_some()
        {}
        png_reader
            .finish()
            .map_err(|_| MediaExportError::ValidationFailed)?;
    }

    validate_single_terminal_iend(reader)?;

    Ok(PngSummary {
        byte_size,
        sha256: format!("{:x}", hasher.finalize()),
    })
}

fn validate_single_terminal_iend<R: Read + Seek>(reader: &mut R) -> Result<(), MediaExportError> {
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| MediaExportError::ValidationFailed)?;
    let mut signature = [0_u8; 8];
    reader
        .read_exact(&mut signature)
        .map_err(|_| MediaExportError::ValidationFailed)?;
    if signature != *b"\x89PNG\r\n\x1a\n" {
        return Err(MediaExportError::ValidationFailed);
    }

    loop {
        let mut length_bytes = [0_u8; 4];
        reader
            .read_exact(&mut length_bytes)
            .map_err(|_| MediaExportError::ValidationFailed)?;
        let length = u32::from_be_bytes(length_bytes);
        let mut kind = [0_u8; 4];
        reader
            .read_exact(&mut kind)
            .map_err(|_| MediaExportError::ValidationFailed)?;
        if kind == *b"IEND" {
            if length != 0 {
                return Err(MediaExportError::ValidationFailed);
            }
            let mut crc = [0_u8; 4];
            reader
                .read_exact(&mut crc)
                .map_err(|_| MediaExportError::ValidationFailed)?;
            if crc != [0xae, 0x42, 0x60, 0x82] {
                return Err(MediaExportError::ValidationFailed);
            }
            let mut trailing = [0_u8; 1];
            return match reader.read(&mut trailing) {
                Ok(0) => Ok(()),
                Ok(_) | Err(_) => Err(MediaExportError::ValidationFailed),
            };
        }

        reader
            .seek(SeekFrom::Current(i64::from(length) + 4))
            .map_err(|_| MediaExportError::ValidationFailed)?;
    }
}
