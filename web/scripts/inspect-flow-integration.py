"""Extract event-neighbor frames from a Flow integration test for visual review."""
from pathlib import Path
import json,subprocess,sys
from PIL import Image,ImageDraw
out=Path(sys.argv[1]);props=json.loads((out/'props.json').read_text());fps=30
for shot in props['shots']:
 asset=shot['asset'];start=shot['from'];duration=shot['duration']
 local={'work':[0,30,90,92,120,209,300,duration-1],'stretch':[0,30,150,292,293,585,duration-1],'car':[0,90,299,300,duration-1],'support':[0,60,90,120,126,138,155,166,195,213,270,299,300,duration-1]}[asset]
 frames=sorted(set(start+f+d for f in local for d in [-1,0,1] if 0<=f+d<duration))
 folder=out/f'{asset}-events';folder.mkdir(exist_ok=True)
 expr='+'.join(f'eq(n\\,{f})' for f in frames)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(out/'four-scenes.mp4'),'-vf',f'select={expr}','-fps_mode','passthrough',str(folder/'%03d.png')],check=True)
 sheet=Image.new('RGB',(1280,200*((len(frames)+3)//4)),'white');draw=ImageDraw.Draw(sheet)
 for i,f in enumerate(frames):
  im=Image.open(folder/f'{i+1:03}.png');im.thumbnail((320,180));x=i%4*320;y=i//4*200;sheet.paste(im,(x,y));draw.text((x+6,y+181),f'frame {f} / local {(f-start)/30:.3f}s',fill='black')
 sheet.save(out/f'{asset}-events.png');(folder/'frames.json').write_text(json.dumps(frames))
print('Event and immediate-neighbor sheets ready')
