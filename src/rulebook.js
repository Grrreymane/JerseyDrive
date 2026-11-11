// 文案：违规解释、教练提示、标志图鉴。规则按新泽西州驾驶手册（NJ Driver Manual）的说法写。

/** 事件 → { title, body }。body 是“为什么错 + 正确做法” */
export const EVENT_TEXT = {
  red_light: (e) => e.afterStop
    ? { title: '红灯时不能' + (e.turn === 'left' ? '左转' : '直行'), body: '红灯下唯一允许的动作是右转：先在停止线前完全停住，确认没有车和行人再转。新泽西不允许红灯左转。' }
    : { title: '闯红灯', body: '红灯必须在白色停止线前完全停住，等绿灯再走。想右转也要先停稳，不能直接拐过去。' },
  stop_sign: () => ({ title: '没有在 STOP 前停车', body: 'STOP 标志前必须完全停住（速度归零），停在白色停止线前；没有停止线就停在人行横道前。左、右、再左看一遍，确认安全再走。' }),
  rolling_stop: (e) => ({ title: '滑行通过 STOP（没停稳）', body: `你最慢时还有约 ${Math.round(e.mph)} mph。减速不等于停车，车必须完全静止。这是路考最常见的扣分项。` }),
  over_line: () => ({ title: '停得太靠前', body: '车头越过了停止线，压到人行横道上了。应该让车头停在白色停止线之前。' }),
  wrong_way: () => ({ title: '逆行：这是单行道', body: '进路口前看路口的 ONE WAY 箭头牌，箭头指向哪边，车就只能往哪边开。看到红底白杠的 DO NOT ENTER 就不能进。' }),
  wrong_side: () => ({ title: '开到了对向车道', body: '双黄线不能跨越。在双向路上始终靠中线右侧行驶。' }),
  speeding: (e) => ({ title: `超速：限速 ${e.limit}，你开到 ${Math.round(e.mph)} mph`, body: '新泽西居民区和商业区默认限速 25 mph，有标志时以标志为准。市区里行人和路边车门多，宁慢勿快。' }),
  no_signal: (e) => ({ title: (e.turn === 'left' ? '左' : '右') + '转没打转向灯', body: '转弯前至少 100 英尺（约 30 米，大概 6 个车身）就要打灯，让后车和行人知道你要去哪。' }),
  late_signal: (e) => ({ title: '转向灯打晚了', body: `你在路口前约 ${Math.round(e.dist)} 米才打灯。新泽西要求至少提前 100 英尺（约 30 米）。` }),
  wrong_lane_from: (e) => ({ title: e.turn === 'through' ? '从转弯专用道直行了' : (e.turn === 'left' ? '左转' : '右转') + '的起始车道不对', body: '左转从最左边的车道（靠中线）出发，右转从最右边的车道出发。地上画了箭头的，按箭头走。要换道得在进路口之前换好。' }),
  wrong_lane_into: (e) => ({ title: (e.turn === 'left' ? '左转' : '右转') + '后进错了车道', body: e.turn === 'left' ? '左转要转进目标道路最靠左（最靠中线）的那条车道。转完、走直了，再打灯变道。' : '右转要贴着路缘，转进目标道路最右边的那条车道，不要甩到外侧车道。' }),
  lane_no_signal: (e) => ({ title: '变道没打转向灯', body: '变道前：看后视镜 → 打灯 → 回头看盲区 → 再变道。' }),
  no_yield: (e) => e.why === 'oncoming' ? { title: '左转没有让对向直行的车', body: '绿灯（没有左转箭头）时左转是“让行左转”：对向直行和右转的车先走。车头可以先进路口等，等对向有足够大的空当再转。' }
    : e.why === 'first' ? { title: '抢了先到的车', body: '全向停车（ALL WAY）按到达顺序走：谁先停稳谁先走；同时到，让右手边的车。对方先停下了，就等它过去。' }
    : e.why === 'inJ' ? { title: '路口里还有车就开进去了', body: '停稳之后先看路口里面：已经在路口里的车有路权，等它开出去再走。' }
    : { title: '没有让横向来车', body: '你这边有 STOP（或红灯右转），横向的车不用停。停稳后往左、往右、再往左看，来车离得近就等它过去。' },
  good_lane: () => ({ title: '变道规范 ✓', body: '先打灯，看后视镜和盲区，再平顺地并过去。' }),
  good_yield: () => ({ title: '礼让行人 ✓', body: '停在斑马线前，等人走过去再起步。' }),
  no_yield_ped: () => ({ title: '没有礼让斑马线上的行人', body: '新泽西州：行人在斑马线上时，车必须停下并保持停住，等人走过你这半边路。转弯时尤其要先看要开进去的那条路的斑马线。' }),
  hit_ped: () => ({ title: '撞到行人', body: '最严重的事故。接近路口和斑马线时脚先移到刹车上，车速降到随时能停下来。' }),
  hit_car: () => ({ title: '撞到别的车', body: '和前车保持至少 3 秒车距；进路口前确认横向和对向的车离得够远。' }),
  crash: () => ({ title: '碰到了路边停着的车', body: '窄路上和停着的车至少留出一个车门的宽度（约 1 米）。眼睛看远处的路中间，不要盯着旁边的车。' }),
  off_road: () => ({ title: '开上了人行道', body: '转弯时车速要降到 10 mph 左右，方向打得晚了就会冲出去。已帮你把车摆回车道。' }),
  map_edge: () => ({ title: '到地图边界了', body: '已帮你掉头。' }),
  good_stop: () => ({ title: 'STOP 停得很标准', body: '' }),
  good_ror: () => ({ title: '红灯右转：先停稳再转，正确', body: '' }),
  good_turn: (e) => ({ title: (e.turn === 'left' ? '左转' : '右转') + '完成：打灯、车道都对', body: '' }),
};
export const EVENT_SHORT = {
  red_light: '闯红灯', stop_sign: 'STOP 没停', rolling_stop: 'STOP 没停稳', over_line: '越过停止线', wrong_way: '单行道逆行', wrong_side: '压到对向车道', speeding: '超速',
  no_yield: '没让有路权的车', no_yield_ped: '没礼让行人', hit_ped: '撞到行人', hit_car: '撞到别的车',
  no_signal: '转弯没打灯', late_signal: '打灯太晚', wrong_lane_from: '转弯起始车道不对', wrong_lane_into: '转弯后进错车道', lane_no_signal: '变道没打灯', crash: '碰撞', off_road: '开上人行道',
  good_lane: '变道规范', good_yield: '礼让行人', good_stop: 'STOP 完全停稳', good_ror: '红灯右转正确', good_turn: '转弯规范',
};

