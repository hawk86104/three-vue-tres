use crate::{AssetImportRole, AssetIoError, svg::inspect_svg};
use std::io::{Read, Seek, SeekFrom};

const MAX_RASTER_BYTES: u64 = 256 * 1024 * 1024;
const MAX_SVG_BYTES: u64 = 32 * 1024 * 1024;
const MAX_VIDEO_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_IMAGE_AXIS: u32 = 16_384;
const MAX_DECODED_PIXELS: u64 = 268_435_456;
const PROBE_BYTES: u64 = 64 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetMediaType {
    Png,
    Jpeg,
    Svg,
    Mp4,
    Webm,
}

impl AssetMediaType {
    pub const fn canonical_extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Svg => "svg",
            Self::Mp4 => "mp4",
            Self::Webm => "webm",
        }
    }

    pub const fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Svg => "image/svg+xml",
            Self::Mp4 => "video/mp4",
            Self::Webm => "video/webm",
        }
    }

    const fn maximum_bytes(self) -> u64 {
        match self {
            Self::Png | Self::Jpeg => MAX_RASTER_BYTES,
            Self::Svg => MAX_SVG_BYTES,
            Self::Mp4 | Self::Webm => MAX_VIDEO_BYTES,
        }
    }

    const fn is_image(self) -> bool {
        matches!(self, Self::Png | Self::Jpeg | Self::Svg)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetMediaFacts {
    Image { width: u32, height: u32 },
    Video,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InspectedMedia {
    pub media_type: AssetMediaType,
    pub canonical_extension: &'static str,
    pub facts: AssetMediaFacts,
}

pub fn inspect_asset_media(
    display_name: &str,
    byte_length: u64,
    probe: &[u8],
) -> Result<InspectedMedia, AssetIoError> {
    let extension = extension_of(display_name);
    let (media_type, facts) = if probe.starts_with(b"\x89PNG\r\n\x1a\n") {
        (AssetMediaType::Png, parse_png(probe)?)
    } else if probe.starts_with(&[0xff, 0xd8]) {
        (AssetMediaType::Jpeg, parse_jpeg_bytes(probe)?)
    } else if probe.len() >= 8 && &probe[4..8] == b"ftyp" {
        validate_mp4(probe, byte_length)?;
        (AssetMediaType::Mp4, AssetMediaFacts::Video)
    } else if probe.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        validate_webm(probe)?;
        (AssetMediaType::Webm, AssetMediaFacts::Video)
    } else if looks_like_xml(probe) || extension == "svg" {
        let (width, height) = inspect_svg(probe)?;
        (
            AssetMediaType::Svg,
            AssetMediaFacts::Image { width, height },
        )
    } else {
        return Err(AssetIoError::UnsupportedAssetType);
    };

    if extension != media_type.canonical_extension() {
        return Err(AssetIoError::ExtensionSignatureMismatch);
    }
    if byte_length > media_type.maximum_bytes() {
        return Err(AssetIoError::AssetTooLarge);
    }
    Ok(InspectedMedia {
        media_type,
        canonical_extension: media_type.canonical_extension(),
        facts,
    })
}

pub(crate) fn inspect_stream<R: Read + Seek>(
    reader: &mut R,
    display_name: &str,
    byte_length: u64,
) -> Result<InspectedMedia, AssetIoError> {
    validate_size_for_extension(display_name, byte_length)?;
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| AssetIoError::IoFailed)?;
    let wanted = byte_length.min(PROBE_BYTES);
    let mut probe =
        Vec::with_capacity(usize::try_from(wanted).map_err(|_| AssetIoError::IoFailed)?);
    reader
        .take(wanted)
        .read_to_end(&mut probe)
        .map_err(|_| AssetIoError::IoFailed)?;
    if probe.len() as u64 != wanted {
        return Err(AssetIoError::SourceChanged);
    }

    if probe.starts_with(&[0xff, 0xd8]) {
        let facts = parse_jpeg_reader(reader, byte_length)?;
        return finish_inspection(display_name, byte_length, AssetMediaType::Jpeg, facts);
    }

    if extension_of(display_name) == "svg" || looks_like_xml(&probe) {
        if byte_length > MAX_SVG_BYTES {
            return Err(AssetIoError::AssetTooLarge);
        }
        reader
            .seek(SeekFrom::Start(0))
            .map_err(|_| AssetIoError::IoFailed)?;
        let mut svg = Vec::with_capacity(
            usize::try_from(byte_length).map_err(|_| AssetIoError::AssetTooLarge)?,
        );
        reader
            .take(byte_length.saturating_add(1))
            .read_to_end(&mut svg)
            .map_err(|_| AssetIoError::IoFailed)?;
        if svg.len() as u64 != byte_length {
            return Err(AssetIoError::SourceChanged);
        }
        return inspect_asset_media(display_name, byte_length, &svg);
    }

    inspect_asset_media(display_name, byte_length, &probe)
}

