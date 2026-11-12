import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,CatmullRomCurve3,Vector3} from 'three';
import {createClosedSweptVesselGeometry,createCurvedCutawayVesselGeometry} from '../../video-composition/directed/curved-vessel-geometry';

function checkClosedOrientation(geometry:BufferGeometry){
  const positions=geometry.getAttribute('position'),indices=geometry.index;
  assert.ok(indices);
  const edges=new Map<string,{count:number;direction:number}>();
  let volume=0;
  const a=new Vector3(),b=new Vector3(),c=new Vector3();
  for(let i=0;i<positions.count;i++){
    a.fromBufferAttribute(positions,i);
    assert.ok(a.toArray().every(Number.isFinite));
  }
  for(let i=0;i<indices.count;i+=3){
    const triangle=[indices.getX(i),indices.getX(i+1),indices.getX(i+2)];
    a.fromBufferAttribute(positions,triangle[0]!);
    b.fromBufferAttribute(positions,triangle[1]!);
    c.fromBufferAttribute(positions,triangle[2]!);
    volume+=a.dot(b.cross(c))/6;
    for(let edge=0;edge<3;edge++){
      const u=triangle[edge]!,v=triangle[(edge+1)%3]!;
      const key=`${Math.min(u,v)}:${Math.max(u,v)}`;
      const prior=edges.get(key)??{count:0,direction:0};
      edges.set(key,{count:prior.count+1,direction:prior.direction+(u<v?1:-1)});
    }
  }
  assert.equal([...edges.values()].filter(e=>e.count!==2).length,0,'Open or non-manifold mesh edge');
  assert.equal([...edges.values()].filter(e=>e.direction!==0).length,0,'Adjacent faces disagree on surface orientation');
  assert.ok(volume>0,'Closed surface is inside-out');
}

test('closed background/fluid tube faces outward so BackSide selects its far surface',()=>{
  const geometry=createClosedSweptVesselGeometry(new CatmullRomCurve3([
    new Vector3(0,-5,0),new Vector3(0,0,0),new Vector3(0,5,0),
  ]),2);
  checkClosedOrientation(geometry);
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
  for(let i=0;i<p.count;i++){
    if(Math.abs(p.getY(i))>=4.8)continue;
    assert.ok(p.getX(i)*n.getX(i)+p.getZ(i)*n.getZ(i)>1.9,'Tube normal points into lumen');
  }
  geometry.dispose();
});

test('cutaway inner/outer walls, both rims and caps form a consistently oriented closed tissue surface',()=>{
  const geometry=createCurvedCutawayVesselGeometry();
  checkClosedOrientation(geometry);
  assert.equal(geometry.groups.length,6);
  geometry.dispose();
});
