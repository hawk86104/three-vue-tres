AetherTwin Portable Web Demo
================================

Scope
-----
This is an internal, unsigned preview for Windows 10/11 x64.
It is not an installer and is not intended for public distribution.

Run
---
1. Extract the ZIP completely into a local folder.
2. Double-click AetherTwin-Preview.exe.
3. Keep the visible console window open while using the preview.

The target computer does not need Node.js, pnpm, or an installer.
The preview serves only a localhost loopback URL. It prefers
http://127.0.0.1:4173/ and selects another free loopback port if 4173 is busy.
Microsoft Edge and Google Chrome are the acceptance baseline.

If the browser cannot be opened automatically, the console remains running and
prints the actual URL so it can be copied into the browser.
Close the console window to stop the preview service.

Integrity
---------
Verify the extracted files against SHA256SUMS.txt before running the preview.
SHA256SUMS.txt lists every payload file except the checksum file itself.

Behavior and limitations
------------------------
The preview always starts with the standard Showroom. Refreshing the page or
restarting the EXE resets the Showroom state.

Export remains available only in the desktop product and is disabled here.
This preview does not persist edits, open or save project files, connect to a
remote service, run from file://, provide a single-file HTML build, include a
Player, or publish content.
