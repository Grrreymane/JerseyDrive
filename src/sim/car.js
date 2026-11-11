// 车辆：自行车模型，参考点是后轴中点。朝向 h：0 = 正东，增大 = 向右转（z 轴向南）。
import { CAR } from './map.js';

export const MPH = 2.23694;
const MAX_STEER = 0.61;    // 前轮最大转角（约 35°）
export const GEARS = ['P', 'R', 'N', 'D'];

export function makeCar() {
  return { x: 0, z: 0, h: 0, v: 0, steer: 0, gear: 'P', signal: 0, throttle: 0, brake: 0, odo: 0, sigTurned: false };
}

/** inp: { throttle 0..1, brake 0..1, steer -1..1, analog: 是否模拟量输入 } */
export function stepCar(car, inp, dt) {
  car.throttle = inp.throttle; car.brake = inp.brake;
  // 方向盘：键盘输入时，车速越快可打的角度越小，松手自动回正
  if (inp.analog) car.steer = inp.steer;
  else {
    const lim = 1 / (1 + (Math.abs(car.v) / 7.5) ** 2);
    const target = inp.steer * lim, rate = (inp.steer !== 0 ? 1.25 : 2.0) * dt;
    car.steer += Math.max(-rate, Math.min(rate, target - car.steer));
  }
  const dir = car.gear === 'D' ? 1 : car.gear === 'R' ? -1 : 0;
  let a = 0;
  if (dir) {
    const vs = car.v * dir;
    const maxA = dir > 0 ? 3.0 * Math.max(0, 1 - vs / 42) : 2.0 * Math.max(0, 1 - vs / 8);
    let drive = inp.throttle * maxA;
    if (inp.throttle < 0.02 && vs < 2.0) drive = Math.max(drive, 0.9 * (1 - vs / 2.0));   // 自动挡怠速蠕行（约 4~5 mph）
    a = drive * dir;
  }
  if (car.gear === 'P') { car.v = 0; }
  else {
    const sp = Math.abs(car.v);
    const engineBrake = (dir && inp.throttle < 0.02 && sp > 3) ? 0.35 : 0;
    const dec = inp.brake * 8.5 + 0.12 + 0.02 * sp + 0.0006 * sp * sp + engineBrake;
    let v1 = car.v + a * dt; const dv = dec * dt;
    if (Math.abs(v1) <= dv) v1 = 0; else v1 -= Math.sign(v1) * dv;
    car.v = v1;
  }
  car.h += car.v / CAR.wheelbase * Math.tan(car.steer * MAX_STEER) * dt;
  car.x += car.v * Math.cos(car.h) * dt; car.z += car.v * Math.sin(car.h) * dt;
  car.odo += Math.abs(car.v) * dt;
  // 转向灯：车头确实朝打灯方向转过了一个弯（45° 以上）、方向盘再回正，才自动熄灭。
  // 只看方向盘的话，进弯前随手修一下方向灯就灭了，接着会被判“转弯没打灯”
  if (car.signal === 1 || car.signal === -1) {
    if (car.sigH === undefined || car.sigH === null) car.sigH = car.h;
    if ((car.h - car.sigH) * car.signal > 0.78) car.sigTurned = true;
    if (car.sigTurned && Math.abs(car.steer) < 0.06) { car.signal = 0; car.sigTurned = false; car.sigH = null; }
  } else { car.sigTurned = false; car.sigH = null; }
}

export function setSignal(car, s) { car.signal = car.signal === s ? 0 : s; car.sigTurned = false; car.sigH = null; }

/** 换挡。返回 null 表示成功，否则返回原因代号 */
export function shift(car, g) {
  if (g === car.gear) return null;
  if (car.gear === 'P' && car.brake < 0.1) return 'need_brake';
  if (g === 'P' && Math.abs(car.v) > 0.3) return 'need_stop';
  if ((g === 'R' && car.v > 1) || (g === 'D' && car.v < -1)) return 'need_stop';
  car.gear = g; return null;
}

export const carCenter = (car, out = {}) => { out.x = car.x + Math.cos(car.h) * CAR.center; out.z = car.z + Math.sin(car.h) * CAR.center; return out; };
export const carFront = (car, out = {}) => { out.x = car.x + Math.cos(car.h) * CAR.front; out.z = car.z + Math.sin(car.h) * CAR.front; return out; };
