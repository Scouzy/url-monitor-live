import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const svgPath = join(publicDir, "g1oeil_icone_app-black.svg");
const svgBuffer = readFileSync(svgPath);

async function generateMaskable() {
  // Maskable icons need ~20% safe zone padding around the logo
  // Create a 512x512 canvas with the logo centered at ~80% size on black background
  const logo512 = await sharp(svgBuffer, { density: 384 })
    .resize(410, 410)
    .png()
    .toBuffer();

  for (const size of [192, 512]) {
    const out = join(publicDir, `g1oeil-maskable-${size}.png`);
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 11, g: 15, b: 25, alpha: 1 },
      },
    })
      .composite([{
        input: await sharp(logo512).resize(Math.round(size * 0.8), Math.round(size * 0.8)).toBuffer(),
        gravity: "center",
      }])
      .png()
      .toFile(out);
    console.log(`✓ maskable ${size}x${size} → ${out}`);
  }
}

async function generateOGImage() {
  // Open Graph image 1200x630 for social sharing vignette
  const logo384 = await sharp(svgBuffer, { density: 384 })
    .resize(300, 300)
    .png()
    .toBuffer();

  const out = join(publicDir, "og-image.png");
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 11, g: 15, b: 25, alpha: 1 },
    },
  })
    .composite([{
      input: logo384,
      gravity: "center",
    }])
    .png()
    .toFile(out);
  console.log(`✓ og-image.png (1200x630) → ${out}`);
}

async function generateAppleSplash() {
  // Apple splash screen sizes for various devices
  const splashSizes = [
    { w: 1170, h: 2532, name: "apple-splash-1170x2532" },  // iPhone 12/13/14
    { w: 1242, h: 2688, name: "apple-splash-1242x2688" },  // iPhone 12/13/14 Max
    { w: 828,  h: 1792, name: "apple-splash-828x1792" },   // iPhone XR/11
    { w: 1125, h: 2436, name: "apple-splash-1125x2436" },  // iPhone X/XS/11 Pro
    { w: 768,  h: 1024, name: "apple-splash-768x1024" },   // iPad
    { w: 1536, h: 2048, name: "apple-splash-1536x2048" },  // iPad Retina
  ];

  for (const { w, h, name } of splashSizes) {
    const logoSize = Math.round(Math.min(w, h) * 0.3);
    const logo = await sharp(svgBuffer, { density: 384 })
      .resize(logoSize, logoSize)
      .png()
      .toBuffer();

    const out = join(publicDir, `${name}.png`);
    await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 11, g: 15, b: 25, alpha: 1 },
      },
    })
      .composite([{
        input: logo,
        gravity: "center",
      }])
      .png()
      .toFile(out);
    console.log(`✓ ${name}.png (${w}x${h}) → ${out}`);
  }
}

async function main() {
  console.log("Génération des icônes mobiles, maskable et vignette\n");
  await generateMaskable();
  await generateOGImage();
  await generateAppleSplash();
  console.log("\n✅ Toutes les icônes mobiles générées");
}

main().catch(err => { console.error(err); process.exit(1); });
