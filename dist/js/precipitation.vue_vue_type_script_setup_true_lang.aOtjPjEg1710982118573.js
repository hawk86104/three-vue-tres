import{$ as u,a0 as f,aD as d,bd as r,k as m,a5 as g,w as y,o as _,v as w,K as h,c8 as v}from"./vendor.arGmYKdh1710982118573.js";const C=u({__name:"precipitation",props:{speed:{default:12},randomness:{default:0},count:{default:6e3},size:{default:7},areaX:{default:1500},areaY:{default:1e3},areaZ:{default:1500},type:{default:"snow"},color:{default:"#fff"}},async setup(c){let s,p;const a=c,t={snow:"./plugins/digitalCity/image/snow.png",rain:"./plugins/digitalCity/image/rain.png",cilcle:"./plugins/digitalCity/image/cilcle.png"},e=f({});t[a.type]&&(e.value=([s,p]=d(()=>r({map:t[a.type]})),s=await s,p(),s));const l=m();return g(async()=>{}),y(()=>a.type,async(i,o)=>{var n;i!=o&&((n=e.value)!=null&&n.map&&e.value.map.dispose(),e.value=await r({map:t[i]?t[i]:t.cilcle}))}),(i,o)=>(_(),w(h(v),{ref_key:"precipitationRef",ref:l,position:[0,a.areaY/2,0],speed:a.speed,color:a.color,alphaTest:.5,area:[a.areaX,a.areaY,a.areaZ],count:a.count,depthWrite:!0,randomness:a.randomness,size:a.size,opacity:1,map:e.value.map,alphaMap:e.value.map},null,8,["position","speed","color","area","count","randomness","size","map","alphaMap"]))}});export{C as _};