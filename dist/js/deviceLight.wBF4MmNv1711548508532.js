import{a0 as _,a1 as o,a2 as u,a3 as f,a4 as h,aq as g,r as v,o as n,c as C,a,K as r,D as i,a7 as B,E as T,ab as w,a9 as l,aa as p,v as S,ag as b,X as t}from"./vendor.gReklx3b1711548508532.js";/* empty css                                                                                 */import{_ as x}from"./randomLoading.vue_vue_type_script_setup_true_lang.XcJ3tMVe1711548508532.js";import{_ as P}from"./device.vue_vue_type_script_setup_true_lang.UYJQIQHo1711548508532.js";import"./starLoading.12IgYgFP1711548508532.js";import"./bubbleLoading.dQ4d-tC11711548508532.js";import"./device.ii5BlGHV1711548508532.js";import"./BufferGeometryUtils.co2T2tkM1711548508532.js";import"./EffectComposer.9RmE51_11711548508532.js";import"./UnrealBloomPass.FcPLvq3i1711548508532.js";const M=t("TresPerspectiveCamera",{position:[5,5,5],fov:45,near:1,far:1e3},null,-1),R=t("TresAmbientLight",{color:"#ffffff",intensity:"40"},null,-1),k=t("TresDirectionalLight",{position:[0,2,-4],intensity:1},null,-1),y=t("TresGridHelper",{position:[0,-1,0]},null,-1),K=_({__name:"deviceLight",setup(L){const c=o({clearColor:"#000",shadows:!0,alpha:!1,shadowMapType:u,outputColorSpace:f,toneMapping:h,disableRender:!0}),d=o({autoRotate:!0}),e=o({threshold:0,strength:.6,radius:.21}),s=new g({title:"参数"});return s.addBinding(e,"threshold",{label:"阈值",min:0,max:1,step:.1}),s.addBinding(e,"strength",{label:"强度",min:0,max:3,step:.2}),s.addBinding(e,"radius",{label:"半径",min:0,max:1,step:.1}),(N,z)=>{const m=v("TresCanvas");return n(),C(T,null,[a(r(x)),a(m,B(c,{"window-size":""}),{default:i(()=>[M,a(r(w),l(p(d)),null,16),R,k,(n(),S(b,null,{default:i(()=>[a(P,l(p(e)),null,16)]),_:1})),y]),_:1},16)],64)}}});export{K as default};