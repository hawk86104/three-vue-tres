use crate::AssetIoError;
use quick_xml::{
    Reader,
    events::{BytesStart, Event},
};
use std::collections::BTreeSet;

const MAX_IMAGE_AXIS: u32 = 16_384;
const MAX_DECODED_PIXELS: u64 = 268_435_456;

#[derive(Default)]
struct Geometry {
    width: Option<String>,
    height: Option<String>,
    view_box: Option<String>,
}

pub(crate) fn inspect_svg(source: &[u8]) -> Result<(u32, u32), AssetIoError> {
    if source.starts_with(&[0xef, 0xbb, 0xbf])
        || source.iter().any(|byte| *byte == b'&')
        || std::str::from_utf8(source).is_err()
    {
        return Err(AssetIoError::UnsafeSvg);
    }

    let mut reader = Reader::from_reader(source);
    let mut depth = 0_usize;
    let mut root_seen = false;
    let mut root_closed = false;
    let mut geometry = Geometry::default();

    loop {
        let event = reader.read_event().map_err(|_| AssetIoError::UnsafeSvg)?;
        match event {
            Event::Start(element) => {
                if depth == 0 {
                    if root_seen || root_closed {
                        return Err(AssetIoError::UnsafeSvg);
                    }
                    root_seen = true;
                    process_element(&element, true, &mut geometry)?;
                } else {
                    process_element(&element, false, &mut geometry)?;
                }
                depth = depth.checked_add(1).ok_or(AssetIoError::UnsafeSvg)?;
            }
            Event::Empty(element) => {
                if depth == 0 {
                    if root_seen || root_closed {
                        return Err(AssetIoError::UnsafeSvg);
                    }
                    root_seen = true;
                    process_element(&element, true, &mut geometry)?;
                    root_closed = true;
                } else {
                    process_element(&element, false, &mut geometry)?;
                }
            }
            Event::End(_) => {
                if depth == 0 {
                    return Err(AssetIoError::UnsafeSvg);
                }
                depth -= 1;
                if depth == 0 {
                    root_closed = true;
                }
            }
            Event::Text(text) => {
                if depth == 0 && !all_xml_whitespace(text.as_ref()) {
                    return Err(AssetIoError::UnsafeSvg);
                }
            }
            Event::CData(text) => {
                if depth == 0 && !all_xml_whitespace(text.as_ref()) {
                    return Err(AssetIoError::UnsafeSvg);
                }
            }
            Event::Comment(_) => {}
            Event::Decl(_) | Event::PI(_) | Event::DocType(_) | Event::GeneralRef(_) => {
                return Err(AssetIoError::UnsafeSvg);
            }
            Event::Eof => break,
        }
    }

    if !root_seen || !root_closed || depth != 0 {
        return Err(AssetIoError::UnsafeSvg);
    }
    geometry.dimensions()
}

fn process_element(
    element: &BytesStart<'_>,
    is_root: bool,
    geometry: &mut Geometry,
) -> Result<(), AssetIoError> {
    let name = local_name(element.name().as_ref())?;
    if is_root {
        if name != "svg" {
            return Err(AssetIoError::UnsafeSvg);
        }
    } else if matches!(
        name.as_str(),
        "script"
            | "foreignobject"
            | "iframe"
            | "object"
            | "embed"
            | "image"
            | "audio"
            | "video"
            | "style"
            | "animate"
            | "animatemotion"
            | "animatetransform"
            | "set"
            | "link"
            | "meta"
            | "base"
    ) {
        return Err(AssetIoError::UnsafeSvg);
    }

    let mut normalized_attributes = BTreeSet::new();
    for attribute in element.attributes().with_checks(true) {
        let attribute = attribute.map_err(|_| AssetIoError::UnsafeSvg)?;
        let full_name = ascii_lower(attribute.key.as_ref())?;
        let value = std::str::from_utf8(attribute.value.as_ref())
            .map_err(|_| AssetIoError::UnsafeSvg)?
            .trim();
        if full_name == "xmlns" || full_name.starts_with("xmlns:") {
            continue;
        }
        let attribute_name = full_name
            .rsplit(':')
            .next()
            .ok_or(AssetIoError::UnsafeSvg)?;
        if attribute_name == "style" || attribute_name.starts_with("on") {
            return Err(AssetIoError::UnsafeSvg);
        }
        validate_attribute_value(attribute_name, value)?;
        if !normalized_attributes.insert(attribute_name.to_owned()) {
            return Err(AssetIoError::UnsafeSvg);
        }
        if is_root {
            match attribute_name {
                "width" => geometry.width = Some(value.to_owned()),
                "height" => geometry.height = Some(value.to_owned()),
                "viewbox" => geometry.view_box = Some(value.to_owned()),
                _ => {}
            }
        }
    }
    Ok(())
}

