/**
 * 线稿（SVG）数据
 * ------------------------------------------------------------------
 * 约定：
 *   - 每张线稿给出一个 200x200 的 viewBox
 *   - 用 `shapes` 生成：
 *       c  = 圆形 / 椭圆       { t:'c', cx, cy, rx, ry? }
 *       r  = 圆角矩形           { t:'r', x, y, w, h, rad? }
 *       p  = 路径（区域）       { t:'p', d }
 *       l  = 只描线不填色       { t:'l', d }        ← 细节线条
 *       f  = 只填色不描边       { t:'f', d }        ← 比如腮红
 *   - 所有 'c' / 'r' / 'p' 自动成为"可填色区域"，
 *     同时画出黑色描边，并且是小朋友可以点的地方。
 * ------------------------------------------------------------------
 * 用工厂函数写，避免手写大量重复的 SVG 字符串。
 */

/** 拼一个形状的 d 属性 */
function ellipsePath(cx, cy, rx, ry) {
  ry = ry == null ? rx : ry;
  return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
}

function rectPath(x, y, w, h, rad = 0) {
  rad = Math.min(rad, w / 2, h / 2);
  if (!rad) {
    return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  }
  return (
    `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} ` +
    `V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} ` +
    `H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} ` +
    `V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`
  );
}

/** 生成形状 */
const C = (cx, cy, rx, ry) => ({ t: "c", cx, cy, rx, ry });
const R = (x, y, w, h, rad) => ({ t: "r", x, y, w, h, rad });
const P = (d) => ({ t: "p", d });
const L = (d) => ({ t: "l", d });
const F = (d) => ({ t: "f", d });

/** 把形状转成 d */
function shapeToD(s) {
  if (s.d) return s.d;
  if (s.t === "c") return ellipsePath(s.cx, s.cy, s.rx, s.ry);
  if (s.t === "r") return rectPath(s.x, s.y, s.w, s.h, s.rad);
  return "";
}

/** 眼睛：黑色眼珠 + 小高光 */
const eye = (cx, cy, r = 5) =>
  L(
    `M${cx},${cy} a${r},${r} 0 1,0 0.1,0 Z ` +
      `M${cx + r * 0.15},${cy - r * 0.42} a${r * 0.3},${r * 0.3} 0 1,0 0.1,0 Z`
  );

const smile = (cx, cy, w = 16) =>
  L(`M${cx - w / 2},${cy} q${w / 2},${w * 0.42} ${w},0`);

const cheek = (cx, cy, r = 6) => F(ellipsePath(cx, cy, r, r * 0.7));

/* ------------------------------------------------------------------
   收尾：把超出画布的图形统一裁剪到 190x190 以内
   （保证任何线稿都不会顶到边框、也不会被切掉）
   ------------------------------------------------------------------ */

/**
 * 采样一段椭圆弧，把采样点加入包围盒
 * （SVG 规范 F.6.5：端点参数化 → 中心参数化）
 */
function addArcToBox(box, x0, y0, rx, ry, rotDeg, laf, sf, x1, y1) {
  const add = box.add;
  let rx2 = Math.abs(rx);
  let ry2 = Math.abs(ry);
  if (!rx2 || !ry2) {
    add(x1, y1);
    return;
  }
  const phi = (rotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx2 = (x0 - x1) / 2;
  const dy2 = (y0 - y1) / 2;
  const x1p = cosP * dx2 + sinP * dy2;
  const y1p = -sinP * dx2 + cosP * dy2;

  // 半径太小按规范放大，否则弧线会画不出来
  const lambda = (x1p * x1p) / (rx2 * rx2) + (y1p * y1p) / (ry2 * ry2);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx2 *= s;
    ry2 *= s;
  }

  const sign = laf === sf ? -1 : 1;
  const num = rx2 * rx2 * ry2 * ry2 - rx2 * rx2 * y1p * y1p - ry2 * ry2 * x1p * x1p;
  const den = rx2 * rx2 * y1p * y1p + ry2 * ry2 * x1p * x1p;
  const co = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx2 * y1p) / ry2;
  const cyp = (-co * ry2 * x1p) / rx2;
  const cx = cosP * cxp - sinP * cyp + (x0 + x1) / 2;
  const cy = sinP * cxp + cosP * cyp + (y0 + y1) / 2;

  const ang = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };

  const ux = (x1p - cxp) / rx2;
  const uy = (y1p - cyp) / ry2;
  const vx = (-x1p - cxp) / rx2;
  const vy = (-y1p - cyp) / ry2;
  const theta1 = ang(1, 0, ux, uy);
  let dTheta = ang(ux, uy, vx, vy);
  if (!sf && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sf && dTheta < 0) dTheta += 2 * Math.PI;

  const steps = Math.max(4, Math.ceil(Math.abs(dTheta) / (Math.PI / 12)));
  for (let i = 0; i <= steps; i++) {
    const t = theta1 + (dTheta * i) / steps;
    const ex = rx2 * Math.cos(t);
    const ey = ry2 * Math.sin(t);
    add(cosP * ex - sinP * ey + cx, sinP * ex + cosP * ey + cy);
  }
}

