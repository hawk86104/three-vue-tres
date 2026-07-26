use asset_io::{AssetMediaFacts, inspect_asset_media};

fn inspect(source: &str) -> Result<AssetMediaFacts, asset_io::AssetIoError> {
    inspect_asset_media("drawing.svg", source.len() as u64, source.as_bytes())
        .map(|media| media.facts)
}

fn assert_unsafe(source: &str) {
    let error = inspect(source).unwrap_err();
    assert_eq!(
        error.code(),
        "UNSAFE_SVG",
        "source unexpectedly produced {error:?}"
    );
}

#[test]
fn accepts_positive_integer_px_or_unitless_geometry_and_viewbox_fallback() {
    for (source, expected) in [
        (r#"<svg width="640" height="480"/>"#, (640, 480)),
        (r#"<SVG WIDTH="640px" HEIGHT="480PX"/>"#, (640, 480)),
        (r#"<svg viewBox="0 0 1280 720"/>"#, (1280, 720)),
        (r#"<svg viewBox="-10,-20,64,32"></svg>"#, (64, 32)),
        (r#"<x:SvG xmlns:x="urn:test" viewBox="0 0 2 3"/>"#, (2, 3)),
    ] {
        assert_eq!(
            inspect(source).unwrap(),
            AssetMediaFacts::Image {
                width: expected.0,
                height: expected.1
            }
        );
    }
}

#[test]
fn rejects_missing_partial_fractional_non_finite_or_unsafe_geometry() {
    for source in [
        r#"<svg/>"#,
        r#"<svg width="1"/>"#,
        r#"<svg height="1"/>"#,
        r#"<svg width="0" height="1"/>"#,
        r#"<svg width="-1" height="1"/>"#,
        r#"<svg width="1.5" height="1"/>"#,
        r#"<svg width="NaN" height="1"/>"#,
        r#"<svg width="inf" height="1"/>"#,
        r#"<svg width="1cm" height="1"/>"#,
        r#"<svg width="1%" height="1"/>"#,
        r#"<svg viewBox="0 0 0 1"/>"#,
        r#"<svg viewBox="0 0 -1 1"/>"#,
        r#"<svg viewBox="0 0 1.5 1"/>"#,
        r#"<svg viewBox="0 0 NaN 1"/>"#,
        r#"<svg viewBox="0 0 16385 1"/>"#,
        r#"<svg viewBox="0 0 16384 16384.1"/>"#,
    ] {
        let error = inspect(source).unwrap_err();
        assert_eq!(
            error.code(),
            "INVALID_ASSET_IMAGE_DIMENSIONS",
            "source: {source}"
        );
    }
}

#[test]
fn rejects_non_utf8_bom_encoding_declarations_dtd_pi_and_entities() {
    for bytes in [
        b"\xff\xfe<\0s\0v\0g\0/\0>\0".as_slice(),
        b"\xef\xbb\xbf<svg width=\"1\" height=\"1\"/>".as_slice(),
        br#"<?xml version="1.0"?><svg width="1" height="1"/>"#.as_slice(),
        br#"<?xml-stylesheet href="evil.css"?><svg width="1" height="1"/>"#.as_slice(),
        br#"<!DOCTYPE svg><svg width="1" height="1"/>"#.as_slice(),
        br#"<!DOCTYPE svg [<!ENTITY x "boom">]><svg width="1" height="1">&x;</svg>"#.as_slice(),
        br#"<svg width="1" height="1"><text>&amp;</text></svg>"#.as_slice(),
    ] {
        let error = inspect_asset_media("drawing.svg", bytes.len() as u64, bytes).unwrap_err();
        assert_eq!(error.code(), "UNSAFE_SVG", "bytes: {bytes:?}");
    }
}

#[test]
fn rejects_active_or_embedding_tags_by_case_insensitive_local_name() {
    for tag in [
        "script",
        "ScRiPt",
        "foreignObject",
        "iframe",
        "object",
        "embed",
        "image",
        "audio",
        "video",
        "style",
        "animate",
        "animateMotion",
        "animateTransform",
        "set",
    ] {
        assert_unsafe(&format!(r#"<svg width="1" height="1"><x:{tag}/></svg>"#));
    }
}

#[test]
fn rejects_event_handlers_and_external_or_executable_urls() {
    for attribute in [
        r#"onload="alert(1)""#,
        r#"ONCLICK="alert(1)""#,
        r#"href="https://example.test/a.svg""#,
        r#"xlink:href="javascript:alert(1)""#,
        r#"href="data:image/png;base64,AA==""#,
        r#"src="file:///secret""#,
        r#"href="//example.test/a.svg""#,
        r#"href="/absolute/path""#,
    ] {
        assert_unsafe(&format!(
            r#"<svg width="1" height="1"><use {attribute}/></svg>"#
        ));
    }
}

#[test]
fn accepts_local_fragment_references_but_rejects_css_and_external_url_functions() {
    let safe = r##"<svg width="10" height="10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/></svg>"##;
    assert_eq!(
        inspect(safe).unwrap(),
        AssetMediaFacts::Image {
            width: 10,
            height: 10
        }
    );

    for source in [
        r#"<svg width="1" height="1" style="fill:red"/>"#,
        r#"<svg width="1" height="1"><style>rect { fill: red }</style></svg>"#,
        r#"<svg width="1" height="1"><rect fill="url(https://evil.test/a.svg#x)"/></svg>"#,
        r#"<svg width="1" height="1"><rect filter="url(data:image/svg+xml,x)"/></svg>"#,
        r#"<svg width="1" height="1"><rect fill="expression(alert(1))"/></svg>"#,
    ] {
        assert_unsafe(source);
    }
}

#[test]
fn rejects_malformed_xml_duplicate_geometry_and_non_svg_roots() {
    for source in [
        r#"<svg width="1" height="1">"#,
        r#"<svg width="1" width="2" height="1"/>"#,
        r#"<html width="1" height="1"/>"#,
        r#"text<svg width="1" height="1"/>"#,
        r#"<svg width="1" height="1"/><svg width="1" height="1"/>"#,
        r#"<svg width="1" WIDTH="2" height="1"/>"#,
    ] {
        assert_unsafe(source);
    }
}
