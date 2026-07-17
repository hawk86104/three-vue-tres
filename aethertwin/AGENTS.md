# AetherTwin workspace rules

This subtree is an isolated product workspace. Do not create runtime or build dependencies on the parent repository's Vue, Electron, Longfu Market, or OpenRemote code.

M0 implements only the Studio foundation. Deferred packages and crates remain boundary placeholders until their assigned milestone and must not be imported by Studio or exposed in the UI.

All project mutations flow through CommandBus; React components do not issue raw SQL or manipulate project files. Runtime code remains local-first and cannot rely on remote services, CDNs, fonts, icons, maps, telemetry, or business APIs.
