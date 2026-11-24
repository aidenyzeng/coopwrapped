import fs from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
// usage: tsx scripts/contact.ts out.png cols width img1 img2 ...
const [out, cols, width, ...files] = process.argv.slice(2);
(async () => {
  const imgs = await Promise.all(files.map((f) => loadImage(fs.readFileSync(f))));
  const w = +width, c = +cols, gap = 8;
  const h = Math.round((imgs[0].height / imgs[0].width) * w);
  const rows = Math.ceil(imgs.length / c);
  const cv = createCanvas(c * w + (c + 1) * gap, rows * h + (rows + 1) * gap);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#888"; ctx.fillRect(0, 0, cv.width, cv.height);
  imgs.forEach((im, i) => ctx.drawImage(im, gap + (i % c) * (w + gap), gap + Math.floor(i / c) * (h + gap), w, h));
  fs.writeFileSync(out, cv.toBuffer("image/png"));
})();
