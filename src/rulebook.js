// 文案：违规解释、教练提示、标志图鉴。按新泽西州驾驶手册（NJ Driver Manual）写，只说重点。

const TURN_ZH = { left: '左转', right: '右转', through: '直行', uturn: '掉头' };

/** 事件 → { title, body }。body 一两句：怎么做才对 */
export const EVENT_TEXT = {
  red_light: (e) => e.afterStop && e.ntor && e.turn === 'right'
    ? { title: '这个路口禁止红灯右转', body: '挂了 NO TURN ON RED，要等绿灯。' }
    : e.afterStop
    ? { title: '红灯时不能' + (e.turn === 'left' ? '左转' : '直行'), body: '红灯只能先停稳再右转（单行道进单行道也能左转）。其它等绿灯。' }
    : { title: '闯红灯', body: '停在白线前等绿灯。右转也要先停稳。' },
  turn_ban: (e) => ({ title: '这里禁止' + TURN_ZH[e.turn], body: '路口前有牌子不让这样走。先直行，下个路口绕回来。' }),
  stop_sign: () => ({ title: 'STOP 没停', body: '停在白线前，速度到 0，左右看清再走。' }),
  rolling_stop: (e) => ({ title: 'STOP 没停稳', body: `最慢还有 ${Math.round(e.mph)} mph。减速不算停。` }),
  over_line: () => ({ title: '停得太靠前', body: '车头停在白线前，别压斑马线。' }),
  wrong_way: () => ({ title: '单行道逆行', body: '看 ONE WAY 箭头，只能顺着开。DO NOT ENTER 不能进。' }),
  wrong_side: (e) => ({ title: '开到了对向车道', body: e.nomark ? '中间没画线也要靠右半边开。' : '靠中线右边开。双黄线能跨过去左转、掉头，但不能在对面开。' }),
  uturn_ok: () => ({ title: '这里可以掉头', body: '打左灯，两边看。一把转不过来就三点掉头。' }),
  uturn_curve: (e) => ({ title: '在弯道附近掉头', body: `前后拐了约 ${Math.round(e.deg)} 度，来车看不见你。到直路上再掉头。` }),
  uturn_block: () => ({ title: '掉头挡住了来车', body: '来车要远到不用刹车才掉头。车多就绕一个街区。' }),
  uturn_highway: () => ({ title: '在高速上掉头', body: '高速和匝道不能掉头，走下个出口。' }),
  back_highway: () => ({ title: '在高速上倒车', body: '错过出口别倒车，下个出口绕回来。' }),
  too_slow: (e) => e.stop
    ? { title: '停在了高速车道上', body: '没堵车别停。车坏了打双闪开到路边。' }
    : { title: '高速上开得太慢', body: `限速 ${e.limit}，至少开到 ${e.limit - 15}。不敢快就走最右道。` },
  speeding: (e) => e.school
    ? { title: `学校区超速：你开到 ${Math.round(e.mph)} mph`, body: '看到荧光黄绿 SCHOOL 牌就慢到 25。' }
    : { title: `超速：限速 ${e.limit}，你开到 ${Math.round(e.mph)} mph`, body: '看路边限速牌。没牌子的市区默认 25。' },
  no_signal: (e) => ({ title: (e.turn === 'left' ? '左' : '右') + '转没打灯', body: '转弯前 30 米（约 6 个车身）打灯。' }),
  late_signal: (e) => ({ title: '转向灯打晚了', body: `你离路口 ${Math.round(e.dist)} 米才打，要提前 30 米。` }),
  wrong_lane_from: (e) => ({ title: e.turn === 'through' ? '从转弯道直行了' : (e.turn === 'left' ? '左转' : '右转') + '车道不对', body: '左转走最左道，右转走最右道，有箭头按箭头。进路口前换好。' }),
  wrong_lane_into: (e) => ({ title: (e.turn === 'left' ? '左转' : '右转') + '后进错车道', body: e.turn === 'left' ? '左转进最左边的道，走直了再变道。' : '右转贴着路边，进最右边的道。' }),
  lane_no_signal: () => ({ title: '变道没打灯', body: '后视镜 → 打灯 → 回头看盲区 → 变道。' }),
  lane_solid: () => ({ title: '路口前跨白实线变道', body: '白线变实线之前就要排好道。错过了直走，绕回来。' }),
  no_yield: (e) => e.why === 'oncoming' ? { title: '左转没让对向直行', body: '没有左转箭头时对向车先走。车头可以先进路口等。' }
    : e.why === 'first' ? { title: '抢了先到的车', body: '全向停车：先停先走，同时到让右边。' }
    : e.why === 'inJ' ? { title: '路口里还有车就开进去了', body: '路口里的车先走。' }
    : { title: '没让横向来车', body: '你有 STOP，横向车不用停。看清没车再走。' },
  good_lane: () => ({ title: '变道规范 ✓', body: '' }),
  good_yield: () => ({ title: '礼让行人 ✓', body: '' }),
  no_yield_ped: () => ({ title: '没让斑马线上的行人', body: '有人在斑马线上就停住，等人走过你这半边。' }),
  hit_ped: () => ({ title: '撞到行人', body: '快到路口、斑马线时脚放在刹车上。' }),
  hit_car: (e) => ({
    rear: { title: '追尾了前车', body: '和前车留 3 秒。' },
    head: { title: '和对向的车撞上了', body: '别切弯，窄路靠右。' },
    junc: { title: '在路口里撞车了', body: '进路口前看左、右、对向。' },
    side: { title: '和旁边的车蹭上了', body: '变道前回头看盲区。' },
  }[e?.why] || { title: '撞到别的车', body: '留车距，进路口前看清来车。' }),
  rear_ended: () => ({ title: '被后车追尾（不怪你）', body: '不扣分。' }),
  rail_run: () => ({ title: '道口灯闪着还过铁轨', body: '灯闪、栏杆下就停，灯灭再走。' }),
  rail_stop: () => ({ title: '停在了铁轨上', body: '对面放得下整辆车再过铁轨。' }),
  hit_train: () => ({ title: '被火车撞了', body: '道口灯闪时绝对别进。' }),
  good_rail: () => ({ title: '在道口前等火车 ✓', body: '' }),
  no_move_over: () => ({ title: '紧挨着闪灯的警车开过去', body: '换到远一条道；换不了就比限速慢 10 mph 以上。' }),
  good_move_over: () => ({ title: '隔一条道经过警车 ✓', body: '' }),
  slow_move_over: () => ({ title: '减速经过警车 ✓', body: '' }),
  crash: () => ({ title: '碰到了路边停着的车', body: '和停着的车留 1 米，眼睛看远处路中间。' }),
  off_road: () => ({ title: '开上了人行道', body: '转弯慢到 10 mph 左右。已把车摆回车道。' }),
  map_edge: () => ({ title: '到地图边界了', body: '已帮你掉头。' }),
  good_stop: () => ({ title: 'STOP 停得很标准 ✓', body: '' }),
  good_ror: () => ({ title: '红灯右转：先停稳再转 ✓', body: '' }),
  pass_bus: () => ({ title: '开过了闪红灯的校车', body: '校车闪红灯：两个方向都停，离 25 英尺，灯灭再走。' }),
  good_bus: () => ({ title: '为校车停车 ✓', body: '' }),
  no_yield_ems: () => ({ title: '没给鸣笛的车让路', body: '打右灯停下。右边没地方就停在车道里，它会从左边绕。在路口里先开出去。' }),
  good_ems: () => ({ title: '给鸣笛的车让路 ✓', body: '' }),
  good_lor: () => ({ title: '单行道红灯左转 ✓', body: '' }),
  tailgate: (e) => ({ title: `跟车太近（${e.gap.toFixed(1)} 秒）`, body: '至少 3 秒：前车过路标后，数到 3 你才到。' }),
  block_box: () => ({ title: '堵在路口里了', body: '前面堵着就停在线前等。' }),
  keep_right: () => ({ title: '一直占着最左道', body: '左道只超车，超完回右边。' }),
  good_turn: (e) => ({ title: (e.turn === 'left' ? '左转' : '右转') + '规范 ✓', body: '' }),
};
export const EVENT_SHORT = {
  red_light: '闯红灯', turn_ban: '违反禁止转弯', rail_run: '道口闪红灯时过铁轨', rail_stop: '停在铁轨上', hit_train: '被火车撞', no_move_over: '没给路边警车让道', good_rail: '在道口前等火车', good_move_over: 'Move Over 让道', slow_move_over: 'Move Over 减速', rear_ended: '被追尾', uturn_ok: '掉头', uturn_curve: '弯道附近掉头', uturn_block: '掉头挡了来车', uturn_highway: '高速上掉头', back_highway: '高速上倒车', too_slow: '高速上太慢', pass_bus: '超过停着的校车', no_yield_ems: '没让救护车 / 警车', good_bus: '为校车停车', good_ems: '让鸣笛的车', tailgate: '跟车太近', block_box: '堵路口', keep_right: '占用超车道', good_lor: '单行道红灯左转正确', stop_sign: 'STOP 没停', rolling_stop: 'STOP 没停稳', over_line: '越过停止线', wrong_way: '单行道逆行', wrong_side: '压到对向车道', speeding: '超速',
  no_yield: '没让有路权的车', no_yield_ped: '没礼让行人', hit_ped: '撞到行人', hit_car: '撞到别的车',
  no_signal: '转弯没打灯', late_signal: '打灯太晚', wrong_lane_from: '转弯起始车道不对', wrong_lane_into: '转弯后进错车道', lane_no_signal: '变道没打灯', lane_solid: '跨白实线变道', crash: '碰撞', off_road: '开上人行道',
  good_lane: '变道规范', good_yield: '礼让行人', good_stop: 'STOP 完全停稳', good_ror: '红灯右转正确', good_turn: '转弯规范',
};