pub(crate) fn validate_role(
    role: AssetImportRole,
    media_type: AssetMediaType,
) -> Result<(), AssetIoError> {
    let allowed = match role {
        AssetImportRole::PlanReference | AssetImportRole::ContentImage => media_type.is_image(),
        AssetImportRole::ContentVideo => !media_type.is_image(),
    };
    if allowed {
        Ok(())
    } else {
        Err(AssetIoError::RoleMediaMismatch)
    }
}

pub(crate) fn validate_size_for_extension(
    display_name: &str,
    byte_length: u64,
) -> Result<(), AssetIoError> {
    let maximum = match extension_of(display_name).as_str() {
        "png" | "jpg" => Some(MAX_RASTER_BYTES),
        "svg" => Some(MAX_SVG_BYTES),
        "mp4" | "webm" => Some(MAX_VIDEO_BYTES),
        _ => None,
    };
    if maximum.is_some_and(|maximum| byte_length > maximum) {
        Err(AssetIoError::AssetTooLarge)
    } else {
        Ok(())
    }
}

fn finish_inspection(
    display_name: &str,
    byte_length: u64,
    media_type: AssetMediaType,
    facts: AssetMediaFacts,
) -> Result<InspectedMedia, AssetIoError> {
    if extension_of(display_name) != media_type.canonical_extension() {
        return Err(AssetIoError::ExtensionSignatureMismatch);
    }
    if byte_length > media_type.maximum_bytes() {
        return Err(AssetIoError::AssetTooLarge);
    }
    Ok(InspectedMedia {
        media_type,
        canonical_extension: media_type.canonical_extension(),
        facts,
    })
}

