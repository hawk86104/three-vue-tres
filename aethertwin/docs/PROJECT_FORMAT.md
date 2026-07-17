# Project format

Every editable project is a directory:

```text
ProjectName.twinproj/
  manifest.json
  project.db
  assets/
  thumbnails/
  derived/
  exports/
```

M0 creates every directory. SQLite is the editable source of truth; `manifest.json` holds lightweight identity and compatibility metadata. Asset records use SHA-256 and normalized paths relative to the project directory. Absolute paths, drive letters, UNC locations, and parent traversal are rejected at the persistence boundary.