function bboxOfD(d) {
  if (typeof d !== "string") return null;
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!tokens) return null;

  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  };
  box.add = add;

  let cmd = null;
  let cur = [0, 0];
  let start = [0, 0];
  let i = 0;
  const isCmd = (t) => /^[a-zA-Z]$/.test(t);

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      cmd = tokens[i];
      i++;
      if (cmd === "Z" || cmd === "z") {
        cur = start;
        continue;
      }
    }
    const n = (k) => Number(tokens[i + k]);

    if (cmd === "M" || cmd === "L" || cmd === "m" || cmd === "l") {
      const rel = cmd === cmd.toLowerCase();
      const x = rel ? cur[0] + n(0) : n(0);
      const y = rel ? cur[1] + n(1) : n(1);
      add(x, y);
      cur = [x, y];
      if (cmd === "M" || cmd === "m") start = [x, y];
      // 后续隐式参数按 L 处理
      cmd = rel ? "l" : "L";
      i += 2;
    } else if (cmd === "H" || cmd === "h") {
      const rel = cmd === "h";
      const x = rel ? cur[0] + n(0) : n(0);
      add(x, cur[1]);
      cur = [x, cur[1]];
      i += 1;
    } else if (cmd === "V" || cmd === "v") {
      const rel = cmd === "v";
      const y = rel ? cur[1] + n(0) : n(0);
      add(cur[0], y);
      cur = [cur[0], y];
      i += 1;
    } else if (cmd === "A" || cmd === "a") {
      // 椭圆弧：必须按真实弧线采样，否则圆/椭圆的外框会被严重低估
      const rel = cmd === "a";
      const rx = n(0);
      const ry = n(1);
      const rot = n(2);
      const laf = n(3) !== 0;
      const sf = n(4) !== 0;
      const x1 = rel ? cur[0] + n(5) : n(5);
      const y1 = rel ? cur[1] + n(6) : n(6);
      addArcToBox(box, cur[0], cur[1], rx, ry, rot, laf, sf, x1, y1);
      cur = [x1, y1];
      i += 7;
    } else if (["C", "c", "S", "s", "Q", "q", "T", "t"].includes(cmd)) {
      const rel = cmd === cmd.toLowerCase();
      const lower = cmd.toLowerCase();
      let pts = [];
      let step = 0;
      if (lower === "c") {
        pts = [n(0), n(1), n(2), n(3), n(4), n(5)];
        step = 6;
      } else if (lower === "s") {
        pts = [n(0), n(1), n(2), n(3)];
        step = 4;
      } else if (lower === "q") {
        pts = [n(0), n(1), n(2), n(3)];
        step = 4;
      } else {
        // T 命令只有控制点和终点
        pts = [n(0), n(1)];
        step = 2;
      }
      const abs = [];
      for (let k = 0; k < pts.length; k += 2) {
        abs.push([
          rel ? cur[0] + pts[k] : pts[k],
          rel ? cur[1] + pts[k + 1] : pts[k + 1],
        ]);
      }
      // 端点必须算进去，控制点也大致算入（会略微放大外框，对留白是好事）
      abs.forEach(([x, y]) => add(x, y));
      const end = abs[abs.length - 1];
      cur = end;
      i += step;
    } else {
      i++;
    }
  }

  delete box.add;
  if (!Number.isFinite(box.minX)) return null;
  return box;
}

/**
 * 把线稿统一缩放进 200x200 的安全区，并且让每一张图都居中
 * @param art   线稿对象
 * @param pad   四周留白（单位：图形坐标系）
 */
function fitToCanvas(art, pad = 14) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const all = [
    ...art.shapes.map(shapeToD),
    // 腮红是形状对象（{t:'f', d}），要转成路径字符串才能量尺寸
    ...(art.blush || []).map(shapeToD),
  ].filter(Boolean);

  all.forEach((d) => {
    const b = bboxOfD(d);
    if (!b) return;
    box.minX = Math.min(box.minX, b.minX);
    box.minY = Math.min(box.minY, b.minY);
    box.maxX = Math.max(box.maxX, b.maxX);
    box.maxY = Math.max(box.maxY, b.maxY);
  });
  if (!Number.isFinite(box.minX)) {
    art.transform = null;
    return;
  }

  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  // 只缩小不放大，并保证宽高都不超过安全区
  const scale = Math.min(1, (200 - pad * 2) / w, (200 - pad * 2) / h);

  // 总是居中：即使不缩放，也要把它挪到画面正中
  art.transform = { cx, cy, scale };
}

/* ==================================================================
   小动物
   ================================================================== */

const cat = {
  id: "cat-01",
  name: "小花猫",
  category: "animal",
  shapes: [
    // 尾巴（在身体后面）
    P("M146,146 q26,4 24,-24 q-2,-14 -12,-12 q-8,2 -4,12 q4,12 -10,10 Z"),
    // 耳朵
    P("M60,58 L52,20 q-2,-8 7,-3 L90,42 Z"),
    P("M140,58 L148,20 q2,-8 -7,-3 L110,42 Z"),
    // 身体
    P("M100,108 q-44,0 -48,46 q-2,26 14,26 h68 q16,0 14,-26 q-4,-46 -48,-46 Z"),
    // 头
    C(100, 74, 44, 40),
    // 肚子
    P("M100,142 q-24,0 -26,32 h52 q-2,-32 -26,-32 Z"),
    // 细节
    eye(84, 78),
    eye(116, 78),
    // 鼻子和嘴
    L("M100,88 l-5,5 h10 Z"),
    L("M100,93 v4 M100,97 q-6,6 -11,0 M100,97 q6,6 11,0"),
    // 胡须
    L("M70,84 h-24 M70,92 h-22"),
    L("M130,84 h24 M130,92 h22"),
  ],
  blush: [cheek(74, 92), cheek(126, 92)],
};

