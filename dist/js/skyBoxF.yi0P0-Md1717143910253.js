import{bL as k,bm as g,eM as v,c_ as _,aM as l,ax as B,bM as L,av as D,a5 as C,ao as R,r as u,o as x,C as y,J as T,ae as G,af as P,b7 as z,a as p,T as M,ag as E,b3 as H,a1 as c,ak as N}from"./vendor.DmiBkafs1717143910253.js";import{R as K}from"./RGBELoader.TIVqSFU71717143910253.js";class V extends k{constructor(a){super(a),this.hdrLoader=new K,this.type=g}load(a,n,m,s){const e=new v;switch(e.type=this.type,e.type){case B:e.colorSpace=_,e.minFilter=l,e.magFilter=l,e.generateMipmaps=!1;break;case g:e.colorSpace=_,e.minFilter=l,e.magFilter=l,e.generateMipmaps=!1;break}const t=this;let h=0;function F(o,f,b,w){new L(t.manager).setPath(t.path).setResponseType("arraybuffer").setWithCredentials(t.withCredentials).load(a[o],function(S){h++;const i=t.hdrLoader.parse(S);if(i){if(i.data!==void 0){const r=new D(i.data,i.width,i.height);r.type=e.type,r.colorSpace=e.colorSpace,r.format=e.format,r.minFilter=e.minFilter,r.magFilter=e.magFilter,r.generateMipmaps=e.generateMipmaps,e.images[o]=r}h===6&&(e.needsUpdate=!0,f&&f(e))}},b,w)}for(let o=0;o<a.length;o++)F(o,n,m,s);return e}setDataType(a){return this.type=a,this.hdrLoader.setDataType(a),this}}const j=C({__name:"skyBoxFmesh",props:{texture:{}},setup(d){const a=d,{scene:n}=R(),s=new V().setPath(a.texture).load(["px.hdr","nx.hdr","py.hdr","ny.hdr","pz.hdr","nz.hdr"]);return n.value.environment=s,n.value.background=s,(e,t)=>null}}),q=c("TresPerspectiveCamera",{position:[15,15,15],fov:45,near:.1,far:1e4,"look-at":[0,0,0]},null,-1),A=c("TresMesh",{position:[10,2,-4],"cast-shadow":""},[c("TresBoxGeometry",{args:[2,2,2]}),c("TresMeshNormalMaterial")],-1),J={position:[0,0,0]},$=C({__name:"skyBoxF",setup(d){const a={clearColor:"#201919",windowSize:!0,toneMapping:z,toneMappingExposure:.8};return(n,m)=>{const s=u("TorusKnotGeometry"),e=u("MeshStandardMaterial"),t=u("TresCanvas");return x(),y(t,G(P(a)),{default:T(()=>[q,p(M(E),{enableDamping:""}),p(M(H),{args:[3,3,3],color:"orange",position:[-13,0,1]}),A,c("TresMesh",J,[p(s,{args:[3,1,64,8,2,3]}),p(e,{color:"0xffffff",metalness:1,roughness:.14})]),(x(),y(N,null,{default:T(()=>[p(j,{texture:"https://opensource-1314935952.cos.ap-nanjing.myqcloud.com/images/skyBox/6hdr/"})]),_:1}))]),_:1},16)}}});export{$ as default};