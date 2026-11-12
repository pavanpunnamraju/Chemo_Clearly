"""Derive frame-exact foreground overlays for room-prop occlusion.
The full original RGB frame remains beneath the room layers. These overlays only
restore the woman/chair in front of those layers; they do not replace the backdrop.
"""
from pathlib import Path
import subprocess, hashlib, json
import numpy as np
from PIL import Image
from scipy import ndimage
WEB=Path(__file__).resolve().parents[1]
SOURCE=WEB/'public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4'
OUT=WEB/'public/studies/work-planning/flow-layers'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='9ad5cad79f9e9e99c0da5659cd3ae66e78e3ba870850f645cbd73bb111bc4883'
OUT.mkdir(exist_ok=True)
p=subprocess.Popen(['ffmpeg','-v','error','-i',str(SOURCE),'-frames:v','180','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
records=[]
for frame in range(180):
    raw=p.stdout.read(1280*720*3)
    assert len(raw)==1280*720*3
    rgb=np.frombuffer(raw,dtype=np.uint8).reshape(720,1280,3)
    # Light neutral background; preserve small enclosed white shirt/shoe details.
    light=(rgb.min(axis=2)>214)&(np.ptp(rgb.astype(np.int16),axis=2)<24)
    labels,count=ndimage.label(light)
    sizes=np.bincount(labels.ravel())
    background=light & (sizes[labels]>70)
    alpha=np.where(background,0,255).astype(np.uint8)
    # Floor is already in the underlying unmodified frame, not a foreground prop.
    alpha[644:]=0
    rgba=np.dstack([rgb,alpha])
    dest=OUT/f'{frame:03d}.png'
    Image.fromarray(rgba).save(dest)
    if frame==0: Image.fromarray(rgb).save(OUT/'rest.png')
    if frame==179: Image.fromarray(rgb).save(OUT/'hold.png')
    records.append({'frame':frame,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'foregroundPixels':int((alpha>0).sum())})
assert p.wait()==0
(OUT/'manifest.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'frames':records},indent=2)+'\n')
print(OUT)