fn parse_png(bytes: &[u8]) -> Result<AssetMediaFacts, AssetIoError> {
    if bytes.len() < 33
        || u32::from_be_bytes(bytes[8..12].try_into().unwrap()) != 13
        || &bytes[12..16] != b"IHDR"
    {
        return Err(AssetIoError::UnsupportedAssetType);
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    validate_dimensions(width, height)
}

fn parse_jpeg_bytes(bytes: &[u8]) -> Result<AssetMediaFacts, AssetIoError> {
    let mut cursor = std::io::Cursor::new(bytes);
    parse_jpeg_reader(&mut cursor, bytes.len() as u64)
}

fn parse_jpeg_reader<R: Read + Seek>(
    reader: &mut R,
    byte_length: u64,
) -> Result<AssetMediaFacts, AssetIoError> {
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| AssetIoError::IoFailed)?;
    let mut signature = [0_u8; 2];
    read_media_exact(reader, &mut signature)?;
    if signature != [0xff, 0xd8] {
        return Err(AssetIoError::UnsupportedAssetType);
    }
    let mut position = 2_u64;
    while position < byte_length {
        let mut byte = [0_u8; 1];
        read_media_exact(reader, &mut byte)?;
        position += 1;
        if byte[0] != 0xff {
            return Err(AssetIoError::UnsupportedAssetType);
        }
        loop {
            read_media_exact(reader, &mut byte)?;
            position += 1;
            if byte[0] != 0xff {
                break;
            }
        }
        let marker = byte[0];
        if marker == 0xd9 || marker == 0xda {
            return Err(AssetIoError::UnsupportedAssetType);
        }
        if marker == 0x01 || (0xd0..=0xd8).contains(&marker) {
            continue;
        }
        let mut length_bytes = [0_u8; 2];
        read_media_exact(reader, &mut length_bytes)?;
        position += 2;
        let length = u16::from_be_bytes(length_bytes) as u64;
        if length < 2 || position.saturating_add(length - 2) > byte_length {
            return Err(AssetIoError::UnsupportedAssetType);
        }
        if is_sof_marker(marker) {
            if length < 7 {
                return Err(AssetIoError::UnsupportedAssetType);
            }
            let mut dimensions = [0_u8; 5];
            read_media_exact(reader, &mut dimensions)?;
            let height = u16::from_be_bytes([dimensions[1], dimensions[2]]) as u32;
            let width = u16::from_be_bytes([dimensions[3], dimensions[4]]) as u32;
            return validate_dimensions(width, height);
        }
        reader
            .seek(SeekFrom::Current(
                i64::try_from(length - 2).map_err(|_| AssetIoError::UnsupportedAssetType)?,
            ))
            .map_err(|_| AssetIoError::IoFailed)?;
        position += length - 2;
    }
    Err(AssetIoError::UnsupportedAssetType)
}

fn read_media_exact(reader: &mut impl Read, buffer: &mut [u8]) -> Result<(), AssetIoError> {
    match reader.read_exact(buffer) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
            Err(AssetIoError::UnsupportedAssetType)
        }
        Err(_) => Err(AssetIoError::IoFailed),
    }
}

fn is_sof_marker(marker: u8) -> bool {
    matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf)
}

fn validate_mp4(bytes: &[u8], byte_length: u64) -> Result<(), AssetIoError> {
    if bytes.len() < 16 {
        return Err(AssetIoError::UnsupportedAssetType);
    }
    let short_size = u32::from_be_bytes(bytes[0..4].try_into().unwrap());
    let box_size = match short_size {
        0 => byte_length,
        1 => {
            if bytes.len() < 16 {
                return Err(AssetIoError::UnsupportedAssetType);
            }
            u64::from_be_bytes(bytes[8..16].try_into().unwrap())
        }
        value => u64::from(value),
    };
    let minimum = if short_size == 1 { 20 } else { 16 };
    if box_size < minimum || box_size > byte_length {
        return Err(AssetIoError::UnsupportedAssetType);
    }
    Ok(())
}

fn validate_webm(bytes: &[u8]) -> Result<(), AssetIoError> {
    if bytes.len() < 5 || bytes[4] == 0 {
        Err(AssetIoError::UnsupportedAssetType)
    } else {
        Ok(())
    }
}

fn validate_dimensions(width: u32, height: u32) -> Result<AssetMediaFacts, AssetIoError> {
    if width == 0
        || height == 0
        || width > MAX_IMAGE_AXIS
        || height > MAX_IMAGE_AXIS
        || u64::from(width) * u64::from(height) > MAX_DECODED_PIXELS
    {
        return Err(AssetIoError::InvalidImageDimensions);
    }
    Ok(AssetMediaFacts::Image { width, height })
}

fn looks_like_xml(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .copied()
        .skip_while(u8::is_ascii_whitespace)
        .next()
        == Some(b'<')
}

fn extension_of(display_name: &str) -> String {
    let basename = display_name.rsplit(['/', '\\']).next().unwrap_or("");
    basename
        .rsplit_once('.')
        .filter(|(stem, extension)| !stem.is_empty() && !extension.is_empty())
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default()
}
