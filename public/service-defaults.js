(function(root){
  'use strict';
  const specs=[
    ['silver','银币','🪙','刷取游戏银币',['有紫狗牌有高级银币/百万',7.8],['无紫狗牌有高级银币/百万',10.8],['无紫狗牌无高级银币/百万',13.8]],
    ['exp','单车经验','⭐','单辆坦克经验',['有紫狗牌有高级经验/万',3.8],['无紫狗牌有高级经验/万',5.8],['无紫狗牌无高级经验/万',6.8]],
    ['winrate','胜率','📈','提升战斗胜率',['70%胜率/10场',17.8],['75%胜率/10场',22.8],['80%胜率/10场',32.8]],
    ['average','场均','🎯','提升场均数据',['3000场均/10场',19.8],['3300场均/10场',28.8],['3500场均/10场',37.8]],
    ['mmedal','M章','🏅','获取M级勋章',['1个M章',29.8],['3个M章',57.8],['5个M章',138.8]],
    ['rings','三环','💍','炮管环数提升',['0%到65%',59.8],['65%到85%',49.8],['85%到95%',88.8]],
    ['rating','评级','🏆','账号评级提升',['3千到4千/百分',11.8],['4千到5千/百分',14.8],['5千到6千/百分',29.8]]
  ];
  const value={projects:specs.map(([key,name,icon,description,...options])=>({key,name,icon,description,enabled:true,options:options.map(([desc,price],i)=>({key:['a','b','c'][i],desc,price,enabled:true}))})),activities:[]};
  if(typeof module==='object'&&module.exports)module.exports=value;else root.ServiceDefaults=value;
})(typeof window==='object'?window:globalThis);
