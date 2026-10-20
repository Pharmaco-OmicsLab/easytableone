import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root=process.cwd();
const run=(exe,args)=>{const r=spawnSync(exe,args,{cwd:root,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);};
function resolveR(){if(process.env.RSCRIPT)return process.env.RSCRIPT;if(process.platform!=="win32")return "Rscript";const base="C:\\Program Files\\R";if(fs.existsSync(base)){const candidates=fs.readdirSync(base).filter(x=>/^R-/.test(x)).sort((a,b)=>b.localeCompare(a,"en",{numeric:true})).map(x=>path.join(base,x,"bin","Rscript.exe"));for(const p of candidates)if(fs.existsSync(p))return p;}return "Rscript";}
run(process.execPath,["scripts/crossval/export-eto-results.mjs"]);
const work=path.join(root,"validation","r","work");
for(const tier of ["A","B","C","Bp","Cp"]){for(const suffix of ["spec.json","data.csv","eto.csv"]){const file=path.join(work,`${tier}_${suffix}`);if(!fs.existsSync(file)){console.error(`Required export missing before R stage: ${path.relative(root,file)}`);process.exit(1);}}}
const r=resolveR();const version=spawnSync(r,["--version"],{cwd:root,encoding:"utf8",shell:false});
if(version.error||version.status!==0){console.error("Rscript was not found. Set RSCRIPT to the full path of Rscript.exe (or install R and add Rscript to PATH).");process.exit(1);}
console.log((version.stdout||version.stderr).trim());run(r,["validation/r/selftest.R"]);run(r,["validation/r/crossval_tableone.R","validation/r/work"]);run(process.execPath,["scripts/crossval/compare-r.mjs","validation/r/work"]);
