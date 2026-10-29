import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { readPublicationCandidate } from './publication-candidate.mjs';
import { assertPublicationQualification } from './publication-qualification.mjs';
import { readReleaseVersion } from './release-version.mjs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const candidate=fileURLToPath(new URL('../.scratch/npm-candidate/',import.meta.url));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000});if(r.status!==0)throw new Error(`${cmd}: ${r.stderr}`);return r.stdout.trim();};
function source(){
  const revision=process.env.REVIEWED_REVISION;
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='Gao-Gossssip/muha'||process.env.GITHUB_REF!=='refs/heads/main'||! /^[a-f0-9]{40}$/.test(revision??'')||revision!==process.env.GITHUB_SHA||revision!==run('git',['rev-parse','HEAD']))throw new Error('Release must run at the explicitly reviewed main commit');
  run(process.execPath,['scripts/check-repository-policy.mjs',root,'HEAD']);
  if(run('git',['status','--porcelain']))throw new Error('Release source is dirty');
  return revision;
}
const qualification=JSON.parse(await readFile(new URL('./fixtures/sdk-runtime-sha256.json',import.meta.url)));
assertPublicationQualification(qualification);
const version=await readReleaseVersion(root);
const mode=process.argv[2];
if(mode==='source')source();
else if(mode==='summary'){
  const bytes=await readFile(`${candidate}release.json`),release=JSON.parse(bytes);
  const sha=createHash('sha256').update(bytes).digest('hex');
  await readPublicationCandidate(candidate,{revision:process.env.GITHUB_SHA,version,manifestSha256:sha});
  await appendFile(process.env.GITHUB_STEP_SUMMARY,`Prepared ${release.packages.length}-package ${version} candidate at ${release.source.revision}.\n\nrelease.json SHA256: \`${sha}\`\n\nReview this artifact before dispatching publish. Candidate tag precedes Registry acceptance; latest follows all Linux/Windows consumer jobs.\n`);
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`manifest_sha256=${sha}\n`);
  console.log(JSON.stringify({revision:release.source.revision,manifestSha256:sha,packages:release.packages.map(p=>({name:p.name,sha256:p.sha256,integrity:p.integrity}))}));
}else if(mode==='inspect'){
  source();
  await readPublicationCandidate(candidate,{revision:process.env.REVIEWED_REVISION,version,manifestSha256:process.env.REVIEWED_MANIFEST_SHA256});
}else if(mode==='download'){
  const revision=source(),id=process.env.CANDIDATE_RUN;
  if(!/^[1-9][0-9]*$/.test(id??''))throw new Error('A successful reviewed preparation run ID is required');
  const metadata=JSON.parse(run('gh',['api',`repos/Gao-Gossssip/muha/actions/runs/${id}`]));
  if(metadata.head_sha!==revision||metadata.conclusion!=='success'||metadata.event!=='workflow_dispatch'||metadata.path!=='.github/workflows/sdk-release.yml')throw new Error('Candidate run does not identify successful preparation of this source');
  await mkdir(candidate,{recursive:true});
  run('gh',['run','download',id,'--repo','Gao-Gossssip/muha','--name','npm-candidate','--dir',candidate]);
  await readPublicationCandidate(candidate,{revision,version,manifestSha256:process.env.REVIEWED_MANIFEST_SHA256});
}else throw new Error('Use source, summary, inspect or download');
