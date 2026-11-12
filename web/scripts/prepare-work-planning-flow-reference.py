"""Render a wide Flow reference without altering the approved character paths."""
from pathlib import Path
import hashlib
import json
import subprocess
import xml.etree.ElementTree as ET

WEB = Path(__file__).resolve().parents[1]
OUT = WEB / 'public/studies/work-planning'
SOURCE = OUT / 'working-typing-straight-sleeve-no-desk.svg'
EXPECTED = 'c3b68d90ee2f7b7cacdbf483d8fe23a8efc3b6e91c38179136d0dc38140390ae'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
root = ET.parse(SOURCE).getroot()
character = root.find(f'{{{NS}}}g[@id="Character"]')
original_character = ET.tostring(character)
for child in list(root):
    if child.tag != f'{{{NS}}}defs' and child.get('id') not in ['Character', 'background-simple', 'Floor']:
        root.remove(child)
# Source units, uniform scaling only. Both hands/leg have ample generation space.
root.set('viewBox', '-123.333333 65 746.666667 420')
root.set('width', '1920')
root.set('height', '1080')
root.insert(0, ET.Element(f'{{{NS}}}rect', {
    'x': '-123.333333', 'y': '65', 'width': '746.666667', 'height': '420', 'fill': 'white'
}))
assert ET.tostring(character) == original_character
svg = OUT / 'working-flow-wide-start.svg'
png = OUT / 'working-flow-wide-start.png'
ET.ElementTree(root).write(svg, encoding='unicode', xml_declaration=True)
subprocess.run(['node', '--input-type=module', '-e',
    "import sharp from 'sharp'; await sharp(process.argv[1]).png().toFile(process.argv[2]);",
    str(svg), str(png)], cwd=WEB, check=True)
(OUT / 'working-flow-wide-start.json').write_text(json.dumps({
    'purpose': 'Wide starting reference for user-run Flow retry; not an approved new animation.',
    'source': SOURCE.name, 'sourceSha256': EXPECTED,
    'viewBox': root.get('viewBox'), 'size': [1920, 1080],
    'preserved': 'Character subtree byte-identical after XML parsing; chair, blob and floor retained. Only room props removed and canvas widened.',
    'outputs': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [svg, png]},
}, indent=2) + '\n')
print(png)