const dog = {
  id: "dog-01",
  name: "小黄狗",
  category: "animal",
  shapes: [
    // 尾巴
    P("M138,150 q26,6 24,-20 q-1,-12 -10,-10 q-8,2 -4,11 q5,11 -12,9 Z"),
    // 身体
    P("M100,110 q-40,0 -44,42 q-2,26 12,26 h64 q14,0 12,-26 q-4,-42 -44,-42 Z"),
    // 垂耳
    P("M66,52 q-22,2 -24,34 q-1,20 13,18 q12,-2 12,-22 q0,-16 -1,-30 Z"),
    P("M134,52 q22,2 24,34 q1,20 -13,18 q-12,-2 -12,-22 q0,-16 1,-30 Z"),
    // 头
    C(100, 74, 42, 38),
    // 胸口
    P("M100,142 q-22,0 -24,30 h48 q-2,-30 -24,-30 Z"),
    // 鼻子
    P("M100,84 q-10,0 -10,8 q0,7 10,7 q10,0 10,-7 q0,-8 -10,-8 Z"),
    // 嘴
    L("M100,99 v5 M100,104 q-7,6 -13,0 M100,104 q7,6 13,0"),
    // 舌头
    P("M96,108 q8,10 8,0 Z"),
    eye(84, 74),
    eye(116, 74),
    // 项圈
    P("M62,106 q38,18 76,0 l0,10 q-38,18 -76,0 Z"),
    C(100, 126, 7, 7),
  ],
  blush: [cheek(68, 92), cheek(132, 92)],
};

const bunny = {
  id: "rabbit-01",
  name: "小白兔",
  category: "animal",
  shapes: [
    // 耳朵
    P("M78,46 q-14,-40 -2,-40 q14,0 16,40 Z"),
    P("M122,46 q14,-40 2,-40 q-14,0 -16,40 Z"),
    // 身体
    P("M100,104 q-38,0 -42,44 q-2,28 14,28 h56 q16,0 14,-28 q-4,-44 -42,-44 Z"),
    // 头
    C(100, 72, 40, 36),
    P("M100,150 q-22,0 -24,26 h48 q-2,-26 -24,-26 Z"),
    // 耳内
    L("M80,38 q-6,-24 0,-26 q6,-2 8,26"),
    L("M120,38 q6,-24 0,-26 q-6,-2 -8,26"),
    eye(85, 74),
    eye(115, 74),
    L("M100,86 l-7,6 h14 Z"),
    L("M93,96 q7,6 14,0"),
    // 门牙
    L("M95,100 v8 h4 v-8 M101,100 v8 h4 v-8"),
    // 尾巴
    C(150, 168, 11, 11),
  ],
  blush: [cheek(70, 86), cheek(130, 86)],
};

const bear = {
  id: "bear-01",
  name: "小熊",
  category: "animal",
  shapes: [
    P("M100,106 q-40,0 -44,44 q-2,26 12,26 h64 q14,0 12,-26 q-4,-44 -44,-44 Z"),
    C(64, 44, 16, 16),
    C(136, 44, 16, 16),
    C(100, 76, 44, 42),
    P("M100,140 q-22,0 -24,30 h48 q-2,-30 -24,-30 Z"),
    L(ellipsePath(100, 90, 22, 18)),
    L(ellipsePath(100, 84, 8, 6)),
    L("M100,90 v8"),
    L("M100,98 q-8,6 -14,-1"),
    L("M100,98 q8,6 14,-1"),
    eye(82, 76),
    eye(118, 76),
  ],
  blush: [cheek(66, 90), cheek(134, 90)],
};

const pig = {
  id: "pig-01",
  name: "小猪",
  category: "animal",
  shapes: [
    // 耳朵
    P("M62,58 L50,22 q-2,-8 6,-5 L90,42 Z"),
    P("M138,58 L150,22 q2,-8 -6,-5 L110,42 Z"),
    C(100, 78, 46, 42),
    P("M100,112 q-38,0 -42,40 q-2,28 12,28 h60 q14,0 12,-28 q-4,-40 -42,-40 Z"),
    // 猪鼻子
    P("M100,88 q-16,0 -16,-13 q0,-13 16,-13 q16,0 16,13 q0,13 -16,13 Z"),
    L("M94,82 v-8 M106,82 v-8"),
    eye(80, 70),
    eye(120, 70),
    L("M100,146 q-18,0 -20,26 h40 q-2,-26 -20,-26 Z"),
    // 小蹄子
    L("M74,178 v-8 M84,178 v-8 M116,178 v-8 M126,178 v-8"),
    // 尾巴
    P("M148,150 q14,2 10,-12 q-4,-12 -12,-6 q-6,4 0,10"),
  ],
  blush: [cheek(64, 94), cheek(136, 94)],
};

const panda = {
  id: "panda-01",
  name: "熊猫",
  category: "animal",
  shapes: [
    C(62, 42, 17, 17),
    C(138, 42, 17, 17),
    C(100, 76, 46, 42),
    P("M100,110 q-40,0 -44,40 q-2,28 12,28 h64 q14,0 12,-28 q-4,-40 -44,-40 Z"),
    P("M100,142 q-22,0 -24,28 h48 q-2,-28 -24,-28 Z"),
    // 黑眼圈
    P(ellipsePath(80, 74, 15, 17) + ellipsePath(120, 74, 15, 17)),
    L("M80,68 q-2,12 0,12"),
    L("M120,68 q2,12 0,12"),
    L("M100,88 q-8,4 -8,10 q0,5 8,5 q8,0 8,-5 q0,-6 -8,-10 Z"),
    L("M92,106 q8,6 16,0"),
  ],
  blush: [cheek(62, 94), cheek(138, 94)],
};

const horse = {
  id: "horse-01",
  name: "小马",
  category: "animal",
  shapes: [
    // 尾巴
    P("M48,112 q-16,4 -14,44 q8,-6 10,-20 q2,-16 10,-20 Z"),
    // 身体
    P("M44,116 q0,-34 34,-38 h40 q26,4 30,30 q2,20 -10,30 H62 q-18,-2 -18,-22 Z"),
    // 腿
    P("M62,158 h18 v18 q0,8 -9,8 q-9,0 -9,-8 Z"),
    P("M90,158 h16 v18 q0,8 -8,8 q-8,0 -8,-8 Z"),
    P("M118,158 h18 v18 q0,8 -9,8 q-9,0 -9,-8 Z"),
    // 脖子
    P("M146,116 q14,-30 18,-52 q2,-10 12,-10 h6 q8,0 6,10 q-6,26 -12,52 Z"),
    // 头
    P("M168,54 q22,-8 26,8 q4,14 -10,18 q-16,4 -22,-10 Z"),
    // 鬃毛
    P("M150,60 q-6,-16 2,-22 q6,-4 10,2 q4,6 -2,10 q-6,4 -10,10 Z"),
    // 耳朵
    P("M172,50 l-2,-14 l10,10 Z"),
    eye(182, 62, 4),
    L("M192,70 q-6,4 -10,0"),
    // 马鞍
    P("M76,104 q22,-10 44,0 l-4,10 q-18,-6 -36,0 Z"),
  ],
};

