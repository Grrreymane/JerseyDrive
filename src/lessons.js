// 课程：十节课，从起步到综合路考，把路考和日常最要紧的内容各练一遍。
// 每节课 = 一个出发点 + 几个要完成的目标（做对若干次）+ 这节课里不能犯的错。车随便往哪开，目标凑够就过关。
// start：出发点类型（main.js 的 findStart 认）。goals 的 k：dist 开够多少米；ev 某个“做对了”的事件出现 n 次；fast 在限速 35 以上的路上按限速开够多少米；score 结束时本课得分不低于 n。
export const LESSONS = [
  {
    title: '起步、直行、停稳', start: 'allway',
    brief: '踩刹车挂 D 挡，松刹车让车自己走，再轻踩油门。前面有 STOP，提前松油门，在白线前完全停住。',
    goals: [{ k: 'dist', n: 150, text: '往前开 150 米' }, { k: 'ev', ev: 'good_stop', n: 1, text: '在 STOP 白线前完全停稳' }],
  },
  {
    title: 'STOP 和全向停车', start: 'allway',
    brief: 'STOP 前必须速度归零，不是减速。停稳后左、右、再左看一遍；全向停车按先到先走，同时到让右手边。',
    goals: [{ k: 'ev', ev: 'good_stop', n: 3, text: '在 3 个 STOP 前完全停稳' }], forbid: ['stop_sign', 'no_yield'],
  },
  {
    title: '红绿灯', start: 'signal',
    brief: '红灯停在白线前；黄灯能安全停下就停；绿灯也要扫一眼路口再走。',
    goals: [{ k: 'ev', ev: 'good_signal', n: 3, text: '按灯通过 3 个红绿灯路口' }], forbid: ['red_light'],
  },
  {
    title: '右转', start: 'allway',
    brief: '提前 30 米（约 100 英尺）打右灯，靠右，转进最右边那条车道。转之前看右边斑马线上有没有人。',
    goals: [{ k: 'ev', ev: 'good_turn', turn: 'right', n: 2, text: '规范完成 2 次右转' }],
  },
  {
    title: '左转', start: 'allway',
    brief: '提前打左灯，从最左车道转，转进最左车道。对向直行的车和斑马线上的人先走。单行道别转反了，看路口预告。',
    goals: [{ k: 'ev', ev: 'good_turn', turn: 'left', n: 2, text: '规范完成 2 次左转' }], forbid: ['wrong_way'],
  },
  {
    title: '红灯右转', start: 'signal',
    brief: '新泽西允许红灯右转：先在白线前完全停住，确认横向没车、斑马线上没人，再转。红灯下左转和直行都不行。',
    goals: [{ k: 'ev', ev: 'good_ror', n: 1, text: '红灯停稳后右转 1 次' }], forbid: ['red_light'],
  },
  {
    title: '礼让行人', start: 'default',
    brief: '人在斑马线上，车就要停下并保持停住，等人走过你这半边路。接近路口先把脚移到刹车上。',
    goals: [{ k: 'ev', ev: 'good_yield', n: 2, text: '为过马路的行人停车 2 次' }], forbid: ['no_yield_ped', 'hit_ped'],
  },
  {
    title: '路口让车', start: 'allway',
    brief: '你有 STOP、对方没有：等对方过去。全向停车：谁先停稳谁先走。路口里已经有车：等它出去。',
    goals: [{ k: 'ev', ev: 'good_stop', n: 3, text: '在 3 个 STOP 前停稳并让该让的车' }, { k: 'ev', ev: 'good_turn', turn: 'left', n: 1, text: '完成 1 次左转' }], forbid: ['no_yield', 'hit_car'],
  },
  {
    title: '主干道和限速', start: 'fast',
    brief: '限速牌写多少就开多少：35 的路开 30–35，不要比车流慢太多，也不要超。和前车留 3 秒车距。',
    goals: [{ k: 'fast', n: 400, text: '在限速 35 以上的路上按限速开 400 米' }], forbid: ['speeding', 'hit_car'],
  },
  {
    title: '综合路考', start: 'default',
    brief: '自己选路线开 1.2 公里：STOP、红绿灯、左转、右转都要有，全程得分不低于 80。',
    goals: [{ k: 'dist', n: 1200, text: '行驶 1.2 公里' }, { k: 'ev', ev: 'good_stop', n: 2, text: 'STOP 停稳 2 次' }, { k: 'ev', ev: 'good_signal', n: 2, text: '通过 2 个红绿灯' }, { k: 'ev', ev: 'good_turn', turn: 'left', n: 1, text: '左转 1 次' }, { k: 'ev', ev: 'good_turn', turn: 'right', n: 1, text: '右转 1 次' }, { k: 'score', n: 80, text: '得分不低于 80' }],
    forbid: ['hit_ped'],
  },
  {
    title: '变道', start: 'multi',
    brief: '先打灯（Q / E），看后视镜，再回头看一眼盲区（Z / 按住 X），确认没车再平顺地并过去。',
    goals: [{ k: 'ev', ev: 'good_lane', n: 3, text: '打灯变道 3 次' }], forbid: ['lane_no_signal', 'hit_car'],
  },
  {
    title: '上高速', start: 'highway', fastMin: 45,
    brief: '匝道上就把速度加起来，打左灯，从后视镜找空当并进去。高速上保持车速，别比车流慢太多；没有 STOP 也没有红绿灯。',
    goals: [{ k: 'fast', n: 600, text: '在限速 45 以上的路上按限速开 600 米' }], forbid: ['speeding', 'hit_car'],
  },
  {
    title: '直线倒车', start: 'default',
    brief: '路考项目。踩刹车挂 R（按 2），回头看（Z + X 一起按）或看后视镜，松刹车让车慢慢退，方向盘只做很小的修正。',
    goals: [{ k: 'x', id: 'rev', n: 15, text: '直线倒车 15 米，不碰任何东西' }], forbid: ['crash', 'hit_car', 'hit_ped', 'off_road'],
  },
  {
    title: '三点掉头（K 字掉头）', start: 'twoway',
    brief: '路考项目。靠右停 → 打左灯，方向盘向左打死往前到对面路边 → 挂 R，向右打死倒回来 → 挂 D 开走。每一步动之前都看两边有没有车。',
    goals: [{ k: 'x', id: 'kturn', n: 1, text: '在这条街上掉头，开到对向车道' }], forbid: ['off_road', 'hit_car', 'hit_ped'],
  },
  {
    title: '侧方停车', start: 'park',
    brief: '路考项目。开到车位前面那辆车旁边，并排、车尾对齐 → 挂 R，向右打死倒到车身 45° → 回正再倒 → 向左打死摆正。停进绿框后挂 P。',
    goals: [{ k: 'x', id: 'park', n: 1, text: '停进绿框，摆正，挂 P' }], forbid: ['hit_ped'],
  },
];

/** 这节课每个目标做到哪了。L = { def, log0, odo0, fast }；返回 { rows: [{ text, cur, n, done }], done, failed: 事件类型或 null, penalty } */
export function lessonState(L, R, car) {
  const log = R.log.slice(L.log0), penalty = 100 - R.score;
  const rows = L.def.goals.map(g => {
    let cur = 0;
    if (g.k === 'dist') cur = Math.floor(car.odo - L.odo0);
    else if (g.k === 'fast') cur = Math.floor(L.fast);
    else if (g.k === 'score') cur = 100 - penalty;
    else if (g.k === 'x') cur = Math.floor(L.x[g.id] || 0);
    else cur = log.filter(e => e.type === g.ev && (!g.turn || e.turn === g.turn)).length;
    return { text: g.text, cur: Math.min(cur, g.k === 'score' ? 100 : g.n), n: g.n, done: cur >= g.n, k: g.k };
  });
  const bad = (L.def.forbid || []).find(t => log.some(e => e.type === t)) || null;
  const others = rows.filter(r => r.k !== 'score').every(r => r.done), score = rows.find(r => r.k === 'score');
  return { rows, done: others && (!score || score.done), failed: bad || (others && score && !score.done ? 'score' : null), penalty };
}
