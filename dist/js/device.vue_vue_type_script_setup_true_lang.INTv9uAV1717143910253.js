import{a5 as y,aH as L,aI as R,ao as S,bR as p,aa as N,aD as A,o as D,c as E,T as G,ad as H}from"./vendor.DmiBkafs1717143910253.js";import{r as z,u as F}from"./device.NftMjkv91717143910253.js";const I=["object"],X=y({__name:"device",props:{threshold:{default:0},strength:{default:.972},radius:{default:.21}},async setup(v){let l,u;const t=v,{nodes:r}=([l,u]=L(()=>R("./plugins/industry4/model/modelDraco.glb",{draco:!0,decoderPath:"./draco/"})),l=await l,u(),l),g=z(r.Sketchfab_model),{camera:h,renderer:f,scene:s,sizes:m}=S();let n=null,d=null,a=null;const M=new p({color:"black"});N(()=>{if(h.value){f.value.setPixelRatio(window.devicePixelRatio),s.value.add(g);const{finalComposer:e,effectComposer:o,bloomPass:P}=F(s.value,h.value,f.value,m.width.value,m.height.value);n=e,d=o,a=P,a.threshold=t.threshold,a.strength=t.strength,a.radius=t.radius}t.threshold&&(a.threshold=t.threshold),t.strength&&(a.strength=t.strength),t.radius&&(a.radius=t.radius)});const i={},b=e=>{(e.isMesh||e.type==="GridHelper"||e.name==="reflectorShaderMesh")&&(i[e.uuid]=e.material,e.material=M)},k=e=>{i[e.uuid]&&(e.material=i[e.uuid],delete i[e.uuid])},{onLoop:w,onAfterLoop:B}=H();let _=.03,c=r.Sketchfab_model.getObjectByName("canister_turbine_011_Nickel-Light-PBR_0"),x=c.material.clone(),C=new p({color:new A("red"),transparent:!0,opacity:1});return w(({elapsed:e})=>{r.hull_turbine&&(r.hull_turbine.rotation.x+=_,r.blades_turbine_003.rotation.x+=_),Math.floor(e)%2?c.material=x:c.material=C}),B(({elapsed:e})=>{d&&(s.value.traverse(o=>{b(o)}),d.render(e)),n&&(s.value.traverse(o=>{k(o)}),n.render(e))}),(e,o)=>(D(),E("primitive",{object:G(r).Sketchfab_model},null,8,I))}});export{X as _};