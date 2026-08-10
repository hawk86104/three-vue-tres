use crate::ProjectIoError;
use crate::paths::BoundExportsDirectory;
use chrono::{DateTime, Utc};
use std::path::Path;
use uuid::Uuid;

const EXPORT_STEM_MAX_UTF8_BYTES: usize = 80;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectExportSeed {
    pub export_id: Uuid,
    pub timestamp: DateTime<Utc>,
}

pub fn sanitize_project_export_stem(project_name: &str, project_id: Uuid) -> String {
    let mut output = String::new();
    let mut replacing = false;

    for character in project_name.trim_start_matches(' ').chars() {
        let forbidden = character.is_control() || r#"<>:"/\|?*"#.contains(character);
        if forbidden {
            if !replacing && !output.is_empty() {
                output.push('-');
            }
            replacing = true;
        } else {
            output.push(character);
            replacing = false;
        }
    }

    while output.ends_with('.') || output.ends_with(' ') {
        output.pop();
    }
    while output.len() > EXPORT_STEM_MAX_UTF8_BYTES {
        output.pop();
    }

    if output.is_empty() {
        format!("aethertwin-{}", &project_id.simple().to_string()[..8])
    } else {
        output
    }
}

pub fn cleanup_project_export_staging(project_path: &Path) -> Result<(), ProjectIoError> {
    BoundExportsDirectory::bind(project_path)?.cleanup_staging()
}