/** 教练提示（接近路口时） */
/** 该让谁（比路口提示优先） */
export const ALERT_TEXT = {
  ped: { icon: 'info', text: '前方斑马线有行人：停车，等人走过去', sub: '人在斑马线上或者正要踏上来，车都要停；停在斑马线前面，不要压上去' },
  car: { icon: 'info', text: '有车比你有路权：等它先走', sub: '你有 STOP、对方没有，就等对方过去；全向停车时谁先停稳谁先走' },
  inJ: { icon: 'info', text: '路口里有车：等它开出去', sub: '已经在路口里的车先走' },
  oncoming: { icon: 'info', text: '左转要让对向直行的车', sub: '可以先把车头开进路口、摆正方向盘等着，对向没车了再转' },
};
export function hintText(h) {
  if (!h) return null;
  const near = h.d < 30;
  switch (h.kind) {
    case 'stop': return { icon: 'stop', text: h.stopped ? '已停稳。左、右、再左看一遍，没车没人就走' : near ? '松油门、踩刹车，车头停在白色停止线前，完全停住' : '前方 STOP：准备在停止线前完全停住', sub: '横向的车不用停，你要等它们过完' + (h.inferred ? '　·　此处标志是按道路等级推断的' : '') };
    case 'allway': return { icon: 'stop', text: h.stopped ? '已停稳。先到的先走；同时到，让右手边的车' : near ? '松油门、踩刹车，车头停在白色停止线前，完全停住' : '前方 ALL WAY STOP：所有方向都要停', sub: '先到先走；同时到让右边；对向同时到，直行的先于左转的' + (h.inferred ? '　·　此处标志是按道路等级推断的' : '') };
    case 'signal':
      if (h.state === 'G') return { icon: 'G', text: '绿灯：可以通过', sub: '左转要让对向直行的车和过马路的行人；右转让行人' };
      if (h.state === 'Y') return { icon: 'Y', text: '黄灯：能安全停下就停', sub: '已经压到停止线或停不住时才继续通过，不要加速抢灯' };
      return { icon: 'R', text: near ? '红灯：车头停在白色停止线前' : '前方红灯：松油门，准备停车', sub: '要右转：停稳、确认没车没人后可以转。左转和直行必须等绿灯' };
    case 'priority': return { icon: 'info', text: '这个路口你不用停，横向的车有 STOP', sub: '仍然松油门看一眼，对方不一定会让' };
  }
  return null;
}

