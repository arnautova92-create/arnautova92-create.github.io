import { readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const mediaRoot = join(projectRoot, "public", "media");
const checkOnly = process.argv.includes("--check");
const supported = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
};

const sanitizeJpeg = (input) => {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new Error("invalid JPEG signature");
  }

  const kept = [input.subarray(0, 2)];
  let cursor = 2;
  let removed = 0;

  while (cursor < input.length) {
    const markerStart = cursor;
    if (input[cursor] !== 0xff) throw new Error(`invalid JPEG marker at byte ${cursor}`);
    while (input[cursor] === 0xff) cursor += 1;
    const marker = input[cursor];
    cursor += 1;

    if (marker === 0xda || marker === 0xd9) {
      kept.push(input.subarray(markerStart));
      cursor = input.length;
      break;
    }

    const standalone = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
    if (standalone) {
      kept.push(input.subarray(markerStart, cursor));
      continue;
    }

    if (cursor + 2 > input.length) throw new Error("truncated JPEG segment length");
    const length = input.readUInt16BE(cursor);
    if (length < 2 || cursor + length > input.length) throw new Error("invalid JPEG segment length");
    const segmentEnd = cursor + length;

    // APP1: EXIF/XMP, APP13: IPTC/Photoshop metadata, COM: free-form comments.
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
      removed += 1;
    } else {
      kept.push(input.subarray(markerStart, segmentEnd));
    }
    cursor = segmentEnd;
  }

  return { output: removed ? Buffer.concat(kept) : input, removed };
};

const sanitizePng = (input) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (input.length < 8 || !input.subarray(0, 8).equals(signature)) {
    throw new Error("invalid PNG signature");
  }

  const blocked = new Set(["eXIf", "iTXt", "tEXt", "tIME", "zTXt"]);
  const kept = [input.subarray(0, 8)];
  let cursor = 8;
  let removed = 0;

  while (cursor < input.length) {
    if (cursor + 12 > input.length) throw new Error("truncated PNG chunk");
    const length = input.readUInt32BE(cursor);
    const type = input.toString("ascii", cursor + 4, cursor + 8);
    const chunkEnd = cursor + 12 + length;
    if (chunkEnd > input.length) throw new Error(`invalid PNG ${type} chunk length`);
    if (blocked.has(type)) removed += 1;
    else kept.push(input.subarray(cursor, chunkEnd));
    cursor = chunkEnd;
  }

  return { output: removed ? Buffer.concat(kept) : input, removed };
};

const sanitizeWebp = (input) => {
  if (
    input.length < 12 ||
    input.toString("ascii", 0, 4) !== "RIFF" ||
    input.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("invalid WebP signature");
  }

  const chunks = [];
  let cursor = 12;
  let removed = 0;

  while (cursor < input.length) {
    if (cursor + 8 > input.length) throw new Error("truncated WebP chunk");
    const type = input.toString("ascii", cursor, cursor + 4);
    const length = input.readUInt32LE(cursor + 4);
    const chunkEnd = cursor + 8 + length + (length % 2);
    if (chunkEnd > input.length) throw new Error(`invalid WebP ${type} chunk length`);
    if (type === "EXIF" || type === "XMP ") removed += 1;
    else {
      const chunk = Buffer.from(input.subarray(cursor, chunkEnd));
      if (type === "VP8X" && chunk.length >= 9) chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    cursor = chunkEnd;
  }

  if (!removed) return { output: input, removed };
  const output = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP", "binary"), ...chunks]);
  output.writeUInt32LE(output.length - 8, 4);
  return { output, removed };
};

const sanitizers = new Map([
  [".jpg", sanitizeJpeg],
  [".jpeg", sanitizeJpeg],
  [".png", sanitizePng],
  [".webp", sanitizeWebp],
]);

const files = (await walk(mediaRoot))
  .filter((file) => supported.has(extname(file).toLowerCase()))
  .sort();

let changed = 0;
let removed = 0;

for (const file of files) {
  const input = await readFile(file);
  const sanitize = sanitizers.get(extname(file).toLowerCase());
  const result = sanitize(input);
  if (!result.removed) continue;

  changed += 1;
  removed += result.removed;
  if (checkOnly) continue;

  const temporary = `${file}.sanitizing`;
  try {
    await writeFile(temporary, result.output, { mode: 0o644 });
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

if (checkOnly && changed) {
  console.error(`${changed} public image(s) contain ${removed} removable metadata block(s).`);
  process.exit(1);
}

console.log(
  checkOnly
    ? `${files.length} public images checked; removable metadata blocks: 0.`
    : `${files.length} public images sanitized; ${changed} changed; ${removed} metadata block(s) removed.`,
);
