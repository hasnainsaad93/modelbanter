import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluationDatasetSchema } from "../lib/evaluation/jev-evaluation";

const paths = process.argv.slice(2);
const files = paths.length ? paths : ["tests/fixtures/jev-development.json", "tests/fixtures/jev-holdout.json"];
const datasets = files.map(path => evaluationDatasetSchema.parse(JSON.parse(readFileSync(path, "utf8"))));
const dataset = evaluationDatasetSchema.parse({ ...datasets[0], cases: datasets.flatMap(item => item.cases) });
const payload = JSON.stringify(dataset).replace(/</g, "\\u003c");
const destination = resolve("work/jev-evaluation/reference-review.html");
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev reference label review</title>
<style>body{font:16px/1.5 system-ui;margin:0;background:#f5f6f3;color:#18231e}main{max-width:1040px;margin:auto;padding:32px}h1{margin:0}header{position:sticky;top:0;background:#f5f6f3;padding:16px 0;border-bottom:1px solid #ccd5cc;z-index:1}input,select,button,textarea{font:inherit;padding:8px;border:1px solid #abb8aa;border-radius:6px}button{background:#234e3b;color:white;cursor:pointer}article{background:white;border:1px solid #d6ded4;border-radius:12px;margin:20px 0;padding:24px}blockquote{margin:16px 0;white-space:pre-wrap;padding:16px;background:#f1f4ed}section{display:flex;gap:12px;flex-wrap:wrap}label{display:flex;flex-direction:column;gap:5px}textarea{width:95%;min-height:65px}small{color:#526054}.reviewed{border-color:#337f51}</style>
<main><h1>Jev reference label review</h1><p>These are assistant-authored draft labels, not independently verified ground truth. Review the text against the classification guide, adjust labels, and mark each case reviewed. “Cannot determine” is a reference annotation only; it does not add a database label.</p><p>This file runs locally, sends no requests, and writes no database records. Export downloads a JSON file. Reloading loses edits unless exported.</p><header><input id="search" aria-label="Filter examples" placeholder="Filter by model, ID, or text"><button id="export">Export reviewed labels</button> <span id="count"></span></header><div id="cases"></div></main>
<script type="application/json" id="dataset">${payload}</script><script>
const dataset=JSON.parse(document.getElementById('dataset').textContent);
const fields=['relevance','overall','reasoning','speed','cost','code_quality'];
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function updateCount(){document.getElementById('count').textContent=dataset.cases.filter(c=>c.annotation.status==='human-reviewed').length+' / '+dataset.cases.length+' reviewed';}
function render(){const root=document.getElementById('cases');root.replaceChildren();const filter=document.getElementById('search').value.toLowerCase();
 for(const item of dataset.cases){if(!JSON.stringify([item.id,item.target.name,item.text]).toLowerCase().includes(filter))continue;
  const card=element('article');card.classList.toggle('reviewed',item.annotation.status==='human-reviewed');card.append(element('h2',item.id+' · '+item.target.name));card.append(element('small',item.split+' · '+item.sampling+' · X ID '+item.xPostId));card.append(element('blockquote',item.text));const decisions=element('section');
  for(const field of fields){const label=element('label',field==='code_quality'?'Coding':field);const select=element('select');const options=field==='relevance'?['YES','NO','UNCLEAR']:['POSITIVE','NEGATIVE','NEUTRAL','MIXED','NOT_DISCUSSED','CANNOT_DETERMINE'];for(const value of ['',...options]){const option=element('option',value||'Unresolved reference label');option.value=value;select.append(option);}select.value=item.expected[field]||'';select.onchange=()=>{item.expected[field]=select.value||null;item.annotation.status='provisional';card.classList.remove('reviewed');updateCount();};label.append(select);decisions.append(label);}card.append(decisions);
  const noteLabel=element('label','Annotation note');const note=element('textarea');note.value=item.annotation.note;note.oninput=()=>{item.annotation.note=note.value;item.annotation.status='provisional';card.classList.remove('reviewed');updateCount();};noteLabel.append(note);card.append(noteLabel);
  const mark=element('button','Mark this case human reviewed');mark.onclick=()=>{item.annotation.status='human-reviewed';item.annotation.reviewer='human';card.classList.add('reviewed');updateCount();};card.append(mark);root.append(card);
 }updateCount();}
document.getElementById('search').oninput=render;
document.getElementById('export').onclick=()=>{dataset.annotationStatus=dataset.cases.every(c=>c.annotation.status==='human-reviewed')?'human-reviewed':'partially-reviewed';const url=URL.createObjectURL(new Blob([JSON.stringify(dataset,null,2)],{type:'application/json'}));const a=element('a');a.href=url;a.download='jev-reviewed-labels.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};render();
</script></html>`;
writeFileSync(destination, html, { mode: 0o600 });
console.log(destination);