const fox = {
  id: "fox-01",
  name: "小狐狸",
  category: "animal",
  shapes: [
    // 身体
    P("M100,104 q-40,0 -44,46 q-2,28 14,28 h60 q16,0 14,-28 q-4,-46 -44,-46 Z"),
    // 耳朵
    P("M56,62 L44,16 q-2,-8 9,-3 L96,44 Z"),
    P("M144,62 L156,16 q2,-8 -9,-3 L104,44 Z"),
    // 头
    C(100, 74, 44, 40),
    // 胸口白毛
    P("M100,138 q-24,0 -26,32 h52 q-2,-32 -26,-32 Z"),
    // 脸颊的白色（狐狸特有）
    P("M62,88 q38,36 76,0 q-16,32 -38,32 q-22,0 -38,-32 Z"),
    // 鼻子
    P("M100,90 q-7,0 -7,6 q0,6 7,6 q7,0 7,-6 q0,-6 -7,-6 Z"),
    L("M100,102 v6 M100,108 q-7,5 -12,0 M100,108 q7,5 12,0"),
    eye(82, 74),
    eye(118, 74),
  ],
  blush: [cheek(66, 84), cheek(134, 84)],
};

/* ==================================================================
   花朵
   ================================================================== */

/** 生成绕中心旋转的花瓣 */
function petalRing(cx, cy, count, dist, rx, ry, offset = 0) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + offset;
    parts.push(
      C(
        +(cx + Math.cos(a) * dist).toFixed(2),
        +(cy + Math.sin(a) * dist).toFixed(2),
        rx,
        ry
      )
    );
  }
  return parts;
}

const sunflower = {
  id: "flower-01",
  name: "向日葵",
  category: "flower",
  shapes: [
    // 花茎
    P("M96,120 q-6,40 4,80 h10 q-10,-42 -4,-80 Z"),
    // 叶子
    P("M96,150 q-40,-14 -44,10 q-2,16 18,12 q16,-4 26,-22 Z"),
    P("M108,164 q40,-12 44,12 q2,16 -18,12 q-16,-4 -26,-24 Z"),
    ...petalRing(100, 74, 10, 36, 15, 11, -Math.PI / 2),
    C(100, 74, 26, 26),
    L(ellipsePath(100, 74, 18, 18)),
    L("M100,58 v6 M100,84 v6 M84,74 h6 M110,74 h6"),
    L("M89,63 l4,4 M111,85 l-4,-4 M111,63 l-4,4 M89,85 l4,-4"),
  ],
};

const tulip = {
  id: "flower-02",
  name: "郁金香",
  category: "flower",
  shapes: [
    P("M98,116 q-4,44 2,84 h4 q-6,-40 -2,-84 Z"),
    P("M98,146 q-38,-16 -42,8 q-2,16 16,12 q16,-4 26,-20 Z"),
    P("M104,172 q38,-14 42,10 q2,16 -16,12 q-16,-4 -26,-22 Z"),
    // 花瓣
    P("M100,122 q-30,0 -32,-42 q0,-20 10,-16 q10,4 10,34 q0,-52 12,-52 q12,0 12,52 q0,-30 10,-34 q10,-4 10,16 q-2,42 -32,42 Z"),
    L("M100,122 V72"),
  ],
};

const daisy = {
  id: "flower-03",
  name: "小雏菊",
  category: "flower",
  shapes: [
    P("M98,120 q-4,40 4,80 h6 q-8,-40 -4,-80 Z"),
    P("M96,152 q-36,-12 -40,10 q-2,14 16,10 q14,-4 24,-20 Z"),
    ...petalRing(100, 72, 8, 38, 18, 13, -Math.PI / 2),
    C(100, 72, 22, 22),
    L("M100,56 v6 M100,82 v6 M84,72 h6 M110,72 h6"),
  ],
};

const rose = {
  id: "flower-04",
  name: "玫瑰花",
  category: "flower",
  shapes: [
    P("M100,120 v80 h8 V120 Z"),
    P("M100,150 q-34,-14 -40,8 q-2,14 14,10 q14,-4 26,-18 Z"),
    P("M106,176 q34,-12 40,10 q2,14 -14,10 q-14,-4 -26,-20 Z"),
    // 花苞
    C(100, 76, 42, 40),
    L("M70,64 q18,-14 34,2 q16,-16 34,-2"),
    L("M68,84 q20,10 32,-6 q12,16 32,6"),
    L("M80,100 q20,-10 20,-24 q0,26 -20,24 Z"),
    L("M100,50 q-10,14 0,28 q10,-14 0,-28 Z"),
  ],
};

const lotus = {
  id: "flower-05",
  name: "荷花",
  category: "flower",
  shapes: [
    // 水波
    P("M24,176 q26,-14 52,0 q26,-14 52,0 q26,-14 52,0 v14 H24 Z"),
    // 花瓣
    P("M100,150 q-22,-30 -46,-34 q2,34 46,34 Z"),
    P("M100,150 q22,-30 46,-34 q-2,34 -46,34 Z"),
    P("M100,150 q-14,-52 -34,-62 q-6,44 34,62 Z"),
    P("M100,150 q14,-52 34,-62 q6,44 -34,62 Z"),
    P("M100,152 q-8,-64 0,-84 q8,20 0,84 Z"),
    C(100, 148, 14, 10),
  ],
};

