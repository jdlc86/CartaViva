// This governance gate protects the owner's requirement that every current and
// future continuity/handoff document links to the single live project tracker.
// It never interprets historical handoff content as normative requirements.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const relativeTracker='../tracking/SABORA_LIVE_PROJECT_TRACKER.md';
const tracker=resolve(root,'docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md');
const requiredNormativeLinks=[
 '../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md',
 '../REQUISITOS_FUNCIONALES.md',
 '../DESIGN_SYSTEM_CONTRACT.md'
];
const missing=[];
if(!existsSync(tracker))missing.push('missing_live_tracker');
else{
 const contents=readFileSync(tracker,'utf8');
 for(const link of requiredNormativeLinks)
  if(!contents.includes(link))missing.push('tracker_missing_normative_ref: '+link);
}
let checked=0;
function walk(directory){
 if(!existsSync(directory)){missing.push('missing_directory: '+directory);return;}
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory()){walk(path);continue;}
  if(!entry.isFile()||!entry.name.endsWith('.md'))continue;
  checked++;
  if(!readFileSync(path,'utf8').includes(']('+relativeTracker+')'))
   missing.push('missing_live_tracker_link: '+path);
 }
}
walk(join(root,'docs/continuity'));
walk(join(root,'docs/handoffs'));
if(checked===0)missing.push('no_continuity_documents');
if(missing.length){
 for(const item of missing)process.stderr.write(item+'\n');
 process.exitCode=1;
}else process.stdout.write('continuity_tracker_links_ok documents='+checked+'\n');
