import{$ as _,ak as E,a5 as M,a4 as k,o as w,v as P,K as c,aM as L,au as N,aZ as R,at as T,ar as V,a$ as $,D as y,a8 as z,a as f,ab as F,W as d}from"./vendor.briXmWCi1709613738534.js";import{R as p,E as G}from"./EffectComposer.fCfeNZhv1709613738534.js";import{U as H}from"./UnrealBloomPass.tywpNhIw1709613738534.js";import{F as S}from"./FilmPass.E-WHDrPJ1709613738534.js";const U=_({__name:"bloomPass",setup(v){const{camera:n,renderer:i,scene:g,sizes:s}=E(),l={threshold:0,strength:.972,radius:.21};let e=null;const b=(a,t,m,h,u)=>{const r=new p(a,t),o=new H(new R(h,u),l.strength,l.radius,l.threshold);e=new G(m),e.addPass(r),e.addPass(o)},C=(a,t,m,h,u)=>{let r=new T(new V(1,1,1),new $);r.position.set(0,2,-4),a.add(r);var o=new p(a,t);o.clear=!1,e.addPass(o);const B=new S;e.addPass(B)};M(()=>{s.width.value&&(b(g.value,n.value,i.value,s.width.value,s.height.value),C(new N,n.value,i.value,s.width.value,s.height.value))});const{onLoop:x}=k();return x(()=>{e&&e.render()}),(a,t)=>(w(),P(c(L),{args:[1,1,1],color:"orange",position:[3,2,1]}))}}),A=d("TresPerspectiveCamera",{position:[10,10,10]},null,-1),D=d("TresAmbientLight",{intensity:1},null,-1),I=d("TresGridHelper",{args:[10,10]},null,-1),q=_({__name:"bloomPass",setup(v){return(n,i)=>(w(),P(c(z),{disableRender:"","window-size":""},{default:y(()=>[A,D,f(c(F)),I,f(U)]),_:1}))}});export{q as default};