#[path = "showroom_demo/support.rs"]
mod support;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = std::env::args_os().skip(1);
    let destination = arguments.next().ok_or("one destination path is required")?;
    if arguments.next().is_some() {
        return Err("exactly one destination path is required".into());
    }
    support::generate_showroom_demo(std::path::Path::new(&destination))?;
    Ok(())
}