/** 该让谁（比路口提示优先） */
export const ALERT_TEXT = {
  ped: { icon: 'info', text: '斑马线有人：停车等', sub: '停在斑马线前' },
  car: { icon: 'info', text: '对方有路权：等它先走', sub: '' },
  inJ: { icon: 'info', text: '路口里有车：等它出去', sub: '' },
  bus: { icon: 'stop', text: '校车闪红灯：停车，离 8 米以上', sub: '对向也要停（有隔离带除外）' },
  ems: { icon: 'info', text: '后面有车鸣笛：减速停下', sub: '右边有空就靠右，停满车就停在车道里' },
  rail: { icon: 'stop', text: '道口灯在闪：停在停止线后', sub: '灯灭、栏杆抬起再走' },
  railx: { icon: 'info', text: '前面铁路道口：左右看', sub: '对面放得下整辆车再过' },
  railOn: { icon: 'stop', text: '你在铁轨上，火车要来了：往前开出去！', sub: '栏杆落在车上也别停' },
  moveover: { icon: 'info', text: '右边停着闪灯的警车：并到左边', sub: '并不过去就慢 10 mph 以上' },
  pullout: { icon: 'info', text: '路边的车要开出来：松油门', sub: '它该让你，但别赌' },
  close: { icon: 'info', text: '跟太近了：留 3 秒', sub: '' },
  school: { icon: 'info', text: '学校区：限速 25', sub: '' },
  oncoming: { icon: 'info', text: '左转让对向直行', sub: '可以先开进路口等' },
};
export function hintText(h) {
  if (!h) return null;
  const near = h.d < 30, inf = h.inferred ? '标志按道路等级推断' : '';
  switch (h.kind) {
    case 'stop': return { icon: 'stop', text: h.stopped ? '停稳了。左右看，没车就走' : near ? '刹车，停在白线前' : '前方 STOP', sub: inf || '横向车不用停，等它们过完' };
    case 'allway': return { icon: 'stop', text: h.stopped ? '停稳了。先到先走，同时到让右边' : near ? '刹车，停在白线前' : '前方 ALL WAY STOP：都要停', sub: inf };
    case 'signal':
      if (h.state === 'G') return { icon: 'G', text: '绿灯', sub: '左转让对向和行人' };
      if (h.state === 'Y') return { icon: 'Y', text: '黄灯：停得下就停', sub: '' };
      if (h.ntor) return { icon: 'R', text: near ? '红灯：停在白线前，不能右转' : '前方红灯', sub: 'NO TURN ON RED' };
      return { icon: 'R', text: near ? '红灯：停在白线前' : '前方红灯', sub: '停稳后可以右转' + (h.lor ? '，这里也能左转' : '') };
    case 'priority': return { icon: 'info', text: '你不用停，横向有 STOP', sub: '还是看一眼' };
  }
  return null;
}