/* ==================================================================
   交通工具
   ================================================================== */

const car = {
  id: "car-01",
  name: "小轿车",
  category: "vehicle",
  shapes: [
    // 车身
    P(
      "M26,120 q-8,0 -8,-12 v-4 q0,-10 10,-12 l30,-8 q10,-20 28,-20 h30 q16,0 24,20 l28,8 q10,2 10,12 v4 q0,12 -8,12 Z"
    ),
    // 车顶
    P("M60,84 q10,-18 26,-18 h22 q14,0 22,18 Z"),
    // 车窗
    P("M68,82 q7,-13 19,-13 h10 v13 Z"),
    P("M103,69 h11 q11,0 17,13 h-28 Z"),
    // 车门线
    L("M101,84 v26"),
    // 门把手
    L("M107,94 h10"),
    // 车轮
    C(66, 122, 21, 21),
    C(142, 122, 21, 21),
    L(ellipsePath(66, 122, 9, 9)),
    L(ellipsePath(142, 122, 9, 9)),
    // 车灯
    L("M18,96 q-6,2 -6,8 M182,96 q6,2 6,8"),
  ],
};

const bus = {
  id: "bus-01",
  name: "小巴士",
  category: "vehicle",
  shapes: [
    R(20, 34, 160, 102, 18),
    R(34, 48, 44, 34, 8),
    R(90, 48, 44, 34, 8),
    R(146, 48, 22, 34, 8),
    // 车门
    R(146, 92, 22, 44, 6),
    L("M157,92 v44"),
    // 车灯
    C(26, 112, 6, 6),
    C(174, 112, 6, 6),
    // 车轮
    C(56, 140, 19, 19),
    C(144, 140, 19, 19),
    L(ellipsePath(56, 140, 8, 8)),
    L(ellipsePath(144, 140, 8, 8)),
    L("M20,86 h160"),
  ],
};

const plane = {
  id: "plane-01",
  name: "小飞机",
  category: "vehicle",
  shapes: [
    // 机身
    P("M26,104 q0,-18 24,-24 l96,-18 q34,-6 34,14 q0,20 -34,22 l-96,10 q-24,2 -24,-4 Z"),
    // 机翼
    P("M92,84 L52,40 q-4,-6 4,-6 h10 q4,0 8,4 L118,80 Z"),
    P("M96,100 L56,148 q-4,6 4,6 h10 q4,0 8,-4 L122,106 Z"),
    // 尾翼
    P("M34,80 L14,44 q-2,-6 6,-6 h8 q4,0 6,4 L66,80 Z"),
    // 舷窗
    C(70, 96, 9, 9),
    C(96, 92, 9, 9),
    C(122, 88, 9, 9),
    C(148, 84, 9, 9),
    // 机头
    L("M182,76 q10,4 0,22"),
  ],
};

const boat = {
  id: "boat-01",
  name: "小帆船",
  category: "vehicle",
  shapes: [
    // 波浪
    P("M16,168 q22,-12 44,0 q22,-12 44,0 q22,-12 44,0 q22,-12 44,0 v18 H16 Z"),
    // 船身
    P("M44,128 h124 l-20,34 q-4,6 -12,6 H76 q-8,0 -12,-6 Z"),
    // 桅杆
    P("M100,26 h6 v102 h-6 Z"),
    // 帆
    P("M106,38 q52,26 48,80 h-48 Z"),
    P("M94,52 q-40,22 -38,66 h38 Z"),
    L("M58,128 h96"),
    C(100, 20, 7, 7),
  ],
};

const train = {
  id: "train-01",
  name: "小火车",
  category: "vehicle",
  shapes: [
    // 车头
    R(22, 58, 100, 74, 14),
    R(36, 72, 40, 32, 6),
    R(88, 72, 22, 32, 6),
    // 烟囱
    R(102, 34, 18, 26, 4),
    R(96, 26, 30, 12, 6),
    // 车厢
    R(130, 76, 50, 56, 10),
    R(140, 86, 30, 24, 4),
    // 烟
    C(111, 20, 9, 9),
    C(130, 10, 6, 6),
    // 轮子
    C(50, 146, 17, 17),
    C(98, 146, 17, 17),
    C(152, 146, 17, 17),
    L(ellipsePath(50, 146, 7, 7)),
    L(ellipsePath(98, 146, 7, 7)),
    L(ellipsePath(152, 146, 7, 7)),
    // 铁轨
    L("M10,168 h180"),
  ],
};

/* ==================================================================
   水果
   ================================================================== */

const apple = {
  id: "fruit-01",
  name: "红苹果",
  category: "fruit",
  shapes: [
    P("M100,68 q-8,-18 -4,-34 q2,-10 8,-10 q4,0 2,10 q-4,14 2,32 Z"),
    // 叶子
    P("M104,44 q26,-20 38,-6 q10,12 -14,18 q-18,4 -24,-12 Z"),
    // 果身
    P(
      "M100,70 q-18,-12 -36,-2 q-24,14 -20,54 q4,44 34,50 q10,2 22,2 q12,0 22,-2 q30,-6 34,-50 q4,-40 -20,-54 q-18,-10 -36,2 Z"
    ),
    // 高光
    L("M52,96 q-8,18 -2,40"),
    L("M100,70 q0,30 0,30"),
  ],
};

