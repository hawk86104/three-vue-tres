import type { SceneExportFrame } from "./contracts";
import { ProjectExportError } from "./errors";
import { PROJECT_EXPORT_MAX_CHUNK_BYTES } from "./presets";

function assertFrameShape(frame: SceneExportFrame): void {
  if (
    frame.origin !== "bottom-left" ||
    !Number.isSafeInteger(frame.width) ||
    frame.width <= 0 ||
    !Number.isSafeInteger(frame.height) ||
    frame.height <= 0
  ) {
    throw new ProjectExportError("EXPORT_FRAME_INVALID");
  }

  const expectedByteLength = frame.width * frame.height * 4;
  if (
    !Number.isSafeInteger(expectedByteLength) ||
    frame.rgba.byteLength !== expectedByteLength
  ) {
    throw new ProjectExportError("EXPORT_FRAME_INVALID");
  }
}

export async function streamTopLeftRgbaChunks(
  frame: SceneExportFrame,
  maxChunkBytes: number,
  write: (chunkIndex: number, bytes: Uint8Array) => Promise<void>,
): Promise<number> {
  assertFrameShape(frame);
  if (
    !Number.isSafeInteger(maxChunkBytes) ||
    maxChunkBytes <= 0 ||
    maxChunkBytes > PROJECT_EXPORT_MAX_CHUNK_BYTES
  ) {
    throw new ProjectExportError("EXPORT_FRAME_INVALID");
  }

  const buffer = new Uint8Array(maxChunkBytes);
  const rowBytes = frame.width * 4;
  let used = 0;
  let sent = 0;
  let chunkIndex = 0;

  for (let sourceRow = frame.height - 1; sourceRow >= 0; sourceRow -= 1) {
    let cursor = sourceRow * rowBytes;
    const rowEnd = cursor + rowBytes;

    while (cursor < rowEnd) {
      const count = Math.min(rowEnd - cursor, buffer.length - used);
      buffer.set(frame.rgba.subarray(cursor, cursor + count), used);
      cursor += count;
      used += count;

      if (used === buffer.length) {
        await write(chunkIndex, buffer.subarray(0, used));
        chunkIndex += 1;
        sent += used;
        used = 0;
      }
    }
  }

  if (used > 0) {
    await write(chunkIndex, buffer.subarray(0, used));
    sent += used;
  }

  return sent;
}
