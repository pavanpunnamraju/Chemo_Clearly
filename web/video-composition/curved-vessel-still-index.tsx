import React from 'react';
import {AbsoluteFill,Still,registerRoot} from 'remotion';
import {CurvedVesselArtwork} from './directed/CurvedVesselArtwork';

const Study:React.FC<{qaMode:boolean}>=({qaMode})=><AbsoluteFill style={{background:'#071526'}}>
  <CurvedVesselArtwork width={1280} height={650} qaMode={qaMode}/>
</AbsoluteFill>;

registerRoot(()=> <Still id='CurvedVesselAppearance' component={Study} width={1280} height={650} defaultProps={{qaMode:true}}/>);
