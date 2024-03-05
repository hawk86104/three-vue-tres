import{i as G,r as N,c as E,p as O,a as W,l as Y,m as X,d as z}from"./mat4.QgLY7Rov1709613738534.js";import{$ as H,a6 as k,o as q,c as V}from"./vendor.briXmWCi1709613738534.js";const j={id:"canvaswebgl",style:{height:"500px",width:"500px"}},K="\nattribute vec4 a_position;\nattribute vec2 a_texcoord;\nuniform mat4 u_matrix;\nvarying vec2 v_texcoord;\nvoid main() {\n  gl_Position = u_matrix * a_position;\n  v_texcoord = a_texcoord;\n}",$="\nprecision mediump float;\nvarying vec2 v_texcoord;\nuniform sampler2D u_texture;\nvoid main(){\n	gl_FragColor=texture2D(u_texture, v_texcoord.xy);\n}\n",te=H({__name:"webglFrameBuffer",setup(J){const C=function(){var r=document.querySelector("#canvaswebgl"),e=r.getContext("webgl");if(!e)return;var s=G(e,K,$),f=e.getAttribLocation(s,"a_position"),l=e.getAttribLocation(s,"a_texcoord"),y=e.getUniformLocation(s,"u_matrix"),I=e.getUniformLocation(s,"u_texture"),A=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,A),M(e);var x=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,x),h(e);var d=e.createTexture();e.bindTexture(e.TEXTURE_2D,d);{const a=e.RGBA,t=1,n=1,i=0,c=e.RGBA,T=e.UNSIGNED_BYTE,m=new Uint8Array([255,255,0,255]);e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texImage2D(e.TEXTURE_2D,0,a,t,n,i,c,T,m),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}const R=256,u=256,v=e.createTexture();e.bindTexture(e.TEXTURE_2D,v);{const a=e.RGBA,t=0,n=e.RGBA,i=e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,a,R,u,t,n,i,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}const F=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,F);const w=e.COLOR_ATTACHMENT0;e.framebufferTexture2D(e.FRAMEBUFFER,w,e.TEXTURE_2D,v,0);var U=z(0),b=0;requestAnimationFrame(B);function p(o){e.useProgram(s),e.enableVertexAttribArray(f),e.bindBuffer(e.ARRAY_BUFFER,A);var a=3,t=e.FLOAT,n=!1,i=0,c=0;e.vertexAttribPointer(f,a,t,n,i,c),e.enableVertexAttribArray(l),e.bindBuffer(e.ARRAY_BUFFER,x);var a=2,t=e.FLOAT,n=!1,i=0,c=0;e.vertexAttribPointer(l,a,t,n,i,c);var T=E();O(T,-30,o,.1,1e4);var m=[0,0,2],D=[0,1,0],S=[0,0,0];let _=E();_=W(_,_,U,[0,1,0]);var g=E();Y(g,m,S,D);let P=E();X(P,g,_);var L=E();X(L,T,P),e.uniformMatrix4fv(y,!1,L),e.uniform1i(I,0),e.drawArrays(e.TRIANGLES,0,36)}function B(o){o*=.001;var a=o-b;b=o,U+=-.4*a,N(e.canvas),e.enable(e.CULL_FACE),e.enable(e.DEPTH_TEST);{e.bindFramebuffer(e.FRAMEBUFFER,F),e.bindTexture(e.TEXTURE_2D,d),e.viewport(0,0,R,u),e.clearColor(0,1,0,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT);const t=R/u;p(t)}{e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindTexture(e.TEXTURE_2D,v),e.viewport(0,0,e.canvas.width,e.canvas.height),e.clearColor(1,1,1,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT);const t=e.canvas.clientWidth/e.canvas.clientHeight;p(t)}requestAnimationFrame(B)}};k(()=>{C()});function M(r){var e=new Float32Array([-.5,-.5,-.5,-.5,.5,-.5,.5,-.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,-.5,-.5,-.5,-.5,.5,.5,-.5,.5,-.5,.5,.5,-.5,.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,-.5,-.5,.5,.5,.5,.5,-.5,-.5,.5,.5,.5,.5,.5,.5,.5,-.5,-.5,-.5,-.5,.5,-.5,-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,.5,-.5,-.5,-.5,-.5,-.5,.5,-.5,.5,-.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,-.5,.5,-.5,-.5,.5,.5,-.5,.5,-.5,.5,.5,-.5,.5,.5,.5,-.5,.5,.5,.5]);r.bufferData(r.ARRAY_BUFFER,e,r.STATIC_DRAW)}function h(r){r.bufferData(r.ARRAY_BUFFER,new Float32Array([0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,1,1,0,1,0,0,1,1,1,0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,1,1,0,1,0,0,1,1,1,0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,1,1,0,1,0,0,1,1,1]),r.STATIC_DRAW)}return(r,e)=>(q(),V("canvas",j))}});export{te as default};