fn validate_attribute_value(name: &str, value: &str) -> Result<(), AssetIoError> {
    let lower = value.to_ascii_lowercase();
    if lower.contains("javascript:")
        || lower.contains("data:")
        || lower.contains("file:")
        || lower.contains("http:")
        || lower.contains("https:")
        || lower.contains("expression(")
        || lower.starts_with("//")
        || lower.starts_with('/')
    {
        return Err(AssetIoError::UnsafeSvg);
    }
    if matches!(name, "href" | "src")
        && (!value.starts_with('#')
            || value.len() < 2
            || value
                .bytes()
                .any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control()))
    {
        return Err(AssetIoError::UnsafeSvg);
    }
    validate_url_functions(&lower)
}

fn validate_url_functions(value: &str) -> Result<(), AssetIoError> {
    let mut remaining = value;
    while let Some(index) = remaining.find("url(") {
        remaining = &remaining[index + 4..];
        let end = remaining.find(')').ok_or(AssetIoError::UnsafeSvg)?;
        let target = remaining[..end].trim().trim_matches(['\'', '"']);
        if !target.starts_with('#')
            || target.len() < 2
            || target
                .bytes()
                .any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control())
        {
            return Err(AssetIoError::UnsafeSvg);
        }
        remaining = &remaining[end + 1..];
    }
    Ok(())
}

impl Geometry {
    fn dimensions(self) -> Result<(u32, u32), AssetIoError> {
        match (self.width, self.height) {
            (Some(width), Some(height)) => {
                validate_dimensions(parse_axis(&width)?, parse_axis(&height)?)
            }
            (None, None) => {
                let view_box = self.view_box.ok_or(AssetIoError::InvalidImageDimensions)?;
                parse_view_box(&view_box)
            }
            _ => Err(AssetIoError::InvalidImageDimensions),
        }
    }
}

fn parse_axis(source: &str) -> Result<u32, AssetIoError> {
    let trimmed = source.trim();
    let lower = trimmed.to_ascii_lowercase();
    let number = lower.strip_suffix("px").unwrap_or(&lower);
    if number.is_empty() || number.bytes().any(|byte| byte.is_ascii_whitespace()) {
        return Err(AssetIoError::InvalidImageDimensions);
    }
    parse_positive_integer(number)
}

fn parse_view_box(source: &str) -> Result<(u32, u32), AssetIoError> {
    let values = source
        .split(|character: char| character.is_ascii_whitespace() || character == ',')
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .parse::<f64>()
                .map_err(|_| AssetIoError::InvalidImageDimensions)
        })
        .collect::<Result<Vec<_>, _>>()?;
    if values.len() != 4 || values.iter().any(|value| !value.is_finite()) {
        return Err(AssetIoError::InvalidImageDimensions);
    }
    validate_dimensions(
        parse_positive_integer_f64(values[2])?,
        parse_positive_integer_f64(values[3])?,
    )
}

fn parse_positive_integer(source: &str) -> Result<u32, AssetIoError> {
    parse_positive_integer_f64(
        source
            .parse()
            .map_err(|_| AssetIoError::InvalidImageDimensions)?,
    )
}

fn parse_positive_integer_f64(value: f64) -> Result<u32, AssetIoError> {
    if !value.is_finite() || value <= 0.0 || value.fract() != 0.0 || value > MAX_IMAGE_AXIS as f64 {
        return Err(AssetIoError::InvalidImageDimensions);
    }
    Ok(value as u32)
}

fn validate_dimensions(width: u32, height: u32) -> Result<(u32, u32), AssetIoError> {
    if width == 0
        || height == 0
        || width > MAX_IMAGE_AXIS
        || height > MAX_IMAGE_AXIS
        || u64::from(width) * u64::from(height) > MAX_DECODED_PIXELS
    {
        return Err(AssetIoError::InvalidImageDimensions);
    }
    Ok((width, height))
}

fn local_name(name: &[u8]) -> Result<String, AssetIoError> {
    let local = name
        .rsplit(|byte| *byte == b':')
        .next()
        .ok_or(AssetIoError::UnsafeSvg)?;
    ascii_lower(local)
}

fn ascii_lower(value: &[u8]) -> Result<String, AssetIoError> {
    if value.is_empty() || !value.is_ascii() {
        return Err(AssetIoError::UnsafeSvg);
    }
    Ok(value
        .iter()
        .map(u8::to_ascii_lowercase)
        .map(char::from)
        .collect())
}

fn all_xml_whitespace(value: &[u8]) -> bool {
    value
        .iter()
        .all(|byte| matches!(byte, b' ' | b'\t' | b'\r' | b'\n'))
}