/** 标志图鉴。on：路上会看到 */
export const SIGN_BOOK = [
  { cat: '红 / 白：必须照做' },
  { id: 'stop', on: 1, en: 'STOP', zh: '停车', tip: '完全停住，再看左右。' },
  { id: 'allway', on: 1, en: 'ALL WAY', zh: '全向停车', tip: '都要停。先到先走，同时到让右边。' },
  { id: 'yield', en: 'YIELD', zh: '让行', tip: '减速，有车有人就停下让。' },
  { id: 'dne', on: 1, en: 'DO NOT ENTER', zh: '禁止驶入', tip: '单行道的出口，别进。' },
  { id: 'wrongway', on: 1, en: 'WRONG WAY', zh: '逆行了', tip: '马上靠边，安全掉头。' },
  { id: 'oneway_r', on: 1, en: 'ONE WAY', zh: '单行道', tip: '只能往箭头方向开。' },
  { id: 'speed25', on: 1, en: 'SPEED LIMIT', zh: '限速', tip: '最高车速（mph）。没牌子的市区默认 25。' },
  { id: 'notor', on: 1, en: 'NO TURN ON RED', zh: '红灯禁止转弯', tip: '红灯右转也不行，等绿灯。' },
  { id: 'noleft', on: 1, en: 'NO LEFT TURN', zh: '禁止左转', tip: '红圈斜杠 = 禁止。' },
  { id: 'noright', on: 1, en: 'NO RIGHT TURN', zh: '禁止右转', tip: '' },
  { id: 'nostraight', on: 1, en: 'NO STRAIGHT', zh: '禁止直行', tip: '' },
  { id: 'nouturn', on: 1, en: 'NO U-TURN', zh: '禁止掉头', tip: '' },
  { id: 'leftonly', on: 1, en: 'LEFT ONLY', zh: '只准左转', tip: 'ONLY = 只能这样走。' },
  { id: 'rightonly', on: 1, en: 'RIGHT ONLY', zh: '只准右转', tip: '' },
  { id: 'straightonly', on: 1, en: 'STRAIGHT ONLY', zh: '只准直行', tip: '' },
  { id: 'allturns', en: 'ALL TURNS FROM RIGHT LANE', zh: '所有转弯走右道', tip: '新泽西 jughandle：左转也先从右边匝道出去。' },
  { id: 'donotpass', en: 'DO NOT PASS', zh: '禁止超车', tip: '不准借对向车道超车。' },
  { id: 'keepright', en: 'KEEP RIGHT', zh: '靠右', tip: '从隔离岛右边过。' },
  { id: 'pedlaw', en: 'STOP FOR PEDESTRIANS', zh: '给行人停车', tip: '新泽西立在路中间：斑马线有人必须停。' },
  { id: 'stophere', en: 'STOP HERE ON RED', zh: '红灯在此停', tip: '红灯停在牌子指的线前。' },
  { id: 'nopark', en: 'NO PARKING', zh: '禁止停车', tip: '' },
  { cat: '黄：前面有情况' },
  { id: 'signalahead', on: 1, en: 'SIGNAL AHEAD', zh: '前方红绿灯', tip: '松油门，准备停。' },
  { id: 'stopahead', on: 1, en: 'STOP AHEAD', zh: '前方 STOP', tip: '松油门，准备停。' },
  { id: 'twoway', on: 1, en: 'TWO-WAY TRAFFIC', zh: '变成双向路', tip: '单行道到头了，靠右开。' },
  { id: 'deadend', on: 1, en: 'DEAD END', zh: '断头路', tip: '前面不通，只能掉头。' },
  { id: 'pedxing', en: 'PEDESTRIAN CROSSING', zh: '人行横道', tip: '有人就停。' },
  { id: 'nopass', en: 'NO PASSING ZONE', zh: '禁止超车区', tip: '三角旗形，立在左边。' },
  { id: 'curve_r', en: 'CURVE', zh: '前方弯道', tip: '进弯前减速。' },
  { id: 'slippery', en: 'SLIPPERY WHEN WET', zh: '湿滑', tip: '下雨慢点，别急刹。' },
  { id: 'divided', en: 'DIVIDED HIGHWAY', zh: '前方有中央隔离', tip: '从隔离带右边过。' },
  { id: 'merge', en: 'MERGE', zh: '车道汇入', tip: '旁边有车并进来，留空当。' },
  { id: 'laneends', en: 'LANE ENDS', zh: '车道减少', tip: '提前打灯并线。' },
  { id: 'school', on: 1, en: 'SCHOOL', zh: '学校区', tip: '荧光黄绿五边形，限速 25。' },
  { id: 'school25', on: 1, en: 'SPEED LIMIT 25', zh: '有孩子时限速 25', tip: '' },
  { id: 'endschool', on: 1, en: 'END SCHOOL ZONE', zh: '学校区结束', tip: '' },
  { id: 'rr', on: 1, en: 'RAILROAD AHEAD', zh: '前方铁路道口', tip: '圆形黄牌。减速，看、听。' },
  { id: 'xbuck', on: 1, en: 'RAILROAD CROSSING', zh: '铁路道口', tip: '红灯一闪就停。' },
  { cat: '橙：施工' },
  { id: 'roadwork', en: 'ROAD WORK AHEAD', zh: '前方施工', tip: '减速，看工人手势。施工区罚款加倍。' },
  { cat: '指路：绿 / 蓝 / 路线牌' },
  { id: 'shield_i', en: 'INTERSTATE', zh: '州际公路', tip: '红蓝盾牌。' },
  { id: 'shield_us', en: 'US ROUTE', zh: '国道', tip: '白盾牌（新泽西有 1-9、46 等）。' },
  { id: 'shield_nj', en: 'NJ ROUTE', zh: '新泽西州道', tip: '黑底白圆。' },
  { id: 'hospital', en: 'HOSPITAL', zh: '医院', tip: '蓝牌 = 服务设施。绿牌 = 路名、方向。' },
  { cat: '路面箭头' },
  { id: 'pv_left', on: 1, en: 'LEFT ONLY', zh: '只能左转', tip: '', dark: true },
  { id: 'pv_through_left', on: 1, en: 'THROUGH / LEFT', zh: '直行或左转', tip: '', dark: true },
  { id: 'pv_through_right', on: 1, en: 'THROUGH / RIGHT', zh: '直行或右转', tip: '', dark: true },
];

