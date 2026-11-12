import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {LibrarySvgArtwork} from './directed/LibrarySvgArtwork';
import candidate from '../public/studies/work-planning/straight-sleeve-candidate.json';

interface Props extends Record<string, unknown> {view: 'human'|'closeup'; original: boolean}
const SleeveRevision: React.FC<Props> = ({view,original}) => <AbsoluteFill style={{background:'white'}}>
  <LibrarySvgArtwork artworkId={`sleeve-${view}-${original}`} seconds={0}
    publicPath={`studies/work-planning/${original?'working-typing-no-desk.svg':'working-typing-straight-sleeve-no-desk.svg'}`}
    expectedSha256={original?candidate.sourceHashes['working-typing-no-desk.svg']:candidate.candidateHashes['working-typing-straight-sleeve-no-desk.svg']}
    prepare={svg=>{
      for(const child of [...svg.children]) if(child.tagName.toLowerCase()!=='defs'&&!['Character','background-simple','Floor'].includes(child.id))child.remove();
      svg.setAttribute('viewBox',view==='human'?'135 175 205 280':'218 248 41 48');
      return {apply(){}};
    }}/>
</AbsoluteFill>;
registerRoot(()=><Composition id="WorkPlanningSleeveRevision" component={SleeveRevision}
  width={720} height={980} fps={30} durationInFrames={1} defaultProps={{view:'human',original:false}}
  calculateMetadata={({props})=>({width:props.view==='human'?720:820,height:props.view==='human'?980:960})}/>);