const strawberry = {
  id: "fruit-02",
  name: "草莓",
  category: "fruit",
  shapes: [
    P("M100,36 q-8,-20 4,-26 q10,-4 6,8 q-4,10 2,18 Z"),
    // 果身
    P("M100,50 q-52,0 -52,50 q0,46 52,90 q52,-44 52,-90 q0,-50 -52,-50 Z"),
    // 叶子
    P("M100,50 q-20,0 -30,-16 q16,-4 30,6 q14,-10 30,-6 q-10,16 -30,16 Z"),
    // 籽
    L("M74,96 l6,-4 M102,92 l6,-4 M128,98 l6,-4"),
    L("M82,124 l6,-4 M116,122 l6,-4"),
    L("M100,152 l6,-4"),
    L("M60,80 l6,-4 M138,82 l6,-4"),
  ],
};

const watermelon = {
  id: "watermelon-01",
  name: "西瓜",
  category: "fruit",
  shapes: [
    // 果皮（月牙形）
    P("M20,56 q80,150 160,0 q-80,132 -160,0 Z"),
    // 瓜皮内圈
    P("M34,62 q66,110 132,0 q-66,96 -132,0 Z"),
    // 果肉
    P("M44,68 q56,86 112,0 q-56,74 -112,0 Z"),
    // 籽
    L("M78,86 q4,-7 8,0 q-4,7 -8,0 Z"),
    L("M114,86 q4,-7 8,0 q-4,7 -8,0 Z"),
    L("M100,112 q4,-7 8,0 q-4,7 -8,0 Z"),
    L("M72,112 q4,-7 8,0 q-4,7 -8,0 Z"),
    L("M120,112 q4,-7 8,0 q-4,7 -8,0 Z"),
  ],
};

const orange = {
  id: "orange-01",
  name: "橙子",
  category: "fruit",
  shapes: [
    P("M100,54 q-4,-16 2,-26 h6 q-6,10 -2,26 Z"),
    P("M104,44 q22,-16 34,-4 q8,10 -12,16 q-16,4 -22,-12 Z"),
    C(100, 108, 62, 62),
    L("M100,46 v-8"),
    // 果肉切面（右半）
    L("M120,60 q40,20 40,48"),
    L("M120,156 q40,-20 40,-48"),
    L("M132,74 q30,16 30,34"),
    L("M132,142 q30,-16 30,-34"),
    L("M120,60 l12,14 M120,156 l12,-14"),
    L("M50,80 q-6,16 0,32"),
  ],
};

const pear = {
  id: "pear-01",
  name: "梨",
  category: "fruit",
  shapes: [
    P("M100,44 q-2,-16 4,-26 h6 q-6,10 -4,26 Z"),
    P("M104,38 q24,-14 34,-2 q6,10 -12,14 q-16,4 -22,-12 Z"),
    P(
      "M100,44 q-16,0 -22,24 q-6,22 -16,38 q-14,22 0,42 q12,18 38,18 q26,0 38,-18 q14,-20 0,-42 q-10,-16 -16,-38 q-6,-24 -22,-24 Z"
    ),
    L("M80,110 q-6,16 2,30"),
    L("M100,44 q0,16 0,20"),
  ],
  blush: [cheek(66, 96), cheek(134, 96)],
};

const grape = {
  id: "grape-01",
  name: "葡萄",
  category: "fruit",
  shapes: [
    P("M100,34 q-6,-14 2,-24 h6 q-6,10 -2,24 Z"),
    P("M102,30 q26,-18 36,-6 q8,10 -14,14 q-16,4 -22,-8 Z"),
    // 果粒
    C(100, 56, 16, 15),
    C(76, 74, 16, 15),
    C(124, 74, 16, 15),
    C(100, 90, 16, 15),
    C(54, 96, 16, 15),
    C(146, 96, 16, 15),
    C(78, 110, 16, 15),
    C(122, 110, 16, 15),
    C(100, 126, 16, 15),
    C(66, 144, 15, 14),
    C(134, 144, 15, 14),
    C(100, 162, 15, 14),
    L("M100,34 q0,10 0,14"),
  ],
};

/* ==================================================================
   恐龙
   ================================================================== */

const trex = {
  id: "dino-01",
  name: "霸王龙",
  category: "dino",
  shapes: [
    // 身体
    P(
      "M96,60 q-34,0 -44,34 q-10,34 8,58 q10,14 30,16 h42 q22,-2 26,-22 q4,-22 -10,-40 l16,-16 q8,-8 0,-14 q-8,-6 -16,4 l-8,8 q-18,-28 -44,-28 Z"
    ),
    // 尾巴
    P("M46,120 q-34,-6 -42,26 q-2,10 6,4 q12,-14 36,-16 Z"),
    // 腿
    P("M74,150 h22 v14 q0,14 -12,14 q-10,0 -10,-10 Z"),
    P("M112,150 h22 v14 q0,14 -12,14 q-10,0 -10,-10 Z"),
    // 背刺
    P("M70,64 l-10,-14 l14,4 l-2,-16 l12,12 l6,-14 l8,14 Z"),
    // 眼睛
    eye(112, 74, 5),
    // 牙齿
    L("M126,92 l6,8 l6,-8 l6,8"),
    L("M96,96 q10,10 22,6"),
  ],
};

const stego = {
  id: "dino-02",
  name: "剑龙",
  category: "dino",
  shapes: [
    // 背板
    P("M56,80 l-6,-30 l22,18 l6,-34 l22,28 l14,-32 l6,34 l22,-22 l-6,36 Z"),
    // 身体
    P(
      "M40,120 q0,-34 44,-42 q36,-8 60,10 q16,12 12,32 q-4,20 -28,24 h-56 q-30,-2 -32,-24 Z"
    ),
    // 尾巴
    P("M42,110 q-28,0 -34,16 q-4,10 4,6 q10,-8 32,-8 Z"),
    // 腿
    P("M68,146 h20 v16 q0,12 -10,12 q-10,0 -10,-10 Z"),
    P("M116,146 h20 v16 q0,12 -10,12 q-10,0 -10,-10 Z"),
    // 头
    P("M144,92 q24,-6 34,10 q6,10 -4,16 q-10,6 -24,2 Z"),
    eye(166, 100, 4),
    L("M162,110 q10,4 14,-2"),
  ],
};

