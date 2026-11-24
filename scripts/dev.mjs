import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const astro = JSON.parse(readFileSync('frontend/node_modules/astro/package.json','utf8'));
const children = [spawn(process.execPath,['backend/server.js'],{stdio:'inherit'}),spawn(process.execPath,[join('node_modules/astro',typeof astro.bin==='string'?astro.bin:astro.bin.astro),'dev','--host','127.0.0.1'],{cwd:'frontend',stdio:'inherit'})];
let stopping = false;
function stop(){if(stopping)return;stopping=true;for(const child of children) child.kill();}
for(const child of children){child.on('error',error=>{console.error(error);process.exitCode=1;stop();});child.on('exit',code=>{if(!stopping){process.exitCode=code||0;stop();}});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
