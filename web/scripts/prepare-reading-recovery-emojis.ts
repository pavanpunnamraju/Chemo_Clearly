import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {TWEMOJI_META} from '@svgmoji/twemoji';

const choices = {
  book:'1f4d6','contented-face':'1f60c',heart:'2764','warm-drink':'2615',music:'1f3b5',
  leaf:'1f343',flower:'1f33c',puzzle:'1f9e9','paint-palette':'1f3a8',home:'1f3e0',
};
const output='public/studies/reading-recovery/twemoji';
const base=`https://raw.githubusercontent.com/${TWEMOJI_META.owner}/${TWEMOJI_META.repo}/${TWEMOJI_META.sha}`;
mkdirSync(output,{recursive:true});
const entries=await Promise.all(Object.entries(choices).map(async([name,codepoint])=>{
  const url=`${base}/${TWEMOJI_META.directory}/${codepoint}.svg`;
  const response=await fetch(url);assert.ok(response.ok,`${response.status}: ${url}`);
  const svg=await response.text();assert.match(svg,/<svg\s/);
  writeFileSync(`${output}/${codepoint}.svg`,svg);
  const match=svg.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/);assert.ok(match);
  const viewBox=match[1]!.match(/viewBox="([^"]+)"/)?.[1]??'0 0 36 36';
  return [name,{codepoint,url,sha256:createHash('sha256').update(svg).digest('hex'),viewBox,body:match[2]}];
}));
const licenseResponse=await fetch(`${base}/LICENSE-GRAPHICS`);assert.ok(licenseResponse.ok);
writeFileSync(`${output}/LICENSE-GRAPHICS`,await licenseResponse.text());
writeFileSync(`${output}/library.json`,JSON.stringify({library:'Twemoji',package:'@svgmoji/twemoji',packageVersion:'3.2.0',
  upstream:TWEMOJI_META,attribution:'Twemoji graphics by Twitter and other contributors, licensed under CC-BY 4.0.',
  sourcePage:'https://github.com/twitter/twemoji/tree/v13.1.0',license:'https://creativecommons.org/licenses/by/4.0/',
  note:'Original SVG artwork and colors. Only an outer SVG viewport supplies placement/scale; paths are not redrawn.',icons:Object.fromEntries(entries)},null,2)+'\n');
console.log(`Imported ${entries.length} unchanged Twemoji SVGs from ${TWEMOJI_META.sha}`);
