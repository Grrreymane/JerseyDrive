// 文案：违规解释、教练提示、标志图鉴。规则按新泽西州驾驶手册（NJ Driver Manual）的说法写。

/** 事件 → { title, body }。body 是“为什么错 + 正确做法” */
export const EVENT_TEXT = {
  red_light: (e) => e.afterStop && e.ntor && e.turn === 'right'
    ? { title: '这个路口禁止红灯右转', body: '路口挂着 NO TURN ON RED（红灯禁止转弯）的牌子：红灯时右转也不行，要等绿灯。新泽西默认允许红灯右转，但有这块牌子就不行。进路口前看一眼红绿灯旁边和右前方的白底黑字牌子。' }
    : e.afterStop
    ? { title: '红灯时不能' + (e.turn === 'left' ? '左转' : '直行'), body: '红灯下只有两种情况能转：右转；或者从单行道左转进另一条单行道。都要先在停止线前完全停住、让车和行人，路口没挂 NO TURN ON RED。别的情况（双向路左转、直行）都要等绿灯。' }
    : { title: '闯红灯', body: '红灯必须在白色停止线前完全停住，等绿灯再走。想右转也要先停稳，不能直接拐过去。' },
  turn_ban: (e) => ({ title: '这里禁止' + { left: '左转', right: '右转', through: '直行', uturn: '掉头' }[e.turn], body: '路口前挂着禁止' + { left: '左转', right: '右转', through: '直行', uturn: '掉头' }[e.turn] + '的牌子（红圈加斜杠），或者只准某个方向的白底黑箭头牌。进路口前看一眼路口右前方和红绿灯旁边的白色牌子；地上画了箭头的车道也只能按箭头走。要去那边就先直行，再从下一个路口绕回来。' }),
  stop_sign: () => ({ title: '没有在 STOP 前停车', body: 'STOP 标志前必须完全停住（速度归零），停在白色停止线前；没有停止线就停在人行横道前。左、右、再左看一遍，确认安全再走。' }),
  rolling_stop: (e) => ({ title: '滑行通过 STOP（没停稳）', body: `你最慢时还有约 ${Math.round(e.mph)} mph。减速不等于停车，车必须完全静止。这是路考最常见的扣分项。` }),
  over_line: () => ({ title: '停得太靠前', body: '车头越过了停止线，压到人行横道上了。应该让车头停在白色停止线之前。' }),
  wrong_way: () => ({ title: '逆行：这是单行道', body: '进路口前看路口的 ONE WAY 箭头牌，箭头指向哪边，车就只能往哪边开。看到红底白杠的 DO NOT ENTER 就不能进。' }),
  wrong_side: () => ({ title: '开到了对向车道', body: '双向路上要一直靠中线右边开。双黄线的意思是不准越线超车：跨过去左转进路边、掉头是可以的，但不能在对向车道上开。' }),
  uturn_ok: () => ({ title: '掉头：这里可以掉头', body: '新泽西没有“双黄线不能掉头”这条。不能掉头的是：挂 NO U TURN 的地方、弯道和坡顶附近（前后看不清 500 英尺）、高速和匝道、会挡到来车的时候。掉头前打左灯、两边都看，一把转不过来就三点掉头。' }),
  uturn_curve: (e) => ({ title: '在弯道附近掉头', body: `新泽西 39:4-125：弯道、坡顶附近，前后看不清 500 英尺（约 150 米）的地方不准掉头，来车看不到你。这里前后 150 米内路拐了约 ${Math.round(e.deg)} 度。开到直路上看得远的地方再掉头，或者到下一个路口绕回来。` }),
  uturn_block: () => ({ title: '掉头挡住了开过来的车', body: '新泽西 39:4-127：掉头、倒车不能妨碍别的车。掉头前两边都看，来车要远到你转完它都不用刹车；路窄、车多就别掉头，往前绕一个街区回来。' }),
  uturn_highway: () => ({ title: '在高速 / 快速路上掉头', body: '高速、快速路和匝道上不能掉头，也不能穿过中间的隔离带。新泽西的州公路上大多挂着 NO U TURN：要掉头就走 jughandle（右边的匝道）或者下一个出口。' }),
  back_highway: () => ({ title: '在高速 / 匝道上倒车', body: '错过出口千万别倒车，也别停在路上：后面的车开得快，想不到你会往回走。开到下一个出口下去，再绕回来。新泽西 39:4-127：倒车不能妨碍别的车。' }),
  too_slow: (e) => e.stop
    ? { title: '停在了高速车道上', body: '前面没堵车就别在高速车道里停下，后车很容易追尾。车出问题就打双闪，开到路边或者下一个出口再停。' }
    : { title: '高速上开得太慢', body: `新泽西 39:4-97.1：不能慢到妨碍正常车流。前面没车时跟上车流，这里限速 ${e.limit} mph，至少开到 ${e.limit - 15} 左右。不敢开快就待在最右边的车道。` },
  speeding: (e) => e.school ? { title: `超速：学校区限速 25，你开到 ${Math.round(e.mph)} mph`, body: '新泽西：经过学校时，上下学、课间、看得到孩子时限速 25 mph（游戏里没有钟点，学校区一直按 25 算）。看到荧光黄绿的五边形 SCHOOL 牌就慢下来，看到 END SCHOOL ZONE 再恢复。' } : ({ title: `超速：限速 ${e.limit}，你开到 ${Math.round(e.mph)} mph`, body: '新泽西居民区和商业区默认限速 25 mph，有标志时以标志为准。市区里行人和路边车门多，宁慢勿快。' }),
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
  hit_car: (e) => ({
    rear: { title: '追尾了前车', body: '和前车保持至少 3 秒车距；前车刹车灯一亮就松油门。' },
    head: { title: '和对向的车撞上了', body: '开到了对向车道上。转弯别切弯，过窄路时靠右。' },
    junc: { title: '在路口里撞车了', body: '进路口前看左、看右、看对向：绿灯左转要让对向直行的车，STOP 牌要让没有 STOP 的方向。' },
    side: { title: '和旁边的车蹭上了', body: '变道前打灯，看后视镜，再回头看一眼盲区，旁边有车就等它过去。' },
  }[e?.why] || { title: '撞到别的车', body: '和前车保持至少 3 秒车距；进路口前确认横向和对向的车离得够远。' }),
  rear_ended: () => ({ title: '被后面的车追尾了（不怪你）', body: '后车跟太近没刹住，不扣分。真遇到：车能开就打双闪挪到路边，人别站在车道上，报警、拍照、交换保险信息。' }),
  rail_run: () => ({ title: '道口红灯闪着还开过铁轨', body: '新泽西：道口红灯闪、栏杆放下、或者火车来了，都要停在离最近的铁轨 15 到 50 英尺的地方，等灯灭、栏杆抬起再走。火车刹不住，抢不得。' }),
  rail_stop: () => ({ title: '停在了铁轨上', body: '过道口前先看另一边有没有足够的空位放下整辆车，没有就在停止线前等。卡在铁轨上又来了火车：马上下车，往火车开来的方向斜着跑开。' }),
  hit_train: () => ({ title: '被火车撞了', body: '道口红灯闪、栏杆放下时绝对不能进去。火车从看见你到停下要一公里以上。' }),
  good_rail: () => ({ title: '在道口前等火车过去，正确', body: '' }),
  no_move_over: () => ({ title: '紧挨着闪灯的警车还按原速开过去', body: '新泽西 Move Over 法：路边停着闪灯的警车、救护车、拖车、养路车，能变道就换到不挨着它的那条道；换不了就减速到限速以下、准备停车。游戏里：紧挨着它那条道要比限速慢 10 mph 以上。罚款 100 到 500 美元。' }),
  good_move_over: () => ({ title: '隔开一条道经过警车，正确', body: '' }),
  slow_move_over: () => ({ title: '紧挨着警车时减速经过，正确', body: '' }),
  crash: () => ({ title: '碰到了路边停着的车', body: '窄路上和停着的车至少留出一个车门的宽度（约 1 米）。眼睛看远处的路中间，不要盯着旁边的车。' }),
  off_road: () => ({ title: '开上了人行道', body: '转弯时车速要降到 10 mph 左右，方向打得晚了就会冲出去。已帮你把车摆回车道。' }),
  map_edge: () => ({ title: '到地图边界了', body: '已帮你掉头。' }),
  good_stop: () => ({ title: 'STOP 停得很标准', body: '' }),
  good_ror: () => ({ title: '红灯右转：先停稳再转，正确', body: '' }),
  pass_bus: () => ({ title: '开过了停着闪红灯的校车', body: '新泽西：校车停下、闪红灯（或者伸出 STOP 牌）时，同一条路上两个方向的车都要停，离它至少 25 英尺，等红灯灭了再走。只有中间有隔离带的对向车道可以不停。这是很重的违规（罚款、扣 5 分），孩子可能从车前跑出来。' }),
  good_bus: () => ({ title: '为校车停车，正确', body: '' }),
  no_yield_ems: () => ({ title: '没给鸣笛的救护车 / 警车让路', body: '听到警笛、看到后面闪灯：打右灯，靠到路右边停下，等它过去。在路口里就先开出路口再靠边，不要在路口中间急刹。' }),
  good_ems: () => ({ title: '靠边让鸣笛的车先过，正确', body: '' }),
  good_lor: () => ({ title: '单行道红灯左转：先停稳再转，正确', body: '新泽西允许从单行道左转进另一条单行道，和红灯右转一样要先停稳、让行。' }),
  tailgate: (e) => ({ title: `跟车太近（只有 ${e.gap.toFixed(1)} 秒）`, body: '新泽西驾驶手册：和前车至少保持 3 秒。前车经过一棵树或一根电线杆时开始数，数到 3 你才到那里才对。下雨、天黑再多留。' }),
  block_box: () => ({ title: '堵在路口里了', body: '前面的车堵着时不要开进路口，停在停止线前等，等对面有地方了再过。卡在路口中间会挡住横向的车（“Don\'t block the box”）。等对向空当左转时停在路口里是可以的。' }),
  keep_right: () => ({ title: '一直开在最左边的车道', body: '高速上最左边的车道是超车道：超完车要回到右边。新泽西法律规定没在超车时不能一直占着左道。' }),
  good_turn: (e) => ({ title: (e.turn === 'left' ? '左转' : '右转') + '完成：打灯、车道都对', body: '' }),
};
export const EVENT_SHORT = {
  red_light: '闯红灯', turn_ban: '违反禁止转弯', rail_run: '道口闪红灯时过铁轨', rail_stop: '停在铁轨上', hit_train: '被火车撞', no_move_over: '没给路边警车让道', good_rail: '在道口前等火车', good_move_over: 'Move Over 让道', slow_move_over: 'Move Over 减速', rear_ended: '被追尾', uturn_ok: '掉头', uturn_curve: '弯道附近掉头', uturn_block: '掉头挡了来车', uturn_highway: '高速上掉头', back_highway: '高速上倒车', too_slow: '高速上太慢', pass_bus: '超过停着的校车', no_yield_ems: '没让救护车 / 警车', good_bus: '为校车停车', good_ems: '让鸣笛的车', tailgate: '跟车太近', block_box: '堵路口', keep_right: '占用超车道', good_lor: '单行道红灯左转正确', stop_sign: 'STOP 没停', rolling_stop: 'STOP 没停稳', over_line: '越过停止线', wrong_way: '单行道逆行', wrong_side: '压到对向车道', speeding: '超速',
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
  bus: { icon: 'stop', text: '校车停下闪红灯：停车，离它 25 英尺（约 8 米）以上', sub: '后面来的、对面来的都要停（中间有隔离带的对向除外）。红灯灭了、STOP 牌收回去再走' },
  ems: { icon: 'info', text: '后面有车鸣笛：靠右、减速、停下，让它先过', sub: '在路口里就先开出路口再靠边。它过去以后看看后面还有没有第二辆，再走' },
  rail: { icon: 'stop', text: '铁路道口红灯在闪：停在停止线后，等火车过去', sub: '停在离铁轨 15 到 50 英尺的地方。灯灭了、栏杆抬起来再走，别绕栏杆' },
  railx: { icon: 'info', text: '前面是铁路道口：松油门，左右看、听听有没有火车', sub: '另一边要有地方放下整辆车再开过去，别停在铁轨上' },
  railOn: { icon: 'stop', text: '你在铁轨上，火车要来了：往前开出去！', sub: '栏杆落在车上也别停，直接往前开，栏杆会被撞开' },
  moveover: { icon: 'info', text: '前面右道停着闪灯的警车：打灯并到左边，离它越远越好', sub: '紧挨着它的那条道上要减速（比限速慢 10 mph 以上）、准备停车' },
  pullout: { icon: 'info', text: '前面路边的车打着灯要开出来：松油门，准备让它', sub: '它应该让你，但别赌它看见了你。留出空间，必要时轻按喇叭（H）' },
  close: { icon: 'info', text: '跟前车太近了：松点油门，留出 3 秒', sub: '前车经过一个路标时开始数“一千零一、一千零二、一千零三”，数完你才到那里' },
  school: { icon: 'info', text: '学校区：限速 25 mph', sub: '从荧光黄绿的五边形 SCHOOL 牌开始。看看路边有没有孩子，随时准备停（游戏里一直当作有孩子）' },
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
      if (h.ntor) return { icon: 'R', text: near ? '红灯：停在停止线前。这个路口红灯不能右转' : '前方红灯：松油门，准备停车', sub: '灯旁边挂着 NO TURN ON RED（红灯禁止转弯）：右转也要等绿灯' };
      return { icon: 'R', text: near ? '红灯：车头停在白色停止线前' : '前方红灯：松油门，准备停车', sub: '没有 NO TURN ON RED 牌子，可以红灯右转：先停稳，让左边来的车和斑马线上的人，再转。' + (h.lor ? '这里是单行道、左边也是单行道：停稳后也可以左转' : '左转和直行等绿灯') };
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
  { id: 'notor', en: 'NO TURN ON RED', zh: '红灯禁止转弯', tip: '新泽西默认允许红灯右转（先停稳、让行），挂了这块牌子的路口不行，要等绿灯。牌子一般挂在红绿灯旁边。游戏里只标了查得到出处的路口（Heights 一带、Monticello Ave 等）。' },
  { id: 'noleft', en: 'NO LEFT TURN', zh: '禁止左转', tip: '红圈加斜杠 = 禁止。新泽西很多大路不让直接左转，要走右边的 jughandle 匝道绕过去。' },
  { id: 'noright', en: 'NO RIGHT TURN', zh: '禁止右转', tip: '这个路口不能右转。' },
  { id: 'nostraight', en: 'NO STRAIGHT THROUGH', zh: '禁止直行', tip: '这个路口不能直着穿过去，只能左转或右转。' },
  { id: 'nouturn', en: 'NO U-TURN', zh: '禁止掉头', tip: '这里不能掉头。没挂这块牌子，弯道和坡顶附近、高速和匝道上也不能掉头；双黄线本身不禁止掉头。' },
  { id: 'keepright', en: 'KEEP RIGHT', zh: '靠右行驶', tip: '前面有隔离岛或障碍，从它右边过。' },
  { id: 'leftonly', en: 'LEFT TURN ONLY', zh: '只准左转', tip: '挂在车道上方：这条车道只能左转；挂在路边：从这条路过来只能左转。' },
  { id: 'rightonly', en: 'RIGHT TURN ONLY', zh: '只准右转', tip: '这条路到路口只能右转，不能直行、左转。' },
  { id: 'straightonly', en: 'STRAIGHT ONLY', zh: '只准直行', tip: '这个路口不能转弯，只能直着过去。' },
  { id: 'stophere', en: 'STOP HERE ON RED', zh: '红灯在此停车', tip: '停止线位置比平常靠后，红灯时停在牌子指的线前。' },
  { id: 'nopark', en: 'NO PARKING', zh: '禁止停车', tip: '可以临时上下客，但人不能离开车。另外消防栓前后 10 英尺、人行横道前 25 英尺、STOP 前 50 英尺内都不能停。' },
  { cat: '警告（黄色菱形，提醒前方情况）' },
  { id: 'signalahead', en: 'SIGNAL AHEAD', zh: '前方有红绿灯', tip: '提前松油门，准备停车。' },
  { id: 'stopahead', en: 'STOP AHEAD', zh: '前方有 STOP', tip: '被弯道或坡挡住看不见 STOP 时会先放这块牌子。' },
  { id: 'pedxing', en: 'PEDESTRIAN CROSSING', zh: '人行横道', tip: '新泽西法律：行人在人行横道里，车必须停下并保持停住，不只是减速。' },
  { id: 'school', en: 'SCHOOL ZONE', zh: '学校区域', tip: '五边形荧光黄绿色。有孩子时限速 25 mph。校车闪红灯伸出 STOP 牌时，双向的车都要在 25 英尺外停住。游戏里按 OSM 上的真实学校放。' },
  { id: 'school25', en: 'SPEED LIMIT 25 WHEN CHILDREN ARE PRESENT', zh: '有孩子时限速 25', tip: '挂在 SCHOOL 牌下面。上下学、课间、看得到孩子时 25 mph。游戏里没有钟点，一直按 25 算。' },
  { id: 'endschool', en: 'END SCHOOL ZONE', zh: '学校区结束', tip: '恢复原来的限速。' },
  { id: 'merge', en: 'MERGE', zh: '车道汇入', tip: '旁边有车道并进来。主路的车有路权，汇入的车调整车速找空当。' },
  { id: 'laneends', en: 'LANE ENDS', zh: '车道减少', tip: '你这条或旁边那条车道要没了，提前打灯并线。' },
  { id: 'twoway', en: 'TWO-WAY TRAFFIC', zh: '双向交通', tip: '从单行道出来，前面变成双向路，注意靠右。' },
  { id: 'deadend', en: 'DEAD END', zh: '断头路', tip: '前面没有出口，只能掉头回来。' },
  { id: 'xbuck', en: 'RAILROAD CROSSING (crossbuck)', zh: '铁路道口（就在铁轨旁边）', tip: '白色叉形牌下面常有两盏红灯：灯一闪就停。没有灯和栏杆的道口要自己左右看。' },
  { id: 'rr', en: 'RAILROAD CROSSING', zh: '铁路道口（前方）', tip: '减速、看、听。栏杆落下或红灯闪时在 15 英尺外停住。' },
  { cat: '路面箭头' },
  { id: 'pv_left', en: 'LEFT ONLY', zh: '只能左转', tip: '车道地面画着这个箭头：进了这条道就得左转。', dark: true },
  { id: 'pv_through_left', en: 'THROUGH / LEFT', zh: '直行或左转', tip: '这条道可以直行，也可以左转。', dark: true },
  { id: 'pv_through_right', en: 'THROUGH / RIGHT', zh: '直行或右转', tip: '这条道可以直行，也可以右转。', dark: true },
];

