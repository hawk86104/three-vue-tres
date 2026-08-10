use std::io::Write;

use crate::MediaExportError;

pub const PNG_STREAM_BUFFER_BYTES: usize = 65_536;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PngDimensions {
    pub width: u32,
    pub height: u32,
}

impl PngDimensions {
    pub(crate) fn expected_raw_bytes(self) -> Result<u64, MediaExportError> {
        if self.width == 0 || self.height == 0 {
            return Err(MediaExportError::InvalidDimensions);
        }

        u64::from(self.width)
            .checked_mul(u64::from(self.height))
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or(MediaExportError::InvalidDimensions)
    }
}

pub struct PngRgbaStream<W: Write + 'static> {
    writer: png::StreamWriter<'static, W>,
    expected_raw_bytes: u64,
    row_raw_bytes: u64,
    written_raw_bytes: u64,
}

impl<W: Write + 'static> PngRgbaStream<W> {
    pub fn new(output: W, dimensions: PngDimensions) -> Result<Self, MediaExportError> {
        let expected_raw_bytes = dimensions.expected_raw_bytes()?;
        let mut encoder = png::Encoder::new(output, dimensions.width, dimensions.height);
        let row_raw_bytes = u64::from(dimensions.width)
            .checked_mul(4)
            .ok_or(MediaExportError::InvalidDimensions)?;
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_source_srgb(png::SrgbRenderingIntent::Perceptual);
        let writer = encoder
            .write_header()
            .map_err(|_| MediaExportError::EncodeFailed)?
            .into_stream_writer_with_size(PNG_STREAM_BUFFER_BYTES)
            .map_err(|_| MediaExportError::EncodeFailed)?;

        Ok(Self {
            writer,
            expected_raw_bytes,
            written_raw_bytes: 0,
            row_raw_bytes,
        })
    }

    pub fn expected_raw_bytes(&self) -> u64 {
        self.expected_raw_bytes
    }

    pub fn written_raw_bytes(&self) -> u64 {
        self.written_raw_bytes
    }

    pub fn write_rgba(&mut self, bytes: &[u8]) -> Result<(), MediaExportError> {
        let byte_count =
            u64::try_from(bytes.len()).map_err(|_| MediaExportError::RawByteCountOverflow)?;
        let cumulative_end = self
            .written_raw_bytes
            .checked_add(byte_count)
            .ok_or(MediaExportError::RawByteCountOverflow)?;
        if cumulative_end > self.expected_raw_bytes {
            return Err(MediaExportError::RawByteOverrun);
        }

        for (index, byte) in bytes.iter().enumerate() {
            let offset = self
                .written_raw_bytes
                .checked_add(
                    u64::try_from(index).map_err(|_| MediaExportError::RawByteCountOverflow)?,
                )
                .ok_or(MediaExportError::RawByteCountOverflow)?;
            if offset % 4 == 3 && *byte != 255 {
                return Err(MediaExportError::NonOpaqueAlpha);
            }
        }

        self.writer
            .write_all(bytes)
            .map_err(|_| MediaExportError::EncodeFailed)?;
        if cumulative_end % self.row_raw_bytes == 0 {
            self.writer
                .flush()
                .map_err(|_| MediaExportError::EncodeFailed)?;
        }
        self.written_raw_bytes = cumulative_end;
        Ok(())
    }

    pub fn finish(self) -> Result<(), MediaExportError> {
        if self.written_raw_bytes != self.expected_raw_bytes {
            return Err(MediaExportError::RawByteUnderrun);
        }

        self.writer
            .finish()
            .map_err(|_| MediaExportError::EncodeFailed)
    }
}
