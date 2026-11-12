"""Build a review candidate for the requested straight far sleeve.

Keep approved runtime assets intact until visual review. The only changed nodes
are the far-sleeve section of the shared shirt path and its source cuff ink.
"""
from pathlib import Path
from copy import deepcopy
import hashlib
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/studies/work-planning'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
def tag(name): return '{' + NS + '}' + name
def sha(data): return hashlib.sha256(data).hexdigest()
old = 'C232.96,252.09 228.2,263.5 226.15,273.35 Q225.65,276.05 228.5,276.25 L243.7,276.6 Q246.15,276.65 246.5,274.9 Q246.65,274.1 245.45,274.54'
new = 'C232.96,252.09 228.2,263.5 226.15,276.38 L245.45,276.38 L245.45,274.54'
expected = {'working-typing.svg': '11e6f3cddf6f5f6e8de584c612d18f7afdc4b30991cd15142b8cade0f85e1a4d',
            'working-typing-no-desk.svg': '7d2bdcdb19035c341e94ad052930dfe63cb31cc7e587bb8f38cab464665693a7'}
outputs = {}
characters = []
for name, digest in expected.items():
    data = (PUBLIC / name).read_bytes()
    assert sha(data) == digest, 'Approved source changed'
    root = ET.fromstring(data)
    character = root.find(f"{tag('g')}[@id='Character']")
    before = [deepcopy(node) for node in character]
    far = character.find(f"{tag('g')}[@id='source-copy-far-arm']")
    shirt = list(character)[list(character).index(far) + 1]
    assert shirt.get('d').count(old) == 1
    shirt.set('d', shirt.get('d').replace(old, new))
    cuff = character.find(f"{tag('path')}[@id='far-sleeve-cuff-separator']")
    cuff.set('transform', 'translate(235.8 276.38) scale(0.9887295082 1) translate(-293.55 -269.75)')
    allowed = {list(character).index(shirt), list(character).index(cuff)}
    for i, (a, b) in enumerate(zip(before, character)):
        if i not in allowed: assert ET.tostring(a) == ET.tostring(b), f'Unrequested node change {i}'
    old_torso = before[list(character).index(shirt)].get('d').split('c0,4.79,5,7,5,7')[1]
    assert shirt.get('d').split('c0,4.79,5,7,5,7')[1] == old_torso
    out_name = name.replace('working-typing', 'working-typing-straight-sleeve')
    out = PUBLIC / out_name
    ET.ElementTree(root).write(out, encoding='unicode', xml_declaration=True)
    outputs[out_name] = sha(out.read_bytes())
    comparable = deepcopy(character)
    desk = comparable.find(f"{tag('g')}[@id='work-desk-laptop']")
    if desk is not None: comparable.remove(desk)
    characters.append(ET.tostring(comparable))
assert characters[0] == characters[1], 'Full scene and isolated candidate woman differ'
approval_file = ROOT.parent / 'docs/design/approved-animations.json'
records = json.loads(approval_file.read_text())['records']
approval = next((r['approval'] for r in reversed(records) if r.get('approval', {}).get('asset') == 'care-work-plan-straight-sleeve-and-ownership'), None)
approved = approval is not None and all(approval['renderFingerprintAtApproval'].get('public/studies/work-planning/' + name) == digest for name, digest in outputs.items())
manifest = {'scope': 'Straight far-sleeve revision. Original torso continuation, skin, other arm and joints retained.',
            'sourceHashes': expected, 'candidateHashes': outputs,
            'changedNodes': ['far sleeve contour within shared shirt', 'far cuff separator transform'],
            'humanApproval': 'approved' if approved else 'pending'}
(PUBLIC / 'straight-sleeve-candidate.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
