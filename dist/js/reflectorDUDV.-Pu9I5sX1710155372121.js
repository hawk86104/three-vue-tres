import{$ as l,a0 as c,aF as p,o as r,v as t,D as o,K as i,a8 as d,a as n,ab as m,ag as _,a9 as f,aa as u,W as e}from"./vendor.3XUacTGZ1710155372121.js";import{_ as h}from"./reflectorDUDV.vue_vue_type_script_setup_true_lang.qG8mFY9_1710155372121.js";import"./dither.glsl.y2WXw1t-1710155372121.js";import"./OimoPhysicsBuffer.hKafzzHN1710155372121.js";const g=e("TresPerspectiveCamera",{position:[-15,15,-15],fov:45,near:.1,far:1e4,"look-at":[0,0,0]},null,-1),T=e("TresAmbientLight",{intensity:10},null,-1),v=e("TresMesh",{position:[3,1,0]},[e("TresBoxGeometry",{args:[2,2,2]}),e("TresMeshNormalMaterial",{wireframe:!0})],-1),w=e("TresMesh",{position:[0,2,4]},[e("TresBoxGeometry",{args:[1,1,1]}),e("TresMeshNormalMaterial")],-1),G=l({__name:"reflectorDUDV",setup(x){const a=c({reflectivity:2.6,showGridHelper:!0}),s=new p({title:"镜面参数",expanded:!0});return s.addBinding(a,"reflectivity",{label:"反射率",min:0,max:10,step:.1}),s.addBinding(a,"showGridHelper",{label:"显示网格"}),(B,M)=>(r(),t(i(d),{clearColor:"#201919","window-size":""},{default:o(()=>[g,n(i(m),{enableDamping:""}),T,v,w,(r(),t(_,null,{default:o(()=>[n(h,f(u(a)),null,16)]),_:1}))]),_:1}))}});export{G as default};