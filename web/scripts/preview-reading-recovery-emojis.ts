import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
import {ReadingRecoveryEmoji} from '../video-composition/directed/ReadingRecoveryEmoji';
import {READING_RECOVERY_ICONS} from '../lib/video/reading-recovery-motion';

const output='out/reading-recovery-icon-library';
mkdirSync(output,{recursive:true});
const cells=READING_RECOVERY_ICONS.map((name,i)=>{
  const x=i%5*200,y=Math.floor(i/5)*210;
  const icon=renderToStaticMarkup(React.createElement(ReadingRecoveryEmoji,{name,size:108}));
  return `<g transform="translate(${x} ${y})"><circle cx="100" cy="88" r="66" fill="white" stroke="#1C2B45" stroke-width="1.5"/><g transform="translate(46 34)">${icon}</g><text x="100" y="181" text-anchor="middle" fill="#1C2B45" font-size="16" font-family="Arial">${name.replaceAll('-',' ')}</text></g>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="450" viewBox="0 0 1000 450"><rect width="1000" height="450" fill="#F4F7F6"/>${cells}<text x="500" y="438" text-anchor="middle" fill="#657974" font-size="13" font-family="Arial">Twemoji · Original library artwork · CC-BY 4.0</text></svg>`;
writeFileSync(`${output}/twemoji.svg`,svg);
await sharp(Buffer.from(svg)).png().toFile(`${output}/twemoji.png`);
console.log(`${output}/twemoji.png`);
