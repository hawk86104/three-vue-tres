import{Z as m,ar as d,ai as f,r as i,o as l,v as _,C as u,a8 as h,a9 as x,J as n,a7 as g,bY as C,a as o,aa as M,aK as y,V as s,ah as T}from"./vendor.45c6b8731706673670030.js";import{l as k}from"./utils.02e454051706673670030.js";import"./RGBELoader.c21bf86e1706673670030.js";const v=m({__name:"skyBoxCmesh",props:{texture:{}},async setup(c){let e,r;const p=c,{scene:a}=d(),t=([e,r]=f(()=>k(p.texture)),e=await e,r(),e);return a.value.environment=t,a.value.background=t,(b,G)=>null}}),B=s("TresPerspectiveCamera",{position:[15,15,15],fov:45,near:.1,far:1e4,"look-at":[0,0,0]},null,-1),w=s("TresMesh",{position:[10,2,-4],"cast-shadow":""},[s("TresBoxGeometry",{args:[2,2,2]}),s("TresMeshNormalMaterial")],-1),S={position:[0,0,0]},V=m({__name:"skyBoxC",setup(c){const e={clearColor:"#201919",windowSize:!0,toneMapping:C,toneMappingExposure:.8};return(r,p)=>{const a=i("TorusKnotGeometry"),t=i("MeshStandardMaterial");return l(),_(n(g),h(x(e)),{default:u(()=>[B,o(n(M),{enableDamping:""}),o(n(y),{args:[3,3,3],color:"orange",position:[-13,0,1]}),w,s("TresMesh",S,[o(a,{args:[3,1,64,8,2,3]}),o(t,{color:"0xffffff",metalness:1,roughness:.14})]),(l(),_(T,null,{default:u(()=>[o(v,{texture:"https://opensource-1314935952.cos.ap-nanjing.myqcloud.com/images/skyBox/desert_1k.hdr"})]),_:1}))]),_:1},16)}}});export{V as default};