const ptero = {
  id: "dino-03",
  name: "翼龙",
  category: "dino",
  shapes: [
    // 翅膀（三片掌骨，翼龙标志）
    P("M98,92 q-16,-44 -44,-56 q-10,-4 -8,6 q4,34 24,52 q-24,-10 -42,-6 q-8,2 -2,8 q22,22 52,26 Z"),
    P("M102,92 q16,-44 44,-56 q10,-4 8,6 q-4,34 -24,52 q24,-10 42,-6 q8,2 2,8 q-22,22 -52,26 Z"),
    // 身体
    P("M100,62 q-18,0 -20,26 q-2,26 8,46 l6,24 q2,6 8,6 q6,0 8,-6 l6,-24 q10,-20 8,-46 q-2,-26 -20,-26 Z"),
    // 头冠（朝后）
    P("M100,64 q-28,-16 -44,-8 q-4,2 2,6 q20,10 36,10 Z"),
    // 长嘴
    P("M100,78 q-20,2 -30,8 q-4,4 2,6 q14,4 28,0 Z"),
    eye(88, 74, 4),
    // 肚皮
    L("M100,120 q-10,4 -10,12 q0,8 10,8 q10,0 10,-8 q0,-8 -10,-12 Z"),
    // 爪
    L("M94,178 l-8,10 M106,178 l8,10"),
  ],
};

const bronto = {
  id: "dino-04",
  name: "长颈龙",
  category: "dino",
  shapes: [
    // 尾巴
    P("M44,128 q-26,2 -34,20 q-2,8 6,4 q12,-8 30,-10 Z"),
    // 身体
    P(
      "M40,132 q-4,-32 34,-38 q40,-8 64,6 q22,12 18,32 q-4,20 -30,22 H68 q-26,-2 -28,-22 Z"
    ),
    // 脖子
    P("M120,106 q16,-32 10,-50 q-4,-16 10,-22 q16,-6 22,10 q6,16 -6,24 q-2,20 -14,44 Z"),
    // 头
    P("M132,32 q22,-14 40,-2 q10,6 4,14 q-8,10 -26,8 q-14,-2 -18,-20 Z"),
    // 腿
    P("M62,158 h20 v14 q0,12 -10,12 q-10,0 -10,-10 Z"),
    P("M106,158 h20 v14 q0,12 -10,12 q-10,0 -10,-10 Z"),
    P("M84,158 h18 v10 q0,8 -9,8 q-9,0 -9,-8 Z"),
    eye(158, 40, 4),
    L("M150,52 q10,4 14,0"),
    // 斑点
    L(ellipsePath(76, 126, 7, 6)),
    L(ellipsePath(102, 138, 7, 6)),
    L(ellipsePath(118, 120, 7, 6)),
  ],
};

/* ==================================================================
   公主
   ================================================================== */

const princess = {
  id: "princess-01",
  name: "小公主",
  category: "princess",
  shapes: [
    // 裙摆
    P("M100,130 q-50,8 -70,62 h140 q-20,-54 -70,-62 Z"),
    // 上身
    P("M78,92 q22,12 44,0 l6,40 q-28,10 -56,0 Z"),
    // 头发（后面一层）
    P("M100,24 q-42,0 -44,44 q-2,28 12,34 q-16,-14 -12,-42 q4,-26 44,-36 q40,10 44,36 q4,28 -12,42 q14,-6 12,-34 q-2,-44 -44,-44 Z"),
    // 脸
    C(100, 68, 28, 27),
    // 刘海
    P("M74,56 q4,-24 26,-28 q22,4 26,28 q-14,-8 -26,-12 q-12,4 -26,12 Z"),
    // 两侧辫子
    P("M66,66 q-12,20 -6,40 q6,16 14,10 q-8,-24 -8,-50 Z"),
    P("M134,66 q12,20 6,40 q-6,16 -14,10 q8,-24 8,-50 Z"),
    // 皇冠
    P("M74,38 l2,-18 l12,10 l12,-16 l12,16 l12,-10 l2,18 Z"),
    eye(88, 66),
    eye(112, 66),
    L("M94,80 q6,5 12,0"),
    // 裙子花纹
    L("M50,176 q50,-16 100,0"),
    L("M58,190 q42,-12 84,0"),
  ],
  blush: [cheek(78, 78, 5), cheek(122, 78, 5)],
};

const crown = {
  id: "crown-01",
  name: "皇冠",
  category: "princess",
  shapes: [
    P(
      "M36,140 L28,58 L72,96 L100,40 L128,96 L172,58 L164,140 Z"
    ),
    // 底座
    P("M38,148 h124 q8,0 8,12 v12 q0,10 -10,10 H40 q-10,0 -10,-10 v-12 q0,-12 8,-12 Z"),
    // 宝石
    C(100, 140, 14, 14),
    C(66, 148, 10, 10),
    C(134, 148, 10, 10),
    C(28, 52, 9, 9),
    C(100, 36, 9, 9),
    C(172, 52, 9, 9),
    L("M62,124 h16 M92,124 h16 M122,124 h16"),
  ],
};

const castle = {
  id: "castle-01",
  name: "小城堡",
  category: "princess",
  shapes: [
    // 城墙
    P("M48,74 h104 v104 H48 Z"),
    // 城齿
    P("M48,74 V50 h16 v12 h16 V50 h16 v12 h16 V50 h16 v12 h16 V50 h8 v24 Z"),
    // 塔楼
    P("M20,86 h36 v92 H20 Z"),
    P("M144,86 h36 v92 h-36 Z"),
    // 塔顶
    P("M14,86 L38,44 l24,42 Z"),
    P("M138,86 L162,44 l24,42 Z"),
    // 大门
    P("M78,178 v-40 q0,-22 22,-22 q22,0 22,22 v40 Z"),
    // 窗
    P("M30,110 h16 v20 h-16 Z"),
    P("M154,110 h16 v20 h-16 Z"),
    P("M92,92 h16 v16 h-16 Z"),
    L("M100,92 v16 M92,100 h16"),
    L("M48,152 h104"),
  ],
};

