import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {videoTrackIdentity} from "../lib/video/render-narration-audio";

const output=path.resolve(process.argv[2] ?? "out/schedule-motion-study/preview-1");
const sha=(file:string)=>createHash("sha256").update(readFileSync(file)).digest("hex");
const evidence=JSON.parse(readFileSync(path.join(output,"evidence.json"),"utf8"));
const video=path.join(output,"schedule-study.mp4");
assert.equal(sha(video),evidence.previewSha256);
const decode=(file:string)=>{const b=execFileSync("ffmpeg",["-v","error","-i",file,"-vn","-ac","1","-ar","8000","-f","f32le","-"],{maxBuffer:16*1024*1024});return Float32Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));};
const source=decode(path.join(output,"narration-excerpts.wav")), encoded=decode(video);
const correlations=evidence.clips.map((clip:{startSeconds:number;durationSeconds:number})=>{
  const from=Math.round((clip.startSeconds+.3)*8000),to=Math.round((clip.startSeconds+Math.min(3,clip.durationSeconds-.2))*8000);
  function correlation(lag:number){let aa=0,bb=0,ab=0;for(let i=from;i<to;i++){const a=source[i]!,b=encoded[i+lag]!;aa+=a*a;bb+=b*b;ab+=a*b;}return ab/Math.sqrt(aa*bb);}
  let best={lag:0,correlation:-1};
  for(let lag=-640;lag<=640;lag++){const value=correlation(lag);if(value>best.correlation)best={lag,correlation:value};}
  assert.equal(best.lag,0,"Narration shifted away from cue clock");assert.ok(best.correlation>.98,"Encoded waveform differs unexpectedly");
  return {fromSeconds:from/8000,toSeconds:to/8000,bestOffsetSeconds:best.lag/8000,correlation:best.correlation};
});
const before=await videoTrackIdentity(path.join(output,"silent.mp4")),after=await videoTrackIdentity(video);
assert.deepEqual(after,before,"Mux changed video bytes/timestamps");
for(const stream of evidence.probe.streams) assert.equal(Number(stream.start_time),0);
const packets=JSON.parse(execFileSync("ffprobe",["-v","error","-select_streams","a:0","-read_intervals","%+#2","-show_packets","-of","json",video],{encoding:"utf8"})).packets;
const first=packets[0];
assert.ok(Number(first.pts_time)<=0);
assert.ok(Number(packets[1].pts_time)===0 || Number(first.pts_time)===0,"Audible AAC start is not zero");
assert.ok(encoded.length>=source.length&&encoded.length-source.length<8000*.06,"Unexpected audio tail padding");
const sampleFrame=Math.ceil((evidence.cues[3].startSeconds+.5)*30);
execFileSync("ffmpeg",["-v","error","-i",video,"-vf",`select=eq(n\\,${sampleFrame})`,"-frames:v","1","-y",path.join(output,"encoded-sample.png")]);
const result={previewSha256:sha(video),checkerSha256:sha("scripts/inspect-schedule-study.ts"),waveformWindows:correlations,searchSeconds:[-.08,.08],resolutionSeconds:1/8000,videoTrackIdentity:after,audioPackets:packets,sourceSamples:source.length,encodedSamples:encoded.length,encodedSampleFrame:sampleFrame,humanVisualApproval:"pending"};
writeFileSync(path.join(output,"export-inspection.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({sha:result.previewSha256,waveformWindows:correlations,videoTrackUnchanged:true},null,2));
