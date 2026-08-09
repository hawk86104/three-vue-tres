import { describe, expect, it } from "vitest";
import { PROJECT_EXPORT_MAX_CHUNK_BYTES, streamTopLeftRgbaChunks } from "./index";

const bottomLeftFrame = (width: number, height: number, rgba: Uint8Array) => ({
  width,
  height,
  origin: "bottom-left" as const,
  rgba,
});

describe("streamTopLeftRgbaChunks", () => {
  it("reverses rows while a row crosses chunk boundaries", async () => {
    const chunks: number[][] = [];
    const frame = bottomLeftFrame(
      2,
      3,
      Uint8Array.from([
        1, 1, 1, 255, 2, 2, 2, 255,
        3, 3, 3, 255, 4, 4, 4, 255,
        5, 5, 5, 255, 6, 6, 6, 255,
      ]),
    );

    const sent = await streamTopLeftRgbaChunks(frame, 5, async (index, bytes) => {
      expect(index).toBe(chunks.length);
      chunks.push([...bytes]);
    });

    expect(sent).toBe(24);
    expect(chunks.flat()).toEqual([
      5, 5, 5, 255, 6, 6, 6, 255,
      3, 3, 3, 255, 4, 4, 4, 255,
      1, 1, 1, 255, 2, 2, 2, 255,
    ]);
  });

  it("rejects a frame whose origin is not bottom-left", async () => {
    const frame = {
      ...bottomLeftFrame(1, 1, Uint8Array.of(1, 2, 3, 255)),
      origin: "top-left",
    };

    await expect(
      streamTopLeftRgbaChunks(frame as never, 4, async () => undefined),
    ).rejects.toMatchObject({ code: "EXPORT_FRAME_INVALID" });
  });

  it.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1],
    [1, 0],
    [1, -1],
    [1, 1.5],
    [1, Number.MAX_SAFE_INTEGER + 1],
  ])("rejects non-safe frame dimensions %p by %p", async (width, height) => {
    await expect(
      streamTopLeftRgbaChunks(
        bottomLeftFrame(width, height, new Uint8Array(0)),
        4,
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "EXPORT_FRAME_INVALID" });
  });

  it("rejects a frame with mismatched RGBA byte length", async () => {
    await expect(
      streamTopLeftRgbaChunks(
        bottomLeftFrame(2, 1, Uint8Array.of(1, 2, 3, 255)),
        4,
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "EXPORT_FRAME_INVALID" });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, PROJECT_EXPORT_MAX_CHUNK_BYTES + 1])(
    "rejects invalid chunk limit %p",
    async (limit) => {
      await expect(
        streamTopLeftRgbaChunks(
          bottomLeftFrame(1, 1, Uint8Array.of(1, 2, 3, 255)),
          limit,
          async () => undefined,
        ),
      ).rejects.toMatchObject({ code: "EXPORT_FRAME_INVALID" });
    },
  );

  it("does not call write for an empty frame payload", async () => {
    const writes: Uint8Array[] = [];
    const sent = await streamTopLeftRgbaChunks(
      bottomLeftFrame(1, 1, Uint8Array.of(1, 2, 3, 255)),
      8,
      async (_index, bytes) => {
        writes.push(bytes);
      },
    );

    expect(sent).toBe(4);
    expect(writes).toHaveLength(1);
    const [write] = writes;
    if (write === undefined) {
      throw new Error("Expected one exported chunk");
    }
    expect([...write]).toEqual([1, 2, 3, 255]);
  });

  it("awaits each write before beginning the next chunk", async () => {
    const pending: Array<() => void> = [];
    const started: number[] = [];
    const completion = streamTopLeftRgbaChunks(
      bottomLeftFrame(1, 2, Uint8Array.from([1, 1, 1, 255, 2, 2, 2, 255])),
      4,
      async (index) => {
        started.push(index);
        await new Promise<void>((resolve) => pending.push(resolve));
      },
    );

    await Promise.resolve();
    expect(started).toEqual([0]);
    pending.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    pending.shift()?.();
    await expect(completion).resolves.toBe(8);
  });

  it("streams a 4K frame with bounded chunk views and no full-frame write allocation", async () => {
    const width = 3840;
    const height = 2160;
    const byteLength = width * height * 4;
    const rgba = new Uint8Array(byteLength);
    const allocations: number[] = [];
    let sent = 0;

    const total = await streamTopLeftRgbaChunks(
      bottomLeftFrame(width, height, rgba),
      PROJECT_EXPORT_MAX_CHUNK_BYTES,
      async (_index, bytes) => {
        allocations.push(bytes.byteLength);
        expect(bytes.buffer).not.toBe(rgba.buffer);
        sent += bytes.byteLength;
      },
    );

    expect(total).toBe(byteLength);
    expect(sent).toBe(byteLength);
    expect(Math.max(...allocations)).toBeLessThanOrEqual(PROJECT_EXPORT_MAX_CHUNK_BYTES);
    expect(Math.max(...allocations)).toBeLessThan(byteLength);
  });
});
