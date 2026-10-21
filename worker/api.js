const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export const defaults={title:'O som tem que ter presença.',description:'Sistemas line array e subwoofers de fabricação própria. Caixas montadas com alto-falantes para levar seu projeto de áudio ao próximo palco.',whatsapp:'5548996949044'};
export async function configuration(env){return await env.DB.prepare('SELECT data,version FROM settings WHERE id=?').bind('site').first().then(r=>r?{...JSON.parse(r.data),version:r.version}:{...defaults,version:0});}
export async function identity(req,env){
 const uid=req.headers.get('oai-authenticated-user-id');const email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 if(!uid||!email)return null;
 // Only the preconfigured Site owner's verified identity can bootstrap administration.
 if(env.OWNER_EMAIL && email===env.OWNER_EMAIL.trim().toLowerCase())await env.DB.prepare('INSERT OR IGNORE INTO members (email,user_id,role) VALUES (?,?,?)').bind(email,uid,'owner').run();
 let member=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(email).first();
 if(!member || (member.user_id && member.user_id!==uid))return {uid,email,role:null};
 if(!member.user_id){await env.DB.prepare('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL').bind(uid,email).run();member=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(email).first();if(member.user_id!==uid)return {uid,email,role:null};}
 return {uid,email,role:member.role};
}
const editor=u=>{if(!u?.role)fail('Entre com uma conta autorizada pela Haganá.',403)};
const admin=u=>{editor(u);if(!['owner','admin'].includes(u.role))fail('Somente administradores podem gerenciar a equipe.',403)};
export async function listProducts(env,all=false){const r=await env.DB.prepare(all?'SELECT * FROM products ORDER BY updated_at DESC':"SELECT * FROM products WHERE status='published' ORDER BY updated_at DESC").all();return r.results.map(p=>({...JSON.parse(p.data),id:p.id,kind:p.kind,status:p.status,version:p.version,updatedAt:p.updated_at}));}
function cleanString(v,max,required=false){if(typeof v!=='string'||v.length>max||required&&!v.trim())fail('Revise os campos obrigatórios e o tamanho do texto.');return v.trim();}
async function body(req){try{return await req.json()}catch{fail('Dados inválidos.')}}
async function validProduct(v,env){
 if(!['box','system'].includes(v.kind)||!['draft','published'].includes(v.status))fail('Tipo ou publicação inválidos.');
 const out={name:cleanString(v.name,140,true),description:cleanString(v.description??'',8000),specs:cleanString(v.specs??'',6000),contents:cleanString(v.contents??'',4000),category:cleanString(v.category??'',80),images:[],model:null};
 if(!Array.isArray(v.images)||v.images.length>12)fail('Selecione até 12 fotos.');
 for(const img of v.images){if(typeof img!=='string')fail('Foto inválida.');const a=await env.DB.prepare("SELECT id FROM assets WHERE id=? AND kind='image'").bind(img).first();if(!a)fail('Uma foto não foi encontrada. Envie novamente.');out.images.push(img);}
 if(v.model){const m=await env.DB.prepare("SELECT id FROM assets WHERE id=? AND kind='model'").bind(v.model).first();if(!m)fail('Modelo 3D não encontrado.');out.model=v.model;}
 return out;
}
async function upload(req,env,user){
 if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))fail('Envie o arquivo pelo formulário.');
 const len=Number(req.headers.get('content-length'));if(len>26*1024*1024)fail('O arquivo ultrapassa 25 MB.',413);
 let consumed=0;const limited=req.body.pipeThrough(new TransformStream({transform(chunk,controller){consumed+=chunk.byteLength;if(consumed>26*1024*1024){controller.error(Object.assign(new Error('O arquivo ultrapassa 25 MB.'),{status:413}));return;}controller.enqueue(chunk);}}));const bounded=new Request(req.url,{method:req.method,headers:req.headers,body:limited,duplex:'half'});const form=await bounded.formData();const file=form.get('file');if(!file || typeof file.arrayBuffer!=='function')fail('Selecione um arquivo.');
 const name=file.name.toLowerCase(),model=/\.(glb|gltf)$/.test(name),max=(model?25:8)*1024*1024;
 if(file.size>max)fail(model?'O modelo deve ter até 25 MB.':'A foto deve ter até 8 MB.',413);
 const buf=await file.arrayBuffer(),b=new Uint8Array(buf);let mime;
 if(model){
  let doc;
  try{if(name.endsWith('.glb')){const dv=new DataView(buf);if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==buf.byteLength||dv.getUint32(16,true)!==0x4e4f534a)throw Error();doc=JSON.parse(new TextDecoder().decode(b.slice(20,20+dv.getUint32(12,true))));mime='model/gltf-binary';}else{doc=JSON.parse(new TextDecoder().decode(b));mime='model/gltf+json';}
   if(doc.asset?.version!=='2.0')throw Error();
   function scan(x){if(!x||typeof x!=='object')return;for(const [key,val]of Object.entries(x)){if(key==='uri'&&(typeof val!=='string'||!/^data:(application\/octet-stream|application\/gltf-buffer|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/.test(val)))throw Error();if(typeof val==='object')scan(val);}}scan(doc);
  }catch{fail('Use GLB 2.0 ou GLTF com texturas e buffers incorporados, sem arquivos externos.');}
 }else if(b[0]===255&&b[1]===216&&b[2]===255)mime='image/jpeg';
 else if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)mime='image/png';
 else if(new TextDecoder().decode(b.slice(0,4))==='RIFF'&&new TextDecoder().decode(b.slice(8,12))==='WEBP')mime='image/webp';
 else fail('Envie uma foto JPG, PNG ou WebP, ou um modelo GLB/GLTF.');
 const id=crypto.randomUUID();await env.BUCKET.put(id,buf,{httpMetadata:{contentType:mime}});
 try{await env.DB.prepare('INSERT INTO assets (id,kind,mime,name,size,created_by) VALUES (?,?,?,?,?,?)').bind(id,model?'model':'image',mime,file.name.slice(0,200),file.size,user.uid).run();}catch(e){await env.BUCKET.delete(id);throw e;}
 return json({id,kind:model?'model':'image',name:file.name},201);
}
export async function api(req,env){
 try{
 const url=new URL(req.url),path=url.pathname;
 if(!['GET','HEAD'].includes(req.method) && (req.headers.get('Origin')!==url.origin||req.headers.get('Sec-Fetch-Site')==='cross-site'))fail('Origem da solicitação inválida.',403);
 const user=await identity(req,env);
 if(path==='/api/me'&&req.method==='GET')return json(user??{role:null});
 if(path==='/api/catalog'&&req.method==='GET')return json({products:await listProducts(env),settings:await configuration(env)});
 editor(user);
 if(path==='/api/admin/products'&&req.method==='GET')return json(await listProducts(env,true));
 if(path==='/api/admin/upload'&&req.method==='POST')return await upload(req,env,user);
 if(path==='/api/admin/products'&&req.method==='POST'){
  const v=await body(req),data=await validProduct(v,env),id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO products (id,kind,status,data,version,updated_at,updated_by) VALUES (?,?,?,?,1,?,?)').bind(id,v.kind,v.status,JSON.stringify(data),new Date().toISOString(),user.email).run();return json({id,version:1},201);
 }
 const match=path.match(/^\/api\/admin\/products\/([a-f0-9-]{36})$/);
 if(match&&req.method==='PUT'){
  const v=await body(req),data=await validProduct(v,env);
  const r=await env.DB.prepare('UPDATE products SET kind=?,status=?,data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(v.kind,v.status,JSON.stringify(data),new Date().toISOString(),user.email,match[1],v.version).run();
  if(!r.meta.changes)fail('Outra pessoa alterou este produto. Copie seu texto e reabra o cadastro para revisar a versão atual.',409);return json({id:match[1],version:v.version+1});
 }
 if(match&&req.method==='DELETE'){
  const v=await body(req);const r=await env.DB.prepare('DELETE FROM products WHERE id=? AND version=?').bind(match[1],v.version).run();if(!r.meta.changes)fail('O produto mudou. Atualize a lista antes de excluir.',409);return json({ok:true});
 }
 if(path==='/api/admin/settings'&&req.method==='GET')return json(await configuration(env));
 if(path==='/api/admin/settings'&&req.method==='PUT'){
  const v=await body(req);const data={title:cleanString(v.title,120,true),description:cleanString(v.description,1000,true),whatsapp:cleanString(v.whatsapp,15,true)};
  if(!/^55\d{10,11}$/.test(data.whatsapp))fail('Informe o WhatsApp com 55, DDD e número.');
  let r;if(v.version===0)r=await env.DB.prepare('INSERT OR IGNORE INTO settings (id,data,version) VALUES (?,?,1)').bind('site',JSON.stringify(data)).run();else r=await env.DB.prepare('UPDATE settings SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(data),'site',v.version).run();if(!r.meta.changes)fail('As informações foram alteradas por outra pessoa. Recarregue a página.',409);return json({version:v.version+1});
 }
 if(path==='/api/admin/members'){
  admin(user);
  if(req.method==='GET')return json((await env.DB.prepare('SELECT email,role,user_id IS NOT NULL AS joined FROM members ORDER BY email').all()).results);
  if(req.method==='POST'){
   const v=await body(req),email=cleanString(v.email,254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','editor'].includes(v.role))fail('Informe um e-mail válido e uma permissão.');
   const old=await env.DB.prepare('SELECT role FROM members WHERE email=?').bind(email).first();if(old?.role==='owner'||email===user.email)fail('Você não pode alterar sua própria permissão ou a do proprietário.');
   await env.DB.prepare('INSERT INTO members (email,role) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role').bind(email,v.role).run();return json({ok:true});
  }
  if(req.method==='DELETE'){const v=await body(req);if(v.email===user.email)fail('Você não pode remover seu próprio acesso.');await env.DB.prepare("DELETE FROM members WHERE email=? AND role!='owner'").bind(v.email).run();return json({ok:true});}
 }
 return json({error:'Recurso não encontrado.'},404);
 }catch(e){console.error(e.status?'API validation':'API failure',e.status||e.message);return json({error:e.status?e.message:'Não foi possível concluir. Tente novamente; suas alterações continuam no formulário.'},e.status||503);}
}
export async function media(req,env){
 const id=new URL(req.url).pathname.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return new Response('Não encontrado',{status:404});
 // Draft and unattached uploads are visible only to authorized editors.
 const published=await env.DB.prepare("SELECT id FROM products WHERE status='published' AND (EXISTS (SELECT 1 FROM json_each(products.data,'$.images') WHERE value=?) OR json_extract(data,'$.model')=?) LIMIT 1").bind(id,id).first();
 let pub=!!published;if(!pub){const user=await identity(req,env);if(!user?.role)return new Response('Não encontrado',{status:404});}
 const asset=await env.BUCKET.get(id);if(!asset)return new Response('Não encontrado',{status:404});
 const h=new Headers();asset.writeHttpMetadata(h);h.set('X-Content-Type-Options','nosniff');h.set('Cache-Control',pub?'public, max-age=300':'private, no-store');return new Response(asset.body,{headers:h});
}