export const SHIFT_MSG = { need_brake: '先踩住刹车（S），才能从 P 挡换出来', need_stop: '车停稳了才能换这个挡' };

/** 新泽西交规要点（照 NJ Driver Manual 写）。game：游戏里会判；false 的是现实里要知道、游戏里还没做的 */
export const RULES_SHEET = [
  { game: true, t: 'STOP 一定要完全停住', d: '车速归零，停在白线前；没有白线停在斑马线前。全向停车（ALL WAY）先到先走，同时到让右边的车。' },
  { game: true, t: '红灯能不能转', d: '可以右转：先停稳、让车让人。单行道左转进单行道也可以。挂了 NO TURN ON RED 就不行。' },
  { game: true, t: '黄灯', d: '能安全停下就停，不要加速抢灯。' },
  { game: true, t: '斑马线上有人必须停', d: '不只是减速，要停住，等人走过你这半边路。' },
  { game: true, t: '左转让对向直行', d: '绿灯（没有左转箭头）时，对向直行和右转的车先走。可以先开进路口等。' },
  { game: true, t: '转弯、变道提前打灯', d: '转弯至少提前 100 英尺（约 30 米）。变道：看后视镜 → 打灯 → 回头看盲区 → 再变。' },
  { game: true, t: '禁止转弯的牌子', d: '红圈加斜杠（禁止左转 / 右转 / 掉头），白底黑箭头加 ONLY（只准那个方向）。' },
  { game: true, t: '跟车至少 3 秒', d: '前车经过路标时开始数，数到 3 你才到那里。' },
  { game: true, t: '别堵路口', d: '前面堵着就停在停止线前，不要开进路口卡在中间。' },
  { game: true, t: '限速', d: '居民区、商业区没牌子默认 25 mph。学校区（五边形 SCHOOL 牌，游戏里放在真实学校旁边）25 mph。有牌子按牌子。' },
  { game: true, t: '掉头', d: '新泽西没有“双黄线不能掉头”。不能掉头的是：挂 NO U TURN 的地方、弯道和坡顶附近（前后看不清 500 英尺）、高速和匝道、会挡到来车的时候。路窄就三点掉头，或者绕一个街区。（游戏里地是平的，坡顶不判）' },
  { game: true, t: '高速错过出口', d: '别倒车，也别在车道里停下：开到下一个出口再绕回来。前面没车时别比车流慢太多（不能妨碍正常车流）。' },
  { game: true, t: '高速靠右', d: '最左边的车道只用来超车，超完回右边。上高速在匝道上加速到和车流差不多再并入。' },
  { game: true, t: '校车停下、闪红灯、伸出 STOP 牌', d: '两个方向的车都要停，离校车至少 25 英尺，等红灯灭了再走。只有中间有隔离带的对向车道可以减速慢慢过。' },
  { game: true, t: '救护车、警车、消防车鸣笛闪灯', d: '靠右边停下，等它过去。在路口里就先开出路口再靠边。' },
  { game: true, t: 'Move Over（让出一条道）', d: '路边停着闪灯的警车、拖车、施工车：能换道就换到离它远的那条，换不了就明显减速。' },
  { game: true, t: '铁路道口', d: '红灯闪、栏杆放下或者火车来了：停在离铁轨 15 到 50 英尺的地方。栏杆抬起来、灯灭了再走。' },
  { game: false, t: '路上的线', d: '双黄线：不准越线超车，但可以跨过去左转进路边、掉头。黄虚线：对向没车可以借道超车。白实线：别跨线变道。白虚线：同方向的车道，可以变道。游戏里只判开在对向车道上。' },
  { game: false, t: '左转等空当时轮子摆正', d: '在路口里等对向空当时方向盘回正，万一被追尾，车会往前走，不会被推进对向车流。' },
  { game: false, t: 'Jughandle（新泽西特色）', d: '很多大路不能直接左转、掉头，要先从右边的匝道出去再横穿过去。看到 ALL TURNS FROM RIGHT LANE 就提前靠右。游戏里只在 OSM 标了禁止左转的路口判。' },
  { game: false, t: '闪烁的信号灯', d: '黄灯闪：减速、小心通过。红灯闪：当 STOP 处理，要完全停住。' },
  { game: false, t: '开雨刷就要开大灯', d: '新泽西法律：下雨开雨刷、起雾、看不到 500 英尺远、天黑，都要开大灯。' },
  { game: false, t: '手机和安全带', d: '开车不能手拿手机（罚款几百美元，还扣分）。车里所有人都要系安全带。' },
  { game: false, t: '停车的距离', d: '离消防栓 10 英尺、路口人行横道 25 英尺、STOP 牌 50 英尺内都不能停车。' },
];