/* ==================================================================
   小汽车（这里放"工程车 / 消防车"等，和"交通工具"区分开）
   ================================================================== */

const firetruck = {
  id: "truck-01",
  name: "消防车",
  category: "truck",
  shapes: [
    // 车身
    R(18, 62, 164, 74, 12),
    // 梯子
    P("M120,44 h66 v10 h-66 Z"),
    L("M130,44 v10 M144,44 v10 M158,44 v10 M172,44 v10"),
    L("M124,20 h58 v22 h-58 Z"),
    // 车窗
    R(30, 74, 46, 32, 8),
    // 后厢门
    R(86, 74, 84, 50, 8),
    L("M128,74 v50"),
    // 车灯
    C(24, 122, 6, 6),
    C(176, 122, 6, 6),
    // 车轮
    C(54, 140, 20, 20),
    C(146, 140, 20, 20),
    L(ellipsePath(54, 140, 8, 8)),
    L(ellipsePath(146, 140, 8, 8)),
    L("M18,100 h164"),
  ],
};

const digger = {
  id: "truck-02",
  name: "挖掘机",
  category: "truck",
  shapes: [
    // 履带
    P("M20,138 q0,-20 20,-20 h58 q20,0 20,20 v14 q0,16 -16,16 H36 q-16,0 -16,-16 Z"),
    C(40, 152, 11, 11),
    C(98, 152, 11, 11),
    // 车身
    R(40, 94, 72, 30, 8),
    // 驾驶室
    R(50, 58, 52, 40, 10),
    R(60, 68, 32, 22, 5),
    // 大臂
    P("M104,96 l48,-30 l7,11 l-48,30 Z"),
    // 小臂
    P("M148,62 l18,42 l-11,5 l-18,-42 Z"),
    // 铲斗
    P("M154,100 q20,-6 26,10 q6,16 -10,20 q-16,4 -22,-10 Z"),
    // 排气
    L("M92,58 v-12 h8 v12"),
  ],
};

const racecar = {
  id: "race-01",
  name: "赛车",
  category: "truck",
  shapes: [
    // 车身
    P(
      "M18,124 q-6,0 -6,-12 v-6 q0,-10 12,-14 l40,-8 q12,-18 30,-18 h30 q16,0 26,18 l34,8 q10,4 10,14 v6 q0,12 -8,12 Z"
    ),
    // 车顶
    P("M88,66 q10,-14 24,-14 h22 q12,0 20,14 Z"),
    // 尾翼
    P("M14,92 h26 v10 H14 Z M22,74 h10 v18 H22 Z"),
    // 车窗
    P("M96,64 q8,-10 18,-10 h16 v10 Z"),
    // 号码圈
    C(66, 100, 14, 14),
    // 车轮
    C(62, 128, 22, 22),
    C(140, 128, 22, 22),
    L(ellipsePath(62, 128, 9, 9)),
    L(ellipsePath(140, 128, 9, 9)),
    L("M18,108 h30"),
  ],
};

const jeep = {
  id: "jeep-01",
  name: "小吉普",
  category: "truck",
  shapes: [
    P(
      "M22,124 q-8,0 -8,-14 v-10 q0,-10 10,-12 l14,-32 q4,-10 14,-10 h84 q10,0 16,10 l22,32 q10,2 10,12 v10 q0,14 -8,14 Z"
    ),
    R(46, 60, 34, 30, 4),
    R(86, 60, 30, 30, 4),
    R(122, 60, 26, 30, 4),
    // 备胎
    C(178, 96, 16, 16),
    L(ellipsePath(178, 96, 6, 6)),
    // 车轮
    C(64, 128, 21, 21),
    C(146, 128, 21, 21),
    L(ellipsePath(64, 128, 8, 8)),
    L(ellipsePath(146, 128, 8, 8)),
    L("M22,94 h164"),
    // 前灯
    C(20, 112, 6, 6),
  ],
};

/* ==================================================================
   导出
   ================================================================== */

export const ARTWORKS = [
  dog,
  bunny,
  bear,
  pig,
  panda,
  fox,
  horse,
  tulip,
  daisy,
  rose,
  lotus,
  car,
  bus,
  plane,
  boat,
  train,
  apple,
  strawberry,
  watermelon,
  orange,
  pear,
  grape,
  trex,
  stego,
  ptero,
  bronto,
  princess,
  crown,
  castle,
  firetruck,
  digger,
  racecar,
  jeep,
];

export { shapeToD };

// 启动时统一做一次自适应（超出画布或过小的线稿会被缩放到安全范围内）
ARTWORKS.forEach((a) => fitToCanvas(a));

/* ------------------------------------------------------------------
   合并"图片线稿"
   ---------------------------------------------------------------
   js/art-image.js 里是从 PNG 转出来的漂亮线稿（build/build-image-arts.mjs 生成）。
   它们的 id 和手写线稿可能重复，所以这里按 id 覆盖：
   有同 id 的就替换掉手写版，没有的就追加。
   ------------------------------------------------------------------ */
import { IMAGE_ARTS } from "./art-image.js";

for (const imgArt of IMAGE_ARTS) {
  const idx = ARTWORKS.findIndex((a) => a.id === imgArt.id);
  if (idx >= 0) {
    ARTWORKS[idx] = imgArt;
  } else {
    ARTWORKS.push(imgArt);
  }
}
