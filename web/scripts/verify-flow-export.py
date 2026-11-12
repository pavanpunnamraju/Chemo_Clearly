"""Verify encoded Flow test narration alignment and sampled video-only regions."""
import sys,json,subprocess,hashlib
from pathlib import Path
import numpy as np
out=Path(sys.argv[1]); evidence=json.loads((out/'evidence.json').read_text())
video=out/'four-scenes.mp4'; start=evidence['sourceAudioStart']
def audio(file,ss,duration):
 b=subprocess.check_output(['ffmpeg','-v','error','-ss',str(ss),'-i',str(file),'-t',str(duration),'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1'])
 return np.frombuffer(b,dtype=np.float32)
checks=[]
for t in [2,26,50,66]:
 a=audio('fixtures/study-narration/rchop/narration.wav',start+t,2)
 b=audio(video,t,2)
 best=(-2,None)
 for lag in range(-160,161):
  x=a[max(0,-lag):min(len(a),len(b)-lag)]; y=b[max(0,lag):min(len(b),len(a)+lag)]
  corr=float(np.corrcoef(x,y)[0,1])
  if corr>best[0]:best=(corr,lag)
 assert abs(best[1])<=1 and best[0]>.99,(t,best)
 checks.append({'time':t,'correlation':best[0],'lagSamples16k':best[1]})
# Mux must not alter silent render video packets.
def packets(p):return subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','pipe:1']).decode().strip()
assert packets(video)==packets(out/'silent.mp4')
result={'audioWindows':checks,'muxVideoPacketsUnchanged':True,'normalSpeedPlayback':'Not performed by this script; encoded samples inspected separately.'}
(out/'export-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
