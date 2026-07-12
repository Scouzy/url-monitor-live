import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const svgPath = join(publicDir, "g1oeil_icone_app-black.svg");
const svgBuffer = readFileSync(svgPath);

const sizes = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512];

async function generatePNGs() {
  for (const size of sizes) {
    const out = join(publicDir, `g1oeil-${size}.png`);
    await sharp(svgBuffer, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(out);
    console.log(`✓ ${size}x${size} → ${out}`);
  }
}

async function generateAppleTouchIcon() {
  const out = join(publicDir, "apple-touch-icon.png");
  await sharp(svgBuffer, { density: 384 })
    .resize(180, 180)
    .png()
    .toFile(out);
  console.log(`✓ apple-touch-icon.png (180x180) → ${out}`);
}

async function generateFaviconPNG() {
  const out = join(publicDir, "favicon.png");
  await sharp(svgBuffer, { density: 384 })
    .resize(32, 32)
    .png()
    .toFile(out);
  console.log(`✓ favicon.png (32x32) → ${out}`);
}

async function generateICO() {
  const icoSizes = [16, 32, 48];
  const pngBuffers = [];
  for (const size of icoSizes) {
    const buf = await sharp(svgBuffer, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push(buf);
  }

  const ico = buildICO(pngBuffers, icoSizes);
  const out = join(publicDir, "favicon.ico");
  writeFileSync(out, ico);
  console.log(`✓ favicon.ico (${icoSizes.join(", ")}) → ${out}`);

  const rootIco = join(__dirname, "..", "favicon.ico");
  writeFileSync(rootIco, ico);
  console.log(`✓ favicon.ico (root) → ${rootIco}`);
}

function buildICO(pngBuffers, sizes) {
  const headerSize = 6;
  const dirEntrySize = 16;
  const count = pngBuffers.length;

  let offset = headerSize + dirEntrySize * count;
  const dirEntries = [];
  const dataChunks = [];

  for (let i = 0; i < count; i++) {
    const png = pngBuffers[i];
    const size = sizes[i];
    const w = size >= 256 ? 0 : size;
    const h = w;

    dirEntries.push(Buffer.from([
      w, h,
      0, 0,
      1, 32,
      png.length & 0xFF, (png.length >> 8) & 0xFF, (png.length >> 16) & 0xFF, (png.length >> 24) & 0xFF,
      offset & 0xFF, (offset >> 8) & 0xFF, (offset >> 16) & 0xFF, (offset >> 24) & 0xFF,
    ]));

    dataChunks.push(png);
    offset += png.length;
  }

  const header = Buffer.from([
    0, 0,
    1, 0,
    count & 0xFF, (count >> 8) & 0xFF,
  ]);

  return Buffer.concat([header, ...dirEntries, ...dataChunks]);
}

async function main() {
  console.log("Génération des icônes depuis g1oeil_icone_app-black.svg\n");
  await generatePNGs();
  await generateAppleTouchIcon();
  await generateFaviconPNG();
  await generateICO();
  console.log("\n✅ Toutes les icônes ont été générées dans /public");
}

main().catch(err => { console.error(err); process.exit(1); });
