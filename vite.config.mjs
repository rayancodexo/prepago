import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
export default defineConfig({plugins:[{
 name:'isolated-product-qa', apply:'serve',
 configureServer(server){server.middlewares.use((req,res,next)=>{
  const url=new URL(req.url,'http://terminal.local');
  if(url.pathname==='/__qa'){
   const width=[390,768,1024,1280,1440].includes(Number(url.searchParams.get('width')))?Number(url.searchParams.get('width')):1280;
   const mode=['pricing','admin'].includes(url.searchParams.get('mode'))?url.searchParams.get('mode'):'app';
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<html><body style="margin:0;background:#e8edf5"><p>QA locale — données fictives, aucun accès Supabase</p><iframe title="Prepago QA" src="/__qa-app?mode=${mode}" style="border:0;width:${width}px;height:1000px"></iframe></body></html>`);return;
  }
  if(url.pathname==='/__qa-app'){
   const fixture=readFileSync(new URL('./tests/fixture.js',import.meta.url),'utf8');
   let html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
   html=html.replace('<head>','<head><base href="/">').replace('<script src="app.js">','<script>localStorage.removeItem("prepago-qa-only");</script><script src="app.js">').replace('<script type="module" src="auth.js"></script>',`<script>${fixture}</script>`);
   if(url.searchParams.get('mode')==='admin')html=html.replace('</body>',`<script>${readFileSync(new URL('./tests/cnc-fixture.js',import.meta.url),'utf8')}</script></body>`);
   res.setHeader('Content-Type','text/html');res.end(html);return;
  }
  next();
 })}
}],server:{host:'0.0.0.0',allowedHosts:['terminal.local']}});
