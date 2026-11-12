"""Build a reviewable, editable static figure from the original Storyset SVG.
Preserve source nodes; remove only desk/laptop and their local shadow.
The new far arm is intentionally separate for subsequent user-directed corrections.
"""
from pathlib import Path
from copy import deepcopy
import hashlib
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
def tag(name): return '{'+NS+'}'+name
source = ROOT/'public/studies/work-planning/working-pana.svg'
root = ET.parse(source).getroot()
character = root.find(f"{tag('g')}[@id='Character']")
parts = list(character)
original_parts = [deepcopy(p) for p in parts]
assert len(parts) == 100
for part in parts[96:]: character.remove(part)
# Reuse source curves. Flip only the hand around its wrist to show
# the back of the hand in the typing pose; keep the elbow bend facing forward.
defs=ET.Element(tag('defs'))
root.insert(0,defs)
for name,x,width in [('arm',244,100),('hand',200,44.08)]:
 clip=ET.SubElement(defs,tag('clipPath'),{'id':'typing-'+name,'clipPathUnits':'userSpaceOnUse'})
 ET.SubElement(clip,tag('rect'),{'x':str(x),'y':'250','width':str(width),'height':'70'})
def source_arm(name):
 group=ET.Element(tag('g'),{'id':name})
 limb=deepcopy(parts[58]);limb.set('clip-path','url(#typing-arm)');group.append(limb)
 hand_group=ET.SubElement(group,tag('g'),{'transform':'translate(0 294) scale(1 -1) translate(0 -294)'})
 hand=deepcopy(parts[58]);hand.set('clip-path','url(#typing-hand)');hand_group.append(hand)
 return group
arm=source_arm('source-copy-far-arm')
arm.set('transform','translate(235 264) scale(0.9 0.9) translate(-293.5 -270)')
# The copied upper-arm root belongs inside the sleeve. Clip its concealed top
# rather than letting a skin corner protrude beside the shoulder silhouette.
arm_clip=ET.SubElement(defs,tag('clipPath'),{'id':'far-arm-under-sleeve','clipPathUnits':'userSpaceOnUse'})
ET.SubElement(arm_clip,tag('path'),{'d':'M0 0 H260 V282 H350 V500 H0 Z'})
arm.set('clip-path','url(#far-arm-under-sleeve)')
character.insert(list(character).index(parts[55]),arm)
near=source_arm('source-near-arm-palms-down')
character.insert(list(character).index(parts[58]),near)
character.remove(parts[58])
# Fixed-shoulder sleeve fit. The 30-degree counterclockwise trial moves the
# cuff beyond the fixed upper arm; fit the lower sleeve to that arm instead.
# Keep the original shoulder endpoint (240.61,243.46), all torso geometry,
# and the source armpit endpoint (245.45,274.54) exactly anchored.
old='c-7.65,8.63-17.06,18.84-17.06,18.84l7.18,18.07,17-14a17.42,17.42,0,0,0-2.28,8.17'
new='C232.96,252.09 228.2,263.5 226.15,273.35 Q225.65,276.05 228.5,276.25 L243.7,276.6 Q246.15,276.65 246.5,274.9 Q246.65,274.1 245.45,274.54'
assert old in parts[55].get('d')
parts[55].set('d',parts[55].get('d').replace(old,new))
# Move the sleeve motif with the redirected fabric; shoulder mark stays fixed.
for index,transform in [(64,'translate(0 4) rotate(-12 235.5 261)'),(65,'translate(0 2) rotate(-12 233 269)'),(66,'translate(-2 5) rotate(-12 244 263)')]:
 parts[index].set('transform',transform)
# Reuse the actual near-sleeve cuff separator (source57), not its inner-arm
# shadow. Its tapered dark curve follows the shortened far cuff's slight slope.
cuff_line=deepcopy(parts[57])
cuff_line.set('id','far-sleeve-cuff-separator')
cuff_line.set('transform','translate(236.1 276.38) rotate(1.3) scale(0.88 1) translate(-293.55 -269.75)')
character.insert(list(character).index(parts[57])+1,cuff_line)
out=ROOT/'out/work-planning-review/static-human-v6'
out.mkdir(parents=True,exist_ok=True)
ET.ElementTree(root).write(out/'full-scene.svg',encoding='unicode',xml_declaration=True)
# Additional larger full-body view; the full-scene version retains all room props.
figure=deepcopy(root)
for child in list(figure):
 if child.tag!=tag('defs') and child.attrib.get('id') not in ['Character','background-simple','Floor']:
  figure.remove(child)
figure.set('viewBox','135 175 205 280')
figure.set('width','1025');figure.set('height','1400')
ET.ElementTree(figure).write(out/'full-human.svg',encoding='unicode',xml_declaration=True)
# Exact retained node comparison makes unrequested source changes visible.
retained=[p for p in list(character) if p not in [arm,near,cuff_line]]
expected=[p for i,p in enumerate(original_parts[:96]) if i!=58]
changed={55,64,65,66}
for index in changed:
 expected_index=index if index<58 else index-1
 expected[expected_index]=deepcopy(parts[index])
assert len(retained)==95
assert all(ET.tostring(a)==ET.tostring(b) for a,b in zip(retained,expected))
assert all(p.get('d')==parts[58].get('d') for g in [arm,near] for p in g.iter(tag('path')))
# Bake the same human into the desk-present asset. No character reconstruction
# or representation change is required when the desk is later removed.
working=deepcopy(root)
working_character=working.find(f"{tag('g')}[@id='Character']")
desk=ET.SubElement(working_character,tag('g'),{'id':'work-desk-laptop'})
for part in original_parts[96:]: desk.append(deepcopy(part))
# Keep the original screen shape/tilt, move it forward, and lengthen only the
# keyboard base to sit beneath both hands of the accepted static pose.
desk[2].set('points','135.3 249.28 150.69 294.24 266.37 294.24 265.85 291.93 191.68 291.05 178.7 249.25 135.3 249.28')
desk[3].set('transform','translate(-46 0)')
public=ROOT/'public/studies/work-planning'
ET.ElementTree(working).write(public/'working-typing.svg',encoding='unicode',xml_declaration=True)
ET.ElementTree(root).write(public/'working-typing-no-desk.svg',encoding='unicode',xml_declaration=True)
ET.ElementTree(working).write(out/'working-scene.svg',encoding='unicode',xml_declaration=True)
# Exact character equality with desk stripped; both exports share the same human.
check=deepcopy(working_character);check.remove(check.find(f"{tag('g')}[@id='work-desk-laptop']"))
assert ET.tostring(check)==ET.tostring(character)
meta=json.loads((public/'source.json').read_text())
meta['status']='Static typing human rebuilt from source arms; sleeve corrected. New baked working-typing.svg is active. Animation paused pending pose review; candidate3 superseded.'
meta['derivedAssets']={name:hashlib.sha256((public/name).read_bytes()).hexdigest() for name in ['working-typing.svg','working-typing-no-desk.svg']}
approved=meta.get('review',{}).get('approval',{})
if approved.get('runtimeSha256')==meta['derivedAssets']['working-typing.svg']:
 meta['status']='Static typing human v6 approved by Pavan and integrated into active full working SVG. Subsequent animation remains pending.'
 meta['review']['humanApproval']='approved-static-human'
else:
 meta['review']['humanApproval']='changed static artwork awaiting review'
(public/'source.json').write_text(json.dumps(meta,indent=2)+'\n')
print(out)
