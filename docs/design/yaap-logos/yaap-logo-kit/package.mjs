import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = path.dirname(new URL(import.meta.url).pathname);
for (const name of ['01-confluence','02-signal','03-y-dot']) {
  const folder = path.join(root,name);
  const favicon = await fs.readFile(path.join(folder,'favicon.svg'));
  const images=[];
  for(const size of [16,32,48,64,192,512]) {
    const png=await sharp(favicon).resize(size,size).png().toBuffer();
    await fs.writeFile(path.join(folder,`favicon-${size}.png`),png);
    if(size<=48) images.push({size,png});
  }
  const header=Buffer.alloc(6+images.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
  let offset=header.length;
  images.forEach(({size,png},i)=>{const p=6+i*16;header[p]=size;header[p+1]=size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length;});
  await fs.writeFile(path.join(folder,'favicon.ico'),Buffer.concat([header,...images.map(i=>i.png)]));
  await sharp(await fs.readFile(path.join(folder,'apple-touch-icon.svg'))).resize(180,180).png().toFile(path.join(folder,'apple-touch-icon.png'));
  for(const variant of ['light','dark','mono']) await sharp(await fs.readFile(path.join(folder,`logo-${variant}.svg`))).resize({height:192}).png().toFile(path.join(folder,`logo-${variant}.png`));
}
console.log('PNG exports, 16/32/48 multi-size ICOs and 180px touch icons created.');
