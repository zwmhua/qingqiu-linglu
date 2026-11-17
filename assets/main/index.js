System.register("chunks:///_virtual/BootView.ts",["./rollupPluginModLoBabelHelpers.js","cc"],(function(e){var t,n,i,o,r,l,a,c,s,u,d,f,h,p,v,w,C,g;return{setters:[function(e){t=e.applyDecoratedDescriptor,n=e.inheritsLoose,i=e.initializerDefineProperty,o=e.assertThisInitialized},function(e){r=e.cclegacy,l=e._decorator,a=e.SpriteFrame,c=e.view,s=e.ResolutionPolicy,u=e.Sprite,d=e.Color,f=e.Graphics,h=e.Node,p=e.UITransform,v=e.Label,w=e.assetManager,C=e.Component,g=e.director}],execute:function(){var y,b,m,R,A;r._RF.push({},"34d59RhDmBHI7kGyctMPBvL","BootView",void 0);e("BootView",(y=l.ccclass("BootView"),b=l.property(a),y((A=t((R=function(e){function t(){for(var t,n=arguments.length,r=new Array(n),l=0;l<n;l++)r[l]=arguments[l];return t=e.call.apply(e,[this].concat(r))||this,i(t,"titleArt",A,o(t)),t}n(t,e);var r=t.prototype;return r.start=function(){c.setDesignResolutionSize(1334,750,s.SHOW_ALL),this.child("标题背景",0).addComponent(u).spriteFrame=this.titleArt,this.label("青丘灵录",160,94,new d(255,232,171),540);var e=this.label("",-239,28,new d(255,242,212),350),t=this.child("加载进度",0).addComponent(f),n=this.child("启动操作",-296),i=n.addComponent(f);i.fillColor=new d(33,67,55,245),i.roundRect(-151,-26,302,52,10),i.fill(),i.lineWidth=2,i.strokeColor=new d(238,198,112),i.roundRect(-151,-26,302,52,10),i.stroke();var o=this.label("",0,29,new d(255,232,171),302,n);n.active=!1;var r=function(n){t.clear(),t.fillColor=new d(20,43,38,220),t.roundRect(-160,-204,320,12,6),t.fill(),t.fillColor=new d(238,198,112),n>0&&(t.roundRect(-160,-204,320*n,12,6),t.fill()),e.string=Math.floor(100*n)+"%"},l=function(e,t){o.string=e,n.active=!0,o.node.once(h.EventType.TOUCH_END,t)};this.scheduleOnce((function e(){n.active=!1,r(0);var t=function(t){console.warn("battle",t),l("加载失败，点击重试",e)};w.loadBundle("battle",(function(e,n){if(e)return t(e);n.loadScene("Battle",(function(e,t){return r(t?Math.min(.99,e/t):0)}),(function(e,n){if(e)return t(e);r(1),l("开始游戏",(function(){return g.runScene(n)}))}))}))}))},r.child=function(e,t,n){void 0===n&&(n=this.node);var i=new h(e);return i.layer=n.layer,n.addChild(i),i.setPosition(0,t),i},r.label=function(e,t,n,i,o,r){void 0===r&&(r=this.node);var l=this.child(e,t,r);l.addComponent(p).setContentSize(o,n+20);var a=l.addComponent(v);return Object.assign(a,{string:e,fontSize:n,lineHeight:n,color:i,overflow:v.Overflow.CLAMP,horizontalAlign:v.HorizontalAlign.CENTER,verticalAlign:v.VerticalAlign.CENTER,enableOutline:!0,outlineColor:new d(23,42,34),outlineWidth:2}),a},t}(C)).prototype,"titleArt",[b],{configurable:!0,enumerable:!0,writable:!0,initializer:function(){return null}}),m=R))||m));r._RF.pop()}}}));

System.register("chunks:///_virtual/main",["./BootView.ts","./platform.ts"],(function(){return{setters:[null,null],execute:function(){}}}));

System.register("chunks:///_virtual/platform.ts",["cc"],(function(e){var t;return{setters:[function(e){t=e.cclegacy}],execute:function(){e({browserParams:function(e,t){var r;if(e&&"string"==typeof(null==t||null==(r=t.location)?void 0:r.search)&&"function"==typeof t.URLSearchParams)return new t.URLSearchParams(t.location.search);return{get:function(){return null}}},wechatStorage:function(e){return{getItem:function(t){return e.getStorageSync(t)||null},setItem:function(t,r){return e.setStorageSync(t,r)},removeItem:function(t){return e.removeStorageSync(t)}}}}),t._RF.push({},"7e88ec/62ZEaZSiZB8zaQe+","platform",void 0);var r="qingqiu-linglu:test-progress";e("progressIO",{read:function(e){return e.getItem(r)},write:function(e,t){return e.setItem(r,t)},clear:function(e){return e.removeItem(r)}});t._RF.pop()}}}));

(function(r) {
  r('virtual:///prerequisite-imports/main', 'chunks:///_virtual/main'); 
})(function(mid, cid) {
    System.register(mid, [cid], function (_export, _context) {
    return {
        setters: [function(_m) {
            var _exportObj = {};

            for (var _key in _m) {
              if (_key !== "default" && _key !== "__esModule") _exportObj[_key] = _m[_key];
            }
      
            _export(_exportObj);
        }],
        execute: function () { }
    };
    });
});