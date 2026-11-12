// Local importer contract check. This does not substitute for a Figma import.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const template=fs.readFileSync(path.join(root,'viewer.html'),'utf8');
const generated=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scriptOf=html=>html.match(/<script>([\s\S]*?)<\/script>/)[1];
for(const hash of ['', '#pantry']){
  let destination;
  vm.runInNewContext(scriptOf(template),{location:{hash,replace(url){destination=url}}},{timeout:1000});
  assert.equal(destination,'index.html'+hash,'Template entry must open the complete prototype');
}
assert(!generated.includes('/*__PROTOTYPE__*/'),'Generated prototype still contains its data placeholder');
new vm.Script(scriptOf(generated));
const data=JSON.parse(fs.readFileSync(path.join(root,'prototype-data.json'),'utf8'));
const all=[...data.screens,...data.boards];
const ids=new Set(all.map(s=>s.id));
assert.equal(ids.size,19);assert.equal(data.screens.length,17);
assert(ids.has('request'));
assert(!generated.includes('/*__MEAL_REQUEST__*/'), '离线原型应包含共享解析函数');
for(const s of all){
  assert(fs.existsSync(path.join(root,'screens',s.id+'.svg')));
  for(const h of s.hotspots)assert(ids.has(h.to),'Broken link: '+h.to);
}
assert(all.find(s=>s.id==='recipes').nodes.some(n=>n.name==='左侧菜系栏'));
assert(all.find(s=>s.id==='step').nodes.find(n=>n.name==='底部计时').y>600);
assert(all.find(s=>s.id==='pantry').nodes.some(n=>n.name==='无图 / 名称占位'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'figma-plugin/manifest.json'),'utf8'));
assert.deepEqual(manifest.networkAccess.allowedDomains,['none']);
assert.equal(manifest.documentAccess,'dynamic-page');
const source=fs.readFileSync(path.join(root,'figma-plugin/code.js'),'utf8');
const instances=[];let seq=0,complete;
const done=new Promise(resolve=>complete=resolve);
const document={type:'DOCUMENT',children:[]};
function create(type){
  const n={id:String(++seq),type,children:[],reactions:[],parent:null,
    appendChild(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);this.children.push(child);child.parent=this},
    resize(w,h){assert(w>0&&h>0);this.width=w;this.height=h},
    setPluginData(k,v){assert.equal(typeof v,'string')},
    async setReactionsAsync(reactions){assert.deepEqual(Object.keys(reactions[0]).sort(),['actions','trigger']);this.reactions=reactions}
  };
  instances.push(n);return n;
}
const figma={
  async listAvailableFontsAsync(){return [{fontName:{family:'PingFang SC',style:'Regular'}},{fontName:{family:'PingFang SC',style:'Semibold'}}]},
  async loadFontAsync(font){assert.equal(font.family,'PingFang SC')},
  createPage(){const n=create('PAGE');document.children.push(n);n.parent=document;return n},
  async setCurrentPageAsync(p){assert.equal(p.type,'PAGE');this.currentPage=p},
  createImage(bytes){assert(bytes.length>100);return {hash:'image-'+bytes.length}},
  base64Decode(v){return Buffer.from(v,'base64')},
  createFrame(){return create('FRAME')},createText(){return create('TEXT')},createRectangle(){return create('RECTANGLE')},
  createNodeFromSvg(svg){assert(svg.startsWith('<svg'));return create('ICON')},
  viewport:{scrollAndZoomIntoView(nodes){assert.equal(nodes.length,1)}},
  closePlugin(message){complete(message)}
};
vm.runInNewContext(source,{figma},{timeout:5000});
done.then(message=>{
  assert(message.startsWith('已新增'),message);
  assert.equal(document.children.length,1);
  const frames=figma.currentPage.children;
  assert.equal(frames.length,19);
  let textCount=0,linkCount=0;
  const frameIds=new Set(frames.map(f=>f.id));
  for(const [i,f]of frames.entries()){
    const expected=all[i];assert.equal(f.width,expected.width);assert.equal(f.height,expected.height);
    const texts=f.children.filter(n=>n.type==='TEXT');textCount+=texts.length;
    assert.deepEqual(texts.map(n=>n.characters),expected.nodes.filter(n=>n.type==='text').map(n=>n.text));
    for(const n of f.children){
      assert(n.x>=0&&n.y>=0&&n.x+n.width<=f.width&&n.y+n.height<=f.height,`${f.name}: ${n.name}`);
      for(const r of n.reactions){linkCount++;assert.equal(r.trigger.type,'ON_CLICK');assert(frameIds.has(r.actions[0].destinationId))}
    }
  }
  assert.equal(textCount,all.reduce((sum,s)=>sum+s.nodes.filter(n=>n.type==='text').length,0));
  assert(linkCount>90);
  assert.equal(figma.currentPage.flowStartingPoints[0].nodeId,frames[0].id);
  const result={passed:true,screens:17,boards:2,nativeTextNodes:textCount,connectedLinks:linkCount,network:'none',nativeFigmaRun:false,webEntryRedirectVerified:true,webScriptSyntaxVerified:true};
  fs.writeFileSync(path.join(root,'importer-checks.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}).catch(e=>{console.error(e);process.exitCode=1});
