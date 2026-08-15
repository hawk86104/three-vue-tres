const ZIP32_MAX = 0xffff_ffff;
const ZIP32_MAX_ENTRIES = 0xffff;
const UTF8_FLAG = 0x0800;
const STORED_METHOD = 0;

export class PortablePackageError extends Error {
  constructor(code, options = undefined) {
    super(code, options);
    this.name = "PortablePackageError";
    this.code = code;
  }
}

function zipError(cause) {
  return new PortablePackageError("PACKAGE_ZIP_FAILED", { cause });
}

function checkedInteger(value, maximum) {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximum
  );
}

function comparePortablePath(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertZip32Bounds({
  entryCount,
  entrySize,
  archiveOffset,
  centralSize,
}) {
  if (
    !checkedInteger(entryCount, ZIP32_MAX_ENTRIES) ||
    !checkedInteger(entrySize, ZIP32_MAX) ||
    !checkedInteger(archiveOffset, ZIP32_MAX) ||
    !checkedInteger(centralSize, ZIP32_MAX)
  ) {
    throw zipError();
  }
}

function validateEntryName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[a-z]:/iu.test(value)
  ) {
    throw zipError();
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw zipError();
  }
  return value;
}

function crc32(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function dosTimestamp(value) {
  const parsed = new Date(value);
  if (
    typeof value !== "string" ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString() !== value
  ) {
    throw zipError();
  }
  const date =
    parsed.getUTCFullYear() < 1980
      ? new Date("1980-01-01T00:00:00.000Z")
      : parsed;
  if (date.getUTCFullYear() > 2107) {
    throw zipError();
  }
  const time =
    (date.getUTCHours() << 11) |
    (date.getUTCMinutes() << 5) |
    Math.floor(date.getUTCSeconds() / 2);
  const day =
    ((date.getUTCFullYear() - 1980) << 9) |
    ((date.getUTCMonth() + 1) << 5) |
    date.getUTCDate();
  return { time, day };
}

function localHeader({ nameBytes, bytes, checksum, time, day }) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(STORED_METHOD, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(day, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(bytes.length, 18);
  header.writeUInt32LE(bytes.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBytes, bytes]);
}

function centralHeader({
  nameBytes,
  bytes,
  checksum,
  time,
  day,
  localOffset,
}) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(STORED_METHOD, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(day, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(bytes.length, 20);
  header.writeUInt32LE(bytes.length, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(localOffset, 42);
  return Buffer.concat([header, nameBytes]);
}

export function createZip32({ entries, builtAtUtc }) {
  try {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw zipError();
    }
    assertZip32Bounds({
      entryCount: entries.length,
      entrySize: 0,
      archiveOffset: 0,
      centralSize: 0,
    });
    const { time, day } = dosTimestamp(builtAtUtc);
    const normalized = entries
      .map(({ name, bytes }) => {
        const safeName = validateEntryName(name);
        if (!Buffer.isBuffer(bytes)) {
          throw zipError();
        }
        const nameBytes = Buffer.from(safeName, "utf8");
        if (nameBytes.length === 0 || nameBytes.length > 0xffff) {
          throw zipError();
        }
        assertZip32Bounds({
          entryCount: entries.length,
          entrySize: bytes.length,
          archiveOffset: 0,
          centralSize: 0,
        });
        return { name: safeName, nameBytes, bytes };
      })
      .sort((left, right) => comparePortablePath(left.name, right.name));
    for (let index = 1; index < normalized.length; index += 1) {
      if (normalized[index - 1].name === normalized[index].name) {
        throw zipError();
      }
    }

    const locals = [];
    const centrals = [];
    let localOffset = 0;
    for (const entry of normalized) {
      const checksum = crc32(entry.bytes);
      const local = localHeader({ ...entry, checksum, time, day });
      assertZip32Bounds({
        entryCount: normalized.length,
        entrySize: entry.bytes.length,
        archiveOffset: localOffset,
        centralSize: 0,
      });
      locals.push(local);
      centrals.push(
        centralHeader({
          ...entry,
          checksum,
          time,
          day,
          localOffset,
        }),
      );
      localOffset += local.length;
      assertZip32Bounds({
        entryCount: normalized.length,
        entrySize: entry.bytes.length,
        archiveOffset: localOffset,
        centralSize: 0,
      });
    }

    const centralSize = centrals.reduce((total, entry) => total + entry.length, 0);
    assertZip32Bounds({
      entryCount: normalized.length,
      entrySize: 0,
      archiveOffset: localOffset,
      centralSize,
    });
    if (localOffset + centralSize > ZIP32_MAX) {
      throw zipError();
    }

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(normalized.length, 8);
    end.writeUInt16LE(normalized.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(localOffset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...locals, ...centrals, end]);
  } catch (error) {
    if (error instanceof PortablePackageError) {
      throw error;
    }
    throw zipError(error);
  }
}