/** 标志图鉴 */
export const SIGN_BOOK = [
  { cat: '管制（红 / 白底，必须遵守）' },
  { id: 'stop', en: 'STOP', zh: '停车', tip: '完全停住，车头不过停止线。看清左右再走。' },
  { id: 'allway', en: 'ALL WAY', zh: '全向停车', tip: '挂在 STOP 下面：每个方向都要停。先到先走，同时到让右手边。' },
  { id: 'yield', en: 'YIELD', zh: '让行', tip: '减速，有车有人就停下让他们先走；没有就可以不停。' },
  { id: 'dne', en: 'DO NOT ENTER', zh: '禁止驶入', tip: '这条路对着你是出口。不要进，进去就是逆行。' },
  { id: 'wrongway', en: 'WRONG WAY', zh: '方向错了', tip: '你已经在逆行。马上靠边停下，安全地掉头。' },
  { id: 'oneway_r', en: 'ONE WAY', zh: '单行道', tip: '横着的这条路只能按箭头方向开。箭头朝右，你就只能右转进去。' },
  { id: 'speed25', en: 'SPEED LIMIT', zh: '限速（英里/小时）', tip: '最高车速。新泽西居民区、商业区默认 25 mph，学校区域 25 mph。' },
  { id: 'notor', en: 'NO TURN ON RED', zh: '红灯禁止转弯', tip: '有这块牌子的路口，红灯时不能右转，必须等绿灯。' },
  { id: 'noleft', en: 'NO LEFT TURN', zh: '禁止左转', tip: '红圈加斜杠 = 禁止。新泽西很多大路不让直接左转，要走右边的 jughandle 匝道绕过去。' },
  { id: 'noright', en: 'NO RIGHT TURN', zh: '禁止右转', tip: '这个路口不能右转。' },
  { id: 'nouturn', en: 'NO U-TURN', zh: '禁止掉头', tip: '这里不能掉头。' },
  { id: 'keepright', en: 'KEEP RIGHT', zh: '靠右行驶', tip: '前面有隔离岛或障碍，从它右边过。' },
  { id: 'leftonly', en: 'LEFT TURN ONLY', zh: '左转专用道', tip: '进了这条车道就只能左转，不能直行。' },
  { id: 'stophere', en: 'STOP HERE ON RED', zh: '红灯在此停车', tip: '停止线位置比平常靠后，红灯时停在牌子指的线前。' },
  { id: 'nopark', en: 'NO PARKING', zh: '禁止停车', tip: '可以临时上下客，但人不能离开车。另外消防栓前后 10 英尺、人行横道前 25 英尺、STOP 前 50 英尺内都不能停。' },
  { cat: '警告（黄色菱形，提醒前方情况）' },
  { id: 'signalahead', en: 'SIGNAL AHEAD', zh: '前方有红绿灯', tip: '提前松油门，准备停车。' },
  { id: 'stopahead', en: 'STOP AHEAD', zh: '前方有 STOP', tip: '被弯道或坡挡住看不见 STOP 时会先放这块牌子。' },
  { id: 'pedxing', en: 'PEDESTRIAN CROSSING', zh: '人行横道', tip: '新泽西法律：行人在人行横道里，车必须停下并保持停住，不只是减速。' },
  { id: 'school', en: 'SCHOOL ZONE', zh: '学校区域', tip: '五边形荧光黄绿色。有孩子时限速 25 mph。校车闪红灯伸出 STOP 牌时，双向的车都要在 25 英尺外停住。' },
  { id: 'merge', en: 'MERGE', zh: '车道汇入', tip: '旁边有车道并进来。主路的车有路权，汇入的车调整车速找空当。' },
  { id: 'laneends', en: 'LANE ENDS', zh: '车道减少', tip: '你这条或旁边那条车道要没了，提前打灯并线。' },
  { id: 'twoway', en: 'TWO-WAY TRAFFIC', zh: '双向交通', tip: '从单行道出来，前面变成双向路，注意靠右。' },
  { id: 'deadend', en: 'DEAD END', zh: '断头路', tip: '前面没有出口，只能掉头回来。' },
  { id: 'rr', en: 'RAILROAD CROSSING', zh: '铁路道口', tip: '减速、看、听。栏杆落下或红灯闪时在 15 英尺外停住。' },
  { cat: '路面箭头' },
  { id: 'pv_left', en: 'LEFT ONLY', zh: '只能左转', tip: '车道地面画着这个箭头：进了这条道就得左转。', dark: true },
  { id: 'pv_through_left', en: 'THROUGH / LEFT', zh: '直行或左转', tip: '这条道可以直行，也可以左转。', dark: true },
  { id: 'pv_through_right', en: 'THROUGH / RIGHT', zh: '直行或右转', tip: '这条道可以直行，也可以右转。', dark: true },
];

export const SHIFT_MSG = { need_brake: '先踩住刹车（S），才能从 P 挡换出来', need_stop: '车停稳了才能换这个挡' };