export const SHIFT_MSG = { need_brake: '先踩住刹车（S），才能从 P 挡换出来', need_stop: '车停稳了才能换这个挡' };

/** 交规要点。game：游戏里会判 */
export const RULES_SHEET = [
  { game: true, t: 'STOP', d: '完全停住，停在白线前。全向停车先到先走，同时到让右边。' },
  { game: true, t: '红灯', d: '停稳后可以右转，挂 NO TURN ON RED 不行。单行道进单行道也能左转。' },
  { game: true, t: '黄灯', d: '停得下就停，别抢。' },
  { game: true, t: '斑马线有人', d: '必须停，等人过去。' },
  { game: true, t: '绿灯左转', d: '让对向直行。可以先开进路口等。' },
  { game: true, t: '打灯', d: '转弯提前 30 米。变道：后视镜 → 打灯 → 回头看 → 变。' },
  { game: true, t: '禁止转弯牌', d: '红圈斜杠 = 禁止。ONLY = 只能这样走。' },
  { game: true, t: '跟车', d: '至少 3 秒。' },
  { game: true, t: '别堵路口', d: '前面堵着就停在线前。' },
  { game: true, t: '限速', d: '看牌子。没牌子的市区 25，学校区 25。' },
  { game: true, t: '掉头', d: '双黄线可以掉头。不行：NO U TURN、弯道附近、高速、挡到来车。' },
  { game: true, t: '高速', d: '错过出口别倒车，下个出口绕回来。左道只超车。别太慢。' },
  { game: true, t: '校车闪红灯', d: '两个方向都停，离 25 英尺。' },
  { game: true, t: '救护车 / 警车鸣笛', d: '靠右停下；右边没地方就停在车道里。' },
  { game: true, t: 'Move Over', d: '路边闪灯的车：换到远一条道，换不了就减速。' },
  { game: true, t: '铁路道口', d: '灯闪、栏杆下：停在铁轨 15–50 英尺外。' },
  { game: true, t: '路上的线', d: '黄线分方向，白线分车道。实线别跨，虚线可以。路口前白线变实线，之前排好道。' },
  { game: false, t: '等左转时轮子摆正', d: '被追尾也不会被推进对向车道。' },
  { game: false, t: '闪烁的信号灯', d: '黄闪减速过，红闪当 STOP。' },
  { game: false, t: '开雨刷就开大灯', d: '下雨、起雾、天黑都要开。' },
  { game: false, t: '手机、安全带', d: '不能手拿手机，全车系安全带。' },
  { game: false, t: '哪里不能停车', d: '消防栓 10 英尺、斑马线 25 英尺、STOP 牌 50 英尺内。' },
];
