import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const assets = [
  {
    name: "plan-reference.svg",
    mediaType: "image/svg+xml",
    purpose: "calibrated plan reference",
    bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f4f1e8"/><path d="M80 80H1120V720H80Z M600 80V720 M80 400H1120" fill="none" stroke="#52636d" stroke-width="12"/></svg>'),
  },
  {
    name: "floor.png",
    mediaType: "image/png",
    purpose: "space-floor texture and shared content image",
    bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4AWK68eDJfxBmYoACAAAAAP//oi970wAAAAZJREFUAwBhKAc7/eyTswAAAABJRU5ErkJggg==", "base64"),
  },
  {
    name: "wall.jpg",
    mediaType: "image/jpeg",
    purpose: "wall texture and shared content image",
    bytes: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AAA//2Q==", "base64"),
  },
  {
    name: "fixture.svg",
    mediaType: "image/svg+xml",
    purpose: "fixture texture and shared content image",
    bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#78909c"/><path d="M0 16H64M0 48H64" stroke="#c8d2d8" stroke-width="4"/></svg>'),
  },
];

for (const asset of assets) writeFileSync(join(root, asset.name), asset.bytes);
writeFileSync(
  join(root, "manifest.json"),
  `${JSON.stringify(assets.map((asset) => ({
    file: asset.name,
    sha256: createHash("sha256").update(asset.bytes).digest("hex"),
    mediaType: asset.mediaType,
    purpose: asset.purpose,
  })), null, 2)}\n`,
);
