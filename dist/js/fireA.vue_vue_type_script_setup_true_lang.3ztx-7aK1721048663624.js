import{r as n,N as e}from"./@tresjs.Xiq_TH801721048663624.js";import{C as o,M as t,V as r,aj as i,Z as s}from"./three.HEgnMaTu1721048663624.js";import{d as a,a3 as c,a2 as l,o as v,D as u,J as f,aj as x,ak as p}from"./@vue.ApkyOKE71721048663624.js";const y=h;!function(n,e){const o=h,t=b();for(;;)try{if(925112===parseInt(o(362))/1*(parseInt(o(367))/2)+-parseInt(o(380))/3+parseInt(o(384))/4+-parseInt(o(350))/5+-parseInt(o(391))/6*(parseInt(o(373))/7)+parseInt(o(387))/8*(parseInt(o(356))/9)+-parseInt(o(379))/10*(-parseInt(o(357))/11))break;t.push(t.shift())}catch(r){t.push(t.shift())}}();const m=function(){let n=!0;return function(e,o){const t=n?function(){if(o){const n=o[h(353)](e,arguments);return o=null,n}}:function(){};return n=!1,t}}();!function(){m(this,(function(){const n=h,e=new RegExp(n(390)),o=new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","i"),t=P(n(363));e[n(370)](t+"chain")&&o[n(370)](t+n(388))?P():t("0")}))()}();const d=function(){let n=!0;return function(e,o){const t=n?function(){if(o){const n=o[h(353)](e,arguments);return o=null,n}}:function(){};return n=!1,t}}();d(void 0,(function(){const n=h;let e;try{e=Function(n(389)+'{}.constructor("return this")( ));')()}catch(r){e=window}const o=e.console=e[n(371)]||{},t=[n(382),n(369),n(385),"error",n(372),n(376),n(365)];for(let i=0;i<t[n(381)];i++){const e=d.constructor.prototype[n(366)](d),r=t[i],s=o[r]||e;e.__proto__=d.bind(d),e[n(361)]=s.toString.bind(s),o[r]=e}}))();const g=["position",y(358)],z=f("TresSphereGeometry",{args:[1,32,16]},null,-1);function h(n,e){const o=b();return(h=function(n,e){return o[n-=348]})(n,e)}const w=a({__name:"fireA",props:{position:{default:[100,19,0]},fireScale:{default:60},magnitude:{default:1.3},lacunarity:{default:2},gain:{default:1}},async setup(a){const m=y;let d,h;const w=a,{map:P}=([d,h]=c((()=>e({map:"./plugins/digitalCity/image/fire.png"}))),d=await d,h(),d),b={defines:{ITERATIONS:"20",OCTIVES:"3"},uniforms:{fireScale:{type:"f",value:w.fireScale},offsetPositin:{type:"f",value:w[m(378)]},fireTex:{type:"t",value:P},color:{type:"c",value:new o(4095)},time:{type:"f",value:0},seed:{type:"f",value:19.19*Math[m(349)]()},invModelMatrix:{type:"m4",value:new t},scale:{type:"v3",value:new r(1,1,1)},noiseScale:{type:"v4",value:new i(1,2,1,.3)},magnitude:{type:"f",value:w[m(364)]},lacunarity:{type:"f",value:w[m(374)]},gain:{type:"f",value:w.gain}},vertexShader:"varying vec3 vWorldPos;\nuniform float fireScale;\nuniform vec3 offsetPositin;\nvarying vec3 vUnCameraPosition;\nvoid main(){\n    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n    vWorldPos=(modelMatrix*vec4(position,1.)).xyz;\n    vUnCameraPosition=cameraPosition-offsetPositin;\n    vWorldPos.x=vWorldPos.x-offsetPositin.x;\n    vWorldPos.y=vWorldPos.y-offsetPositin.y-.46*fireScale;\n    vWorldPos.z=vWorldPos.z-offsetPositin.z;\n    vWorldPos=vWorldPos/fireScale;\n}",fragmentShader:"uniform vec3 color;\nuniform float time;\nuniform float seed;\nuniform mat4 invModelMatrix;\nuniform vec3 scale;\n\nuniform vec4 noiseScale;\nuniform float magnitude;\nuniform float lacunarity;\nuniform float gain;\n\nuniform sampler2D fireTex;\n\nvarying vec3 vWorldPos;\nvarying vec3 vUnCameraPosition;\n\n// GLSL simplex noise function by ashima / https://github.com/ashima/webgl-noise/blob/master/src/noise3D.glsl\n// -------- simplex noise\nvec3 mod289(vec3 x){\n    return x-floor(x*(1./289.))*289.;\n}\n\nvec4 mod289(vec4 x){\n    return x-floor(x*(1./289.))*289.;\n}\n\nvec4 permute(vec4 x){\n    return mod289(((x*34.)+1.)*x);\n}\n\nvec4 taylorInvSqrt(vec4 r){\n    return 1.79284291400159-.85373472095314*r;\n}\n\nfloat snoise(vec3 v){\n    const vec2 C=vec2(1./6.,1./3.);\n    const vec4 D=vec4(0.,.5,1.,2.);\n    \n    // First corner\n    vec3 i=floor(v+dot(v,C.yyy));\n    vec3 x0=v-i+dot(i,C.xxx);\n    \n    // Other corners\n    vec3 g=step(x0.yzx,x0.xyz);\n    vec3 l=1.-g;\n    vec3 i1=min(g.xyz,l.zxy);\n    vec3 i2=max(g.xyz,l.zxy);\n    \n    //   x0 = x0 - 0.0 + 0.0 * C.xxx;\n    //   x1 = x0 - i1  + 1.0 * C.xxx;\n    //   x2 = x0 - i2  + 2.0 * C.xxx;\n    //   x3 = x0 - 1.0 + 3.0 * C.xxx;\n    vec3 x1=x0-i1+C.xxx;\n    vec3 x2=x0-i2+C.yyy;// 2.0*C.x = 1/3 = C.y\n    vec3 x3=x0-D.yyy;// -1.0+3.0*C.x = -0.5 = -D.y\n    \n    // Permutations\n    i=mod289(i);\n    vec4 p=permute(permute(permute(\n                i.z+vec4(0.,i1.z,i2.z,1.))\n                +i.y+vec4(0.,i1.y,i2.y,1.))\n                +i.x+vec4(0.,i1.x,i2.x,1.));\n                \n                // Gradients: 7x7 points over a square, mapped onto an octahedron.\n                // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)\n                float n_=.142857142857;// 1.0/7.0\n                vec3 ns=n_*D.wyz-D.xzx;\n                \n                vec4 j=p-49.*floor(p*ns.z*ns.z);//  mod(p,7*7)\n                \n                vec4 x_=floor(j*ns.z);\n                vec4 y_=floor(j-7.*x_);// mod(j,N)\n                \n                vec4 x=x_*ns.x+ns.yyyy;\n                vec4 y=y_*ns.x+ns.yyyy;\n                vec4 h=1.-abs(x)-abs(y);\n                \n                vec4 b0=vec4(x.xy,y.xy);\n                vec4 b1=vec4(x.zw,y.zw);\n                \n                //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;\n                //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;\n                vec4 s0=floor(b0)*2.+1.;\n                vec4 s1=floor(b1)*2.+1.;\n                vec4 sh=-step(h,vec4(0.));\n                \n                vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;\n                vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;\n                \n                vec3 p0=vec3(a0.xy,h.x);\n                vec3 p1=vec3(a0.zw,h.y);\n                vec3 p2=vec3(a1.xy,h.z);\n                vec3 p3=vec3(a1.zw,h.w);\n                \n                //Normalise gradients\n                vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));\n                p0*=norm.x;\n                p1*=norm.y;\n                p2*=norm.z;\n                p3*=norm.w;\n                \n                // Mix final noise value\n                vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);\n                m=m*m;\n                return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));\n            }\n            // simplex noise --------\n            \n            float turbulence(vec3 p){\n                float sum=0.;\n                float freq=1.;\n                float amp=1.;\n                \n                for(int i=0;i<OCTIVES;i++){\n                    sum+=abs(snoise(p*freq))*amp;\n                    freq*=lacunarity;\n                    amp*=gain;\n                }\n                \n                return sum;\n            }\n            \n            vec4 samplerFire(vec3 p,vec4 scale){\n                vec2 st=vec2(sqrt(dot(p.xz,p.xz)),p.y);\n                \n                if(st.x<=0.||st.x>=1.||st.y<=0.||st.y>=1.)return vec4(0.);\n                \n                p.y-=(seed+time)*scale.w;\n                p*=scale.xyz;\n                \n                st.y+=sqrt(st.y)*magnitude*turbulence(p);\n                \n                if(st.y<=0.||st.y>=1.)return vec4(0.);\n                \n                return texture2D(fireTex,st);\n            }\n            \n            vec3 localize(vec3 p){\n                return(invModelMatrix*vec4(p,1.)).xyz;\n            }\n            \n            void main(){\n                vec3 rayPos=vWorldPos;\n                vec3 rayDir=normalize(rayPos-vUnCameraPosition);\n                float rayLen=.0288*length(scale.xyz);\n                \n                vec4 col=vec4(0.);\n                \n                for(int i=0;i<ITERATIONS;i++){\n                    rayPos+=rayDir*rayLen;\n                    \n                    vec3 lp=localize(rayPos);\n                    \n                    lp.y+=.5;\n                    lp.xz*=2.;\n                    col+=samplerFire(lp,noiseScale);\n                }\n                if(col.x<.12&&col.y<.12&&col.z<.12){\n                    gl_FragColor=vec4(0,0,0,0);\n                    // gl_FragColor=col;\n                }else{\n                    gl_FragColor=col;\n                    // gl_FragColor=vec4(mix(color,col.xyz,.1),1.);\n                }\n                // gl_FragColor=vec4(1.,.0,1.,1.);\n            }\n            ",transparent:!0,depthWrite:!0,depthTest:!0,side:s},{onLoop:S}=n();return S((()=>{const n=m;b[n(359)][n(360)][n(368)]+=.01})),l((()=>{const n=m;w[n(348)]&&(b.uniforms[n(348)].value=w[n(348)]),w[n(364)]&&(b.uniforms[n(364)][n(368)]=w[n(364)]),w.lacunarity&&(b[n(359)][n(374)][n(368)]=w[n(374)]),w.gain&&(b.uniforms[n(352)][n(368)]=w[n(352)])})),(n,e)=>{const o=m;return v(),u("TresMesh",{position:w[o(378)],scale:[w[o(348)],w[o(348)],w[o(348)]],renderOrder:9999},[z,f(o(383),x(p(b)),null,16)],8,g)}}});function P(n){function e(n){const o=h;if(typeof n===o(355))return function(n){}[o(386)](o(351)).apply(o(377));1!==(""+n/n)[o(381)]||n%20==0?function(){return!0}[o(386)](o(375)+o(354)).call("action"):function(){return!1}.constructor(o(375)+"gger")[o(353)]("stateObject"),e(++n)}try{if(n)return e;e(0)}catch(o){}}function b(){const n=["5329150FvTYpd","while (true) {}","gain","apply","gger","string","77589Gwhyyt","11PSTEJf","scale","uniforms","time","toString","318BpIDTZ","init","magnitude","trace","bind","1642ogdwXh","value","warn","test","console","exception","749uiscRT","lacunarity","debu","table","counter","position","803820bFUcHB","525408viKKwK","length","log","TresShaderMaterial","2530516sgSRSZ","info","constructor","1208wLfpoi","input","return (function() ","function *\\( *\\)","6156pGzfFw","fireScale","random"];return(b=function(){return n})()}export{w as _};