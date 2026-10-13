import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../../web/package.json',import.meta.url));
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<body></body>',{url:'https://portfolio.gappazappa.in/projects/resolveai'});
for (const name of ['window','document','HTMLElement','customElements','location']) globalThis[name] = dom.window[name];
globalThis.EventSource = class { addEventListener() {} close() {} };
const descriptor={input_schema:{properties:{error_rate:{type:'number',minimum:0,maximum:100}}},limits:{retention_seconds:600}};
const presets={presets:[{preset_id:'payment-outage',title:'Payment outage',description:'Synthetic test',input:{error_rate:20}}]};
let schemaCalls=0, releaseAdmission;
const calls=[];
const response=data=>Promise.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
globalThis.fetch=(url,options)=>{
 calls.push({url,method:options.method});
 if(url.endsWith('/simulation/schema')) {
  if (++schemaCalls===1) return response(descriptor);
  return new Promise(resolve=>{releaseAdmission=()=>resolve(response(descriptor));});
 }
 if(url.endsWith('/simulation/presets')) return response(presets);
 if(url.endsWith('/simulations')) return response({run_id:'admitted-current-run',status:'ACCEPTED',event_count:0});
 if(url.endsWith('/cancel'))return response({status:'CANCELLED'});
 return new Promise((resolve,reject)=>options.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
};
await import('../../web/dist/widget/resolveai-studio.js');
const host=document.createElement('resolveai-studio');document.body.append(host);
host.shadowRoot.querySelector('link').dispatchEvent(new dom.window.Event('load'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
await tick();await tick();
const button=name=>[...host.shadowRoot.querySelectorAll('button')].find(button=>button.textContent.trim()===name);
button('Run investigation').click();await tick();
assert.ok(button('Cancel').disabled,'Cancel must be disabled while admission is pending');
button('Cancel').click();await tick();
assert.ok(!calls.some(call=>call.url.endsWith('/cancel')),'Do not send cancellation without an admitted current run');
releaseAdmission();await tick();await tick();
assert.equal(button('Cancel').disabled,false,'Enable Cancel once admission returns the current run ID');
button('Cancel').click();await tick();
assert.ok(calls.some(call=>call.url==='/api/projects/resolveai/simulations/admitted-current-run/cancel'&&call.method==='POST'),'Cancellation must target the current admitted run');
host.remove();dom.window.close();
console.log('PASS: held admission disables Cancel; no premature cancellation; accepted run enables the control and receives its cancellation.');
