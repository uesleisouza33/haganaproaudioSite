import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-09-17',d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{OWNER_EMAIL:'owner@example.test'}});
try{
const db=await mf.getD1Database('DB');const sql=await readFile('drizzle/0000_freezing_blonde_phantom.sql','utf8');for(const q of sql.split('--> statement-breakpoint'))if(q.trim())await db.prepare(q.trim()).run();
const origin='http://localhost';
const users={owner:{'oai-authenticated-user-id':'owner-1','oai-authenticated-user-email':'owner@example.test'},editor:{'oai-authenticated-user-id':'editor-1','oai-authenticated-user-email':'editor@example.test'}};
async function call(path,method='GET',data,user='owner',extra={}){const headers={...(users[user]||{}),...extra};if(method!=='GET'){headers.Origin=extra.Origin||origin;if(!(data instanceof FormData))headers['Content-Type']='application/json'}const request=new Request(origin+path,{method,headers,body:method==='GET'?undefined:data instanceof FormData?data:JSON.stringify(data)});return mf.dispatchFetch(request.url,{method,headers:Object.fromEntries(request.headers),body:method==='GET'?undefined:await request.arrayBuffer()});}
assert.equal((await call('/api/admin/products','GET',null,'anon')).status,403);
assert.equal((await (await call('/api/me')).json()).role,'owner');
let r=await call('/api/admin/members','POST',{email:'editor@example.test',role:'editor'});assert.equal(r.status,200);
assert.equal((await (await call('/api/me','GET',null,'editor')).json()).role,'editor');
assert.equal((await call('/api/admin/members','GET',null,'editor')).status,403);
assert.equal((await call('/api/admin/members','POST',{email:'x@example.test',role:'owner'})).status,400);
const data={name:'Caixa <script>alert(1)</script>',kind:'box',status:'draft',description:'Teste',specs:'Potência: teste',contents:'1 caixa',images:[],model:null,category:'Monitor'};
r=await call('/api/admin/products','POST',data,'owner',{Origin:'https://evil.test'});assert.equal(r.status,403);
r=await call('/api/admin/products','POST',data,'editor');assert.equal(r.status,201);const {id}=await r.json();
assert.equal((await (await call('/api/catalog','GET',null,'anon')).json()).products.length,0);
assert.equal((await call('/produto/'+id,'GET',null,'anon')).status,404);
let form=new FormData();form.append('file',new File(['not a model'],'invalid.glb'));r=await call('/api/admin/upload','POST',form);assert.equal(r.status,400);
form=new FormData();form.append('file',new File([Uint8Array.from([137,80,78,71,13,10,26,10])],'test.png',{type:'image/png'}));r=await call('/api/admin/upload','POST',form);assert.equal(r.status,201);const photo=(await r.json()).id;
assert.equal((await call('/media/'+photo,'GET',null,'anon')).status,404);assert.equal((await call('/media/'+photo)).status,200);
const gltf={asset:{version:'2.0'},scenes:[{}],scene:0};form=new FormData();form.append('file',new File([JSON.stringify(gltf)],'box.gltf'));r=await call('/api/admin/upload','POST',form);assert.equal(r.status,201);const model=(await r.json()).id;
form=new FormData();form.append('file',new File([JSON.stringify({...gltf,buffers:[{uri:'https://evil.test/data'}]})],'external.gltf'));assert.equal((await call('/api/admin/upload','POST',form)).status,400);
r=await call('/api/admin/products/'+id,'PUT',{...data,images:[photo],model,status:'published',version:1},'editor');assert.equal(r.status,200);
assert.equal((await call('/api/admin/products/'+id,'PUT',{...data,version:1})).status,409);
assert.equal((await (await call('/api/catalog','GET',null,'anon')).json()).products.length,1);
assert.equal((await call('/media/'+photo,'GET',null,'anon')).status,200);
r=await call('/produto/'+id,'GET',null,'anon');assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('model-viewer'));assert.ok(html.includes('wa.me/5548996949044'));
assert.equal((await call('/model-viewer.min.js','GET',null,'anon')).status,200);
// SEO regressions: HTML discovery, canonical domains, structured data and draft exclusion.
const canonical='https://haganaproaudio.com.br';
for(const path of ['/','/caixas','/sistemas','/produto/'+id]){
 const page=await (await call(path,'GET',null,'anon')).text();
 assert.ok(page.includes('rel="canonical" href="'+canonical+path+'"'));
 assert.equal((page.match(/<h1[ >]/g)||[]).length,1);
 assert.equal((page.match(/<title>/g)||[]).length,1);
 const structured=JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(structured['@context'],'https://schema.org');
 assert.ok(structured['@graph'].some(n=>n['@type']==='Organization'));
 if(path==='/produto/'+id){const product=structured['@graph'].find(n=>n['@type']==='Product');assert.equal(product.name,data.name);assert.ok(!product.offers);assert.equal(product.image[0],canonical+'/media/'+photo);}
 if(path==='/'||path==='/caixas')assert.ok(page.includes('href="/produto/'+id+'"'));
 if(path==='/sistemas')assert.ok(!page.includes('href="/produto/'+id+'"'));
}
let map=await (await call('/sitemap.xml','GET',null,'anon')).text();assert.ok(map.includes(canonical+'/produto/'+id));assert.ok(map.includes('<lastmod>'));assert.ok(!map.includes('/admin'));assert.ok(map.includes('/media/'+photo));
const robots=await (await call('/robots.txt','GET',null,'anon')).text();assert.ok(robots.includes('Allow: /'));assert.ok(robots.includes('Disallow: /api/'));assert.ok(robots.includes(canonical+'/sitemap.xml'));
assert.ok((await call('/admin','GET',null,'anon')).headers.get('x-robots-tag').includes('noindex'));
const draft=await (await call('/api/admin/products','POST',{...data,name:'Hidden draft'})).json();
map=await (await call('/sitemap.xml','GET',null,'anon')).text();assert.ok(!map.includes(draft.id));assert.ok(!(await (await call('/','GET',null,'anon')).text()).includes(draft.id));
console.log('PASS: SSR catalog, category filtering, unique metadata, canonical domain, JSON-LD escaping, sitemap, robots and draft exclusions.');
r=await call('/api/admin/settings','PUT',{title:'Título & teste',description:'Texto de teste',whatsapp:'5548996949044',version:0});assert.equal(r.status,200);
assert.equal((await call('/api/admin/settings','PUT',{title:'Título',description:'Texto',whatsapp:'5548996949044',version:0})).status,409);
assert.ok((await (await call('/','GET',null,'anon')).text()).includes('Título &amp; <span>teste</span>'));
await call('/api/admin/members','DELETE',{email:'editor@example.test'});assert.equal((await call('/api/admin/products','GET',null,'editor')).status,403);
assert.equal((await call('/api/admin/products/'+id,'DELETE',{version:1})).status,409);
assert.equal((await call('/api/admin/products/'+id,'DELETE',{version:2})).status,200);
assert.equal((await call('/media/'+photo,'GET',null,'anon')).status,404);
console.log('PASS: owner/editor permissions, revocation, CSRF, drafts, CRUD, upload validation, media access, 3D serving, XSS escaping and concurrent edit conflicts.');
}finally{await mf.dispose()}
