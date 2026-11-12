// Offline development plugin: native text, rectangles, image fills and page links.
// Adds one new page per run. Does not change existing Figma pages or call the network.
const DATA = /*__PROTOTYPE__*/;
function color(hex){return {r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255}}
function solid(hex){return [{type:'SOLID',color:color(hex)}]}
async function main(){
  const fonts=(await figma.listAvailableFontsAsync()).map(f=>f.fontName);
  const families=['PingFang SC','Noto Sans SC','Noto Sans CJK SC','Microsoft YaHei','Inter'];
  const family=families.find(f=>fonts.some(n=>n.family===f));
  if(!family)throw new Error('没有找到可用字体，请启用中文字体后重试。');
  const regular=fonts.find(f=>f.family===family&&/^(Regular|Normal|常规)$/.test(f.style))||fonts.find(f=>f.family===family);
  const bold=fonts.find(f=>f.family===family&&/^(Semibold|SemiBold|Bold|Medium|中黑|中等)$/.test(f.style))||regular;
  await figma.loadFontAsync(regular);if(bold.style!==regular.style)await figma.loadFontAsync(bold);
  const page=figma.createPage();page.name='一家人的饭桌 · 原型 2026-10-09';await figma.setCurrentPageAsync(page);
  const imageHashes={};for(const [asset,b64]of Object.entries(DATA.images))imageHashes[asset]=figma.createImage(figma.base64Decode(b64)).hash;
  const frames=new Map();
  for(const [i,s]of [...DATA.screens,...DATA.boards].entries()){
    const frame=figma.createFrame();page.appendChild(frame);frame.name=`${String(i+1).padStart(2,'0')} / ${s.title}`;
    frame.resize(s.width,s.height);frame.fills=solid(s.bg);frame.clipsContent=true;
    frame.x=i<16?(i%4)*450:(i-16)*1330;frame.y=i<16?Math.floor(i/4)*930:-750;
    frame.setPluginData('route',s.route);frame.setPluginData('prototypeNote',s.note);frames.set(s.id,frame);
    for(const p of s.nodes){
      let n;
      if(p.type==='icon'){n=figma.createNodeFromSvg(p.svg);n.resize(p.w,p.h)}
      else if(p.type==='text'){
        n=figma.createText();n.fontName=p.weight>=600?bold:regular;n.fontSize=p.size;n.characters=p.text;
        n.lineHeight={unit:'PIXELS',value:p.lineHeight};n.letterSpacing={unit:'PIXELS',value:0};
        n.textAutoResize='NONE';n.resize(p.w,p.h);n.textAlignHorizontal=p.align.toUpperCase();n.textAlignVertical='CENTER';n.fills=solid(p.fill);
      }else{
        n=figma.createRectangle();n.resize(p.w,p.h);n.cornerRadius=p.radius||0;
        n.fills=p.type==='image'?[{type:'IMAGE',imageHash:imageHashes[p.asset],scaleMode:'FILL'}]:solid(p.fill);
        if(p.stroke){n.strokes=solid(p.stroke);n.strokeWeight=1}
      }
      n.name=p.name;frame.appendChild(n);n.x=p.x;n.y=p.y;if(p.opacity!==undefined)n.opacity=p.opacity;
    }
  }
  let links=0;
  for(const s of [...DATA.screens,...DATA.boards])for(const h of s.hotspots){
    // Local timer, filtering and feedback are demonstrated in the HTML viewer.
    if(h.to===s.id)continue;
    const target=frames.get(h.to);if(!target)throw new Error(`跳转目标不存在：${h.to}`);
    const n=figma.createRectangle();n.name='点击 / '+h.label;n.resize(h.w,h.h);
    n.fills=[{type:'SOLID',color:color('#ffffff'),opacity:0}];frames.get(s.id).appendChild(n);n.x=h.x;n.y=h.y;
    await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:target.id,navigation:'NAVIGATE',transition:null,resetScrollPosition:true}]}]);links++;
  }
  page.flowStartingPoints=[{nodeId:frames.get('home').id,name:'从点菜开始，一餐的完整流程'}];
  page.selection=[frames.get('home')];figma.viewport.scrollAndZoomIntoView([frames.get('home')]);
  figma.closePlugin(`已新增 ${DATA.screens.length} 个页面/状态、2 张设计画布与 ${links} 个页面跳转。`);
}
main().catch(e=>{figma.closePlugin('原型导入未完成：'+e.message)});
