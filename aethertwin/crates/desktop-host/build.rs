#[cfg(windows)]
fn main() {
    let icon_path =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("aethertwin-host.ico");
    write_build_icon(&icon_path).unwrap();
    emit_icon_config(&icon_path);
    let windows = tauri_build::WindowsAttributes::new().window_icon_path(icon_path);
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows)).unwrap();
}

#[cfg(not(windows))]
fn main() {
    let icon_path =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("aethertwin-host.png");
    write_build_png(&icon_path).unwrap();
    emit_icon_config(&icon_path);
    tauri_build::build();
}

fn emit_icon_config(path: &std::path::Path) {
    let icon_config_path = path.to_string_lossy().replace('\\', "/");
    println!("cargo:rustc-env=TAURI_CONFIG={{\"bundle\":{{\"icon\":[\"{icon_config_path}\"]}}}}");
}

#[cfg(not(windows))]
fn write_build_png(path: &std::path::Path) -> std::io::Result<()> {
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
        0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];
    std::fs::write(path, PNG)
}

#[cfg(windows)]
fn write_build_icon(path: &std::path::Path) -> std::io::Result<()> {
    const WIDTH: u32 = 32;
    const HEIGHT: u32 = 32;
    let pixel_bytes = WIDTH * HEIGHT * 4;
    let mask_bytes = (WIDTH / 8) * HEIGHT;
    let image_bytes = 40 + pixel_bytes + mask_bytes;
    let mut icon = Vec::with_capacity((22 + image_bytes) as usize);

    icon.extend_from_slice(&[0, 0, 1, 0, 1, 0]);
    icon.extend_from_slice(&[WIDTH as u8, HEIGHT as u8, 0, 0]);
    icon.extend_from_slice(&1_u16.to_le_bytes());
    icon.extend_from_slice(&32_u16.to_le_bytes());
    icon.extend_from_slice(&image_bytes.to_le_bytes());
    icon.extend_from_slice(&22_u32.to_le_bytes());

    icon.extend_from_slice(&40_u32.to_le_bytes());
    icon.extend_from_slice(&(WIDTH as i32).to_le_bytes());
    icon.extend_from_slice(&((HEIGHT * 2) as i32).to_le_bytes());
    icon.extend_from_slice(&1_u16.to_le_bytes());
    icon.extend_from_slice(&32_u16.to_le_bytes());
    icon.extend_from_slice(&0_u32.to_le_bytes());
    icon.extend_from_slice(&pixel_bytes.to_le_bytes());
    icon.extend_from_slice(&0_i32.to_le_bytes());
    icon.extend_from_slice(&0_i32.to_le_bytes());
    icon.extend_from_slice(&0_u32.to_le_bytes());
    icon.extend_from_slice(&0_u32.to_le_bytes());

    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            let accent = x == y || x + y == WIDTH - 1;
            let (red, green, blue) = if accent { (54, 203, 214) } else { (24, 37, 53) };
            icon.extend_from_slice(&[blue, green, red, 255]);
        }
    }
    icon.resize((22 + image_bytes) as usize, 0);
    std::fs::write(path, icon)
}
