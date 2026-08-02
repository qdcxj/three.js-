<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 13：流畅运行
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-13）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 砖墙/木门/玻璃贴图（程序化 CanvasTexture）+ 天空盒
 *    [stage-06] 阳光/环境光/室内点光源/壁灯聚光灯 + 阴影
 *    [stage-07] OrbitControls（拖拽旋转 + 阻尼 + 距离限制）
 *    [stage-08] 开关门动画（O 键）+ 开关灯（L 键）+ 昼夜自动循环
 *    [stage-09] 室内家具（用 Box 拼出桌椅床柜，演示家具布局）
 *    [stage-12] 烟囱粒子（THREE.Points 实现烟雾上升）
 *    [stage-13] ★性能优化★：
 *      1) Stats 性能面板：实时显示 FPS / MS / MB
 *      2) LOD 多精度模型：远处家具用低精度盒子，近处用高精度细节
 *      3) InstancedMesh 批量渲染：用一组"落叶"演示实例化网格
 *      4) 合并几何体：用 mergeGeometries 把"石阶装饰"合并为单个几何体
 *      5) 按需渲染：P 键切换"静态模式"，关停所有动画后仅在 controls.change 时渲染
 *      6) frustum culling：Three.js 默认开启，注释说明工作原理
 *
 *  本阶段新增教学（性能优化）：
 *    - 性能监测：Stats 面板怎么读，FPS/MS/MB 各代表什么
 *    - LOD：用 THREE.LOD 为同一物体提供多套精度，按相机距离自动切换
 *    - InstancedMesh：用一份 geometry+material 渲染 N 个实例，DrawCall 仍为 1
 *    - mergeGeometries：把多块静态几何体合并为一个 BufferGeometry，进一步降 DrawCall
 *    - 按需渲染：rAF 一直跑会空转耗电，静态场景下"事件驱动渲染"更省
 *    - frustum culling：物体包围球不在视锥内时自动跳过，是 Three.js 默认行为
 * ============================================================================
 */
import { ref, reactive, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// [stage-13] 性能监测面板：FPS / MS / MB
import Stats from "three/examples/jsm/libs/stats.module.js";
// [stage-13] 合并几何体工具：把多个 BufferGeometry 合成一个
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ----------------------------- Vue 引用 / 响应式 UI -----------------------------
const canvasRef = ref(null);

// UI 文案状态（驱动 template 中的提示卡片）
const ui = reactive({
  doorState: "关闭", // 显示当前门状态：关闭 / 开启
  lampState: "关闭", // 显示当前室内灯状态
  phase: "白天", // 显示当前昼夜阶段：白天 / 黄昏 / 夜晚 / 黎明
  perfMode: "动画", // 显示渲染模式：动画 / 静态(按需)
  drawCalls: 0, // [stage-13] 实时 DrawCall 数
  triangles: 0, // [stage-13] 实时三角形数
});

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let clock = null; // 帧率无关动画的核心时钟
let stats = null; // [stage-13] Stats 性能面板
let statsMode = 0; // [stage-13] 当前 Stats 显示模式：0=FPS, 1=MS, 2=MB
let animationId = null;

// 收集所有需要 dispose 的 geometry / material，便于统一释放
const disposables = [];
const track = (obj) => {
  disposables.push(obj);
  return obj;
};

// ----------------------------- 动画状态变量 -----------------------------
// 门动画：doorState 目标值 0=关 / 1=开；doorAngle 当前弧度值
let doorGroup = null; // 门轴 Group（旋转它就带动门板）
let doorState = 0; // 0 关 / 1 开（目标值）
let doorAngle = 0; // 当前门板旋转弧度（绕 Y 轴）

// 室内灯动画：lampOn 目标布尔；lampIntensity 当前强度
let indoorLamp = null; // 室内点光源
let lampOn = false; // 目标：是否开灯
let lampIntensity = 0; // 当前点光源强度（lerp 过渡）

// 昼夜循环参数
let sunLight = null; // 阳光平行光
let ambientLight = null; // 环境光
let cycleTime = 0; // 累计时间（秒）
const DAY_PERIOD = 24; // 一天周期 24 秒（演示用，便于观察）
// 昼 / 夜两端的颜色与强度（关键帧）
const DAY_SUN_COLOR = new THREE.Color(0xfffaf0); // 暖白阳光
const NIGHT_SUN_COLOR = new THREE.Color(0x6f8fff); // 冷蓝月光
const DAY_SKY_COLOR = new THREE.Color(0x87ceeb); // 天空蓝
const NIGHT_SKY_COLOR = new THREE.Color(0x0a0f2a); // 深夜蓝黑
const DAY_AMBIENT = 0.55; // 白天环境光强度
const NIGHT_AMBIENT = 0.12; // 夜晚环境光强度
const DAY_SUN_INTENSITY = 1.4; // 白天阳光强度
const NIGHT_SUN_INTENSITY = 0.25; // 夜晚月光强度

// 复用的临时颜色对象（避免每帧 new Color 造成 GC 压力）
const _tmpSunColor = new THREE.Color();
const _tmpSkyColor = new THREE.Color();

// [stage-12] 烟囱粒子相关
let smokePoints = null; // THREE.Points 对象
let smokeVelocities = null; // 每个粒子的上升速度（Float32Array）

// [stage-13] 性能模式开关：true=静态按需渲染，false=动画全开
let perfMode = false;
// [stage-13] 用于"脏标记"按需渲染：true 表示需要重绘一帧
let needsRender = true;

// [stage-13] InstancedMesh 落叶
let leavesMesh = null; // InstancedMesh
const LEAVES_COUNT = 200; // 落叶数量
const _leafMatrix = new THREE.Matrix4(); // 复用矩阵，避免每帧 new
const _leafPos = new THREE.Vector3();
const _leafQuat = new THREE.Quaternion();
const _leafScale = new THREE.Vector3();
const _leafEuler = new THREE.Euler();

// ============================================================================
//  1. 场景 / 相机 / 渲染器 / 控制器
// ============================================================================
const initScene = () => {
  scene = new THREE.Scene();
  // 初始背景设为天空蓝（昼/夜循环里会持续覆盖这个颜色）
  scene.background = new THREE.Color(0x87ceeb);

  // 透视相机：FOV 50°，初始位置 (12, 8, 12) 看向原点（HOUSE_SPEC 通用）
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(12, 8, 12);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // [stage-06] 开启阴影渲染
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 软阴影

  // [stage-07] OrbitControls：拖拽旋转、滚轮缩放
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 启用阻尼，旋转更顺滑
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.5, 0); // 视线中心略抬到房子中部
  controls.minDistance = 4;
  controls.maxDistance = 40;
  controls.update();

  // [stage-08] 创建全局时钟（用于帧率无关动画）
  clock = new THREE.Clock();

  // --------------------------------------------------------------
  // [stage-13] 初始化 Stats 性能面板
  // --------------------------------------------------------------
  // Stats 是 three/examples 提供的小工具，会在左上角显示：
  //   FPS：每秒帧数（越高越好，60 是流畅底线）
  //   MS：每帧渲染耗时（毫秒，越低越好；60FPS 对应 16.6ms）
  //   MB：已分配的 JS 堆内存（MB，越平稳越好；持续上涨=内存泄漏）
  // 它默认每秒更新一次，避免抖动太快看不清。
  stats = new Stats();
  stats.showPanel(0); // 0=FPS, 1=MS, 2=MB（默认显示 FPS）
  // 把 Stats 的 DOM 挂到 body 上，固定在左上角
  stats.dom.style.position = "fixed";
  stats.dom.style.left = "12px";
  stats.dom.style.top = "12px";
  stats.dom.style.zIndex = "100";
  document.body.appendChild(stats.dom);
};

// ============================================================================
//  2. [stage-13] Stats 面板模式切换（点击面板可循环切换 FPS/MS/MB）
// ============================================================================
/**
 * 切换 Stats 显示模式：0=FPS, 1=MS, 2=MB
 * 用户点击 Stats 面板时也会触发内置切换，这里只是给个程序化接口
 * @param {number} mode 0/1/2
 */
const setStatsMode = (mode) => {
  if (stats) stats.showPanel(mode);
};

// ============================================================================
//  3. [stage-05] 程序化贴图（Canvas 生成砖墙 / 木纹 / 草地纹理）
// ============================================================================
/**
 * 生成砖墙纹理：Canvas 绘制规则的砖块图案
 * @returns {THREE.CanvasTexture}
 */
const makeBrickTexture = () => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  // 底色
  ctx.fillStyle = "#e6d5b8";
  ctx.fillRect(0, 0, 256, 256);
  // 砖块：每行 4 块，每块 64x32，奇数行错位半块
  ctx.strokeStyle = "#b89968";
  ctx.lineWidth = 2;
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : 32;
    for (let col = -1; col < 4; col++) {
      ctx.strokeRect(col * 64 + offset, row * 32, 64, 32);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

/**
 * 生成木纹纹理：Canvas 绘制深浅交错的木纹条纹
 * @returns {THREE.CanvasTexture}
 */
const makeWoodTexture = () => {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(0, 0, 128, 256);
  // 木纹深色条纹
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = `rgba(60,30,10,${0.15 + Math.random() * 0.25})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const x = Math.random() * 128;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 20,
      80,
      x + (Math.random() - 0.5) * 20,
      170,
      x + (Math.random() - 0.5) * 30,
      256
    );
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
};

/**
 * 生成草地纹理：Canvas 绘制噪点草丛
 * @returns {THREE.CanvasTexture}
 */
const makeGrassTexture = () => {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#67c23a";
  ctx.fillRect(0, 0, 128, 128);
  // 随机深浅草点
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(${50 + Math.random() * 40},${
      120 + Math.random() * 60
    },${40 + Math.random() * 30},0.6)`;
    ctx.fillRect(
      Math.random() * 128,
      Math.random() * 128,
      1 + Math.random() * 2,
      1 + Math.random() * 2
    );
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8); // 平铺 8x8 次
  return tex;
};

// ============================================================================
//  4. [stage-06] 灯光（阳光 + 环境光 + 室内点光源 + 壁灯聚光灯 + 阴影）
// ============================================================================
const addLights = () => {
  // 环境光：白天 0.55 / 夜晚 0.12，由昼夜循环驱动
  ambientLight = new THREE.AmbientLight(0xffffff, DAY_AMBIENT);
  scene.add(ambientLight);

  // 阳光平行光：从 (10,15,8) 照向原点，开阴影
  sunLight = new THREE.DirectionalLight(DAY_SUN_COLOR.getHex(), DAY_SUN_INTENSITY);
  sunLight.position.set(10, 15, 8);
  sunLight.target.position.set(0, 0, 0);
  // 阴影相机参数（覆盖整个小屋范围）
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 60;
  sunLight.shadow.camera.left = -15;
  sunLight.shadow.camera.right = 15;
  sunLight.shadow.camera.top = 15;
  sunLight.shadow.camera.bottom = -15;
  sunLight.shadow.bias = -0.0005; // 缓解阴影痤疮
  scene.add(sunLight);
  scene.add(sunLight.target);

  // 室内点光源：暖黄 #ffd27a，位置 (0, 2.8, 0)，开阴影
  // 初始 intensity=0（关灯），按 L 键开灯
  indoorLamp = new THREE.PointLight(0xffd27a, 0, 12, 2);
  indoorLamp.position.set(0, 2.8, 0);
  indoorLamp.castShadow = true;
  indoorLamp.shadow.mapSize.set(512, 512);
  scene.add(indoorLamp);

  // 壁灯聚光灯 ×2：位置 (±2, 2.5, -2.8) 朝前下方
  // 跟随室内灯一起开/关（用同一个 lampIntensity 乘子驱动）
  const wallLamp1 = new THREE.SpotLight(
    0xffe4b5,
    0,
    8,
    Math.PI / 5,
    0.4,
    1.5
  );
  wallLamp1.position.set(-2, 2.5, -2.8);
  wallLamp1.target.position.set(-2, 0.5, 0);
  scene.add(wallLamp1);
  scene.add(wallLamp1.target);
  // 用 userData 标记是壁灯，方便 animate 里统一调整强度
  wallLamp1.userData.isWallLamp = true;
  track(wallLamp1);

  const wallLamp2 = new THREE.SpotLight(
    0xffe4b5,
    0,
    8,
    Math.PI / 5,
    0.4,
    1.5
  );
  wallLamp2.position.set(2, 2.5, -2.8);
  wallLamp2.target.position.set(2, 0.5, 0);
  scene.add(wallLamp2);
  scene.add(wallLamp2.target);
  wallLamp2.userData.isWallLamp = true;
  track(wallLamp2);
};

// ============================================================================
//  5. [stage-01] 草地（带程序化草地贴图）
// ============================================================================
const addGround = () => {
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    roughness: 1.0,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true; // 草地接收阴影
  scene.add(track(ground));
};

// ============================================================================
//  6. [stage-02] 地基平台 + 入口台阶
// ============================================================================
const addFoundation = () => {
  const foundationMat = new THREE.MeshStandardMaterial({
    color: 0x909399,
    roughness: 0.9,
    metalness: 0.0,
  });

  // 地基平台：8(X) × 0.3(Y) × 6(Z)，中心 (0, 0.15, 0)
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, 6),
    foundationMat
  );
  platform.position.set(0, 0.15, 0);
  platform.castShadow = true;
  platform.receiveShadow = true;
  scene.add(track(platform));

  // 入口台阶：两级
  const step1 = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.15, 0.4),
    foundationMat
  );
  step1.position.set(0, 0.075, 3.2);
  step1.castShadow = true;
  step1.receiveShadow = true;
  scene.add(track(step1));

  const step2 = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.15, 0.4),
    foundationMat
  );
  step2.position.set(0, 0.225, 3.0);
  step2.castShadow = true;
  step2.receiveShadow = true;
  scene.add(track(step2));
};

// ============================================================================
//  7. [stage-03 + stage-08] 四面墙(含门洞/窗洞) + 木门(带门轴 pivot)
// ============================================================================
const addWallsAndDoor = (houseGroup) => {
  // 外墙材质：贴砖墙纹理 + 暖米色基底
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    map: makeBrickTexture(),
    roughness: 0.9,
    metalness: 0.0,
  });

  // 木门材质：贴木纹纹理
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    map: makeWoodTexture(),
    roughness: 0.6,
    metalness: 0.0,
  });

  const WT = 0.2; // 墙厚
  // 辅助：创建墙块，统一开阴影
  const block = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    houseGroup.add(track(m));
    return m;
  };

  // ---- 后墙：8(X) × 3(Y) × 0.2(Z)，整体一块 ----
  block(8, 3, WT, 0, 1.8, -3);

  // ---- 左墙：0.2(X) × 3(Y) × 6(Z)，含 1 个侧窗洞 ----
  block(WT, 0.6, 6, -4, 0.6, 0);
  block(WT, 1.2, 2.4, -4, 1.5, -1.8);
  block(WT, 1.2, 2.4, -4, 1.5, 1.8);
  block(WT, 1.2, 6, -4, 2.7, 0);

  // ---- 右墙：对称 ----
  block(WT, 0.6, 6, 4, 0.6, 0);
  block(WT, 1.2, 2.4, 4, 1.5, -1.8);
  block(WT, 1.2, 2.4, 4, 1.5, 1.8);
  block(WT, 1.2, 6, 4, 2.7, 0);

  // ---- 前墙：8(X) × 3(Y) × 0.2(Z)，含 1 门洞 + 2 窗洞，z=3 ----
  block(8, 0.6, WT, 0, 0.6, 3);
  block(1.6, 1.2, WT, -3.2, 1.5, 3);
  block(1.1, 1.2, WT, -1.05, 1.5, 3);
  block(1.1, 1.2, WT, 1.05, 1.5, 3);
  block(1.6, 1.2, WT, 3.2, 1.5, 3);
  block(3.5, 0.2, WT, -2.25, 2.2, 3);
  block(3.5, 0.2, WT, 2.25, 2.2, 3);
  block(8, 1.0, WT, 0, 2.8, 3);

  // ---- 玻璃 ×4（4 个窗洞）：浅蓝半透射 ----
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa8d0ff,
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.85, // 透射率
    transparent: true,
    opacity: 0.6,
  });
  // 前墙 2 窗：尺寸 0.72 × 1.12 × 0.02，位置 (±2, 1.5, 3.0)
  const frontGlass1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.12, 0.02),
    glassMat
  );
  frontGlass1.position.set(-2, 1.5, 3.0);
  houseGroup.add(track(frontGlass1));
  const frontGlass2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.12, 0.02),
    glassMat
  );
  frontGlass2.position.set(2, 1.5, 3.0);
  houseGroup.add(track(frontGlass2));
  // 侧墙 2 窗：尺寸 1.12(Z) × 1.12(Y) × 0.02(X)，位置 (±4, 1.5, 0)
  const sideGlass1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 1.12, 1.12),
    glassMat
  );
  sideGlass1.position.set(-4, 1.5, 0);
  houseGroup.add(track(sideGlass1));
  const sideGlass2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 1.12, 1.12),
    glassMat
  );
  sideGlass2.position.set(4, 1.5, 0);
  houseGroup.add(track(sideGlass2));

  // ============================================================
  //  [stage-08] 木门 + 门轴 pivot（核心动画结构）
  // ------------------------------------------------------------
  // 关键技巧：要让门绕门框"左侧边"旋转，必须把门板放到一个 Group 里，
  // Group 的原点 = 门轴位置（门洞左边缘），门板几何中心在 Group 局部坐标
  // 偏移 +0.5（门宽一半）到右侧。这样旋转 Group.rotation.y 时，门板就会
  // 绕左边缘（门轴）转动，而不是绕自身中心自旋。
  //
  // 门洞中心 (0, 1.3, 3)，门宽 1.0 → 门洞左边缘 x=-0.5
  // 门轴 Group 位置 = (-0.5, 1.3, 3.125)（z 略凸出墙面）
  // 门板局部坐标 = (0.5, 0, 0)（向右偏移半门宽）
  // ============================================================
  doorGroup = new THREE.Group();
  doorGroup.position.set(-0.5, 1.3, 3.125);
  // 初始旋转 0（关闭时门板与墙面平行）
  doorGroup.rotation.y = 0;

  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.05),
    doorMat
  );
  doorPanel.position.set(0.5, 0, 0); // 关键：偏移到门轴右侧
  doorPanel.castShadow = true;
  doorPanel.receiveShadow = true;
  doorGroup.add(doorPanel);
  // 注意：doorPanel 不挂 track（随 doorGroup 一起释放时手动 dispose），
  // 但要记得在 disposeScene 中处理 doorGroup 内的子级 geometry/material
  houseGroup.add(doorGroup);
};

// ============================================================================
//  8. [stage-04] 尖屋顶（双坡顶 + 山墙）
// ============================================================================
const addRoof = (houseGroup) => {
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xa0522d,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const gableMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // 屋顶几何参数（与 HOUSE_SPEC 一致）
  const ridgeY = 5.0;
  const eaveY = 3.3;
  const halfSpan = 4.0;
  const ridgeLen = 6.6;
  const slopeLen = Math.sqrt(
    halfSpan * halfSpan + (ridgeY - eaveY) ** 2
  );
  const slopeAngle = Math.atan((ridgeY - eaveY) / halfSpan);

  const leftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  leftRoof.position.set(-2, 4.15, 0);
  leftRoof.rotation.z = slopeAngle;
  leftRoof.castShadow = true;
  leftRoof.receiveShadow = true;
  houseGroup.add(track(leftRoof));

  const rightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  rightRoof.position.set(2, 4.15, 0);
  rightRoof.rotation.z = -slopeAngle;
  rightRoof.castShadow = true;
  rightRoof.receiveShadow = true;
  houseGroup.add(track(rightRoof));

  // 山墙三角形（前后各一）
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-4, 0);
  gableShape.lineTo(4, 0);
  gableShape.lineTo(0, 1.7);
  gableShape.lineTo(-4, 0);
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 0.2,
    bevelEnabled: false,
  });

  const frontGable = new THREE.Mesh(gableGeo, gableMat);
  frontGable.position.set(0, 3.3, 3.0);
  frontGable.castShadow = true;
  frontGable.receiveShadow = true;
  houseGroup.add(track(frontGable));

  // 后山墙共享 gableGeo，复用 geometry（dispose 时 track 一次即可）
  const backGable = new THREE.Mesh(gableGeo, gableMat);
  backGable.position.set(0, 3.3, -3.2);
  backGable.castShadow = true;
  backGable.receiveShadow = true;
  houseGroup.add(track(backGable));
};

// ============================================================================
//  9. [stage-04] 烟囱 + 室内地板
// ============================================================================
const addChimneyAndFloor = (houseGroup) => {
  const chimneyMat = new THREE.MeshStandardMaterial({
    color: 0x909399,
    roughness: 0.95,
    metalness: 0.0,
  });
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.5, 0.6),
    chimneyMat
  );
  chimney.position.set(2, 4.5, -1.5);
  chimney.castShadow = true;
  chimney.receiveShadow = true;
  houseGroup.add(track(chimney));

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd2b48c,
    roughness: 0.7,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 0.05, 5.6),
    floorMat
  );
  floor.position.set(0, 0.325, 0);
  floor.receiveShadow = true;
  houseGroup.add(track(floor));
};

// ============================================================================
//  10. [stage-05] 天空盒（用渐变色模拟天空，避免外部资源依赖）
// ============================================================================
/**
 * 用一个大球体内表面贴渐变纹理模拟天空盒。
 * 这里不加载外部 HDR，而是用 Canvas 画一张"上深下浅"的渐变图。
 */
const addSkybox = () => {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#5b94d6"); // 天顶较深蓝
  grad.addColorStop(0.5, "#a3c8e8");
  grad.addColorStop(1, "#dbeaf5"); // 地平线浅
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  const skyTex = new THREE.CanvasTexture(c);

  const skyGeo = new THREE.SphereGeometry(100, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide, // 渲染内表面
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(track(sky));
};

// ============================================================================
//  11. [stage-09] 室内家具（用 Box 拼出桌椅床柜，演示家具布局）
// ============================================================================
/**
 * 这里不加载外部 GLTF，而是用几组 BoxGeometry 拼出"程序化家具"。
 * 一方面保持本快照自包含（无外部资源依赖），另一方面家具本身就是
 * stage-13 演示 LOD 的理想对象：近处用细节模型，远处退化为简单盒子。
 * @param {THREE.Group} houseGroup
 */
const addFurniture = (houseGroup) => {
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6b4423,
    roughness: 0.7,
    metalness: 0.0,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xb07d56,
    roughness: 0.9,
    metalness: 0.0,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x606266,
    roughness: 0.4,
    metalness: 0.7,
  });

  // ============================================================
  //  [stage-13] 用 LOD 包装每件家具：近处用"高精度"组（多块拼），
  //  远处用"低精度"组（单块整体盒子）。Three.js 的 LOD 会根据相机
  //  到物体距离自动切换可见层级。
  //  ----------------------------------------------------------
  //  用法：
  //    const lod = new THREE.LOD();
  //    lod.addLevel(highDetailMesh, 0);   // 距离 0~5 用高精度
  //    lod.addLevel(lowDetailMesh, 5);    // 距离 5~15 用低精度
  //    lod.addLevel(emptyObject, 15);    // 距离 >15 完全不渲染（隐藏）
  //  距离阈值是"相机到 LOD 原点"的世界距离。
  // ============================================================

  // ---------- 高精度桌子（桌面+4 腿+桌布） ----------
  const makeTableHigh = (matSet) => {
    const g = new THREE.Group();
    // 桌面
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.8),
      matSet.wood
    );
    top.position.y = 0.78;
    top.castShadow = true;
    top.receiveShadow = true;
    g.add(top);
    // 4 腿
    const legGeo = new THREE.BoxGeometry(0.08, 0.78, 0.08);
    [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]].forEach(
      ([x, z]) => {
        const leg = new THREE.Mesh(legGeo, matSet.wood);
        leg.position.set(x, 0.39, z);
        leg.castShadow = true;
        g.add(leg);
      }
    );
    // 桌布
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.02, 0.4),
      matSet.cloth
    );
    cloth.position.set(0, 0.83, 0);
    cloth.castShadow = true;
    g.add(cloth);
    return g;
  };

  // ---------- 低精度桌子（一个整体盒子） ----------
  const makeTableLow = (matSet) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.86, 0.8),
      matSet.wood
    );
    m.position.y = 0.43;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // ---------- 高精度椅子（座+靠背+4 腿） ----------
  const makeChairHigh = (matSet) => {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.05, 0.4),
      matSet.wood
    );
    seat.position.y = 0.45;
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.5, 0.05),
      matSet.wood
    );
    back.position.set(0, 0.7, -0.175);
    back.castShadow = true;
    g.add(back);
    const legGeo = new THREE.BoxGeometry(0.04, 0.45, 0.04);
    [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(
      ([x, z]) => {
        const leg = new THREE.Mesh(legGeo, matSet.wood);
        leg.position.set(x, 0.225, z);
        g.add(leg);
      }
    );
    return g;
  };

  // ---------- 低精度椅子 ----------
  const makeChairLow = (matSet) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.9, 0.4),
      matSet.wood
    );
    m.position.y = 0.45;
    m.castShadow = true;
    return m;
  };

  // ---------- 床（高=床架+被褥+枕头；低=一个盒子） ----------
  const makeBedHigh = (matSet) => {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.3, 2.0),
      matSet.wood
    );
    frame.position.y = 0.2;
    frame.castShadow = true;
    g.add(frame);
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.18, 1.95),
      matSet.cloth
    );
    mattress.position.y = 0.44;
    mattress.castShadow = true;
    g.add(mattress);
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.3),
      matSet.cloth
    );
    pillow.position.set(0, 0.58, -0.7);
    g.add(pillow);
    return g;
  };
  const makeBedLow = (matSet) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.5, 2.0),
      matSet.wood
    );
    m.position.y = 0.25;
    m.castShadow = true;
    return m;
  };

  // ---------- 柜子（高=柜身+2 门把手；低=盒子） ----------
  const makeCabinetHigh = (matSet) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.6, 0.5),
      matSet.wood
    );
    body.position.y = 0.8;
    body.castShadow = true;
    g.add(body);
    const knobGeo = new THREE.SphereGeometry(0.03, 8, 8);
    [-0.25, 0.25].forEach((x) => {
      const knob = new THREE.Mesh(knobGeo, matSet.metal);
      knob.position.set(x, 0.8, 0.26);
      g.add(knob);
    });
    return g;
  };
  const makeCabinetLow = (matSet) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.6, 0.5),
      matSet.wood
    );
    m.position.y = 0.8;
    m.castShadow = true;
    return m;
  };

  const matSet = { wood: woodMat, cloth: clothMat, metal: metalMat };

  /**
   * 通用工具：给定一个"高精度组 + 低精度网格 + 位置"，创建 LOD 并加进 houseGroup
   * @param {THREE.Group} high 高精度组
   * @param {THREE.Mesh} low 低精度网格
   * @param {number} x
   * @param {number} z
   * @param {number} [rotateY=0] 朝向
   */
  const addLOD = (high, low, x, z, rotateY = 0) => {
    const lod = new THREE.LOD();
    // 把 high 整体作为一个子级（用 Object3D 包装一层不影响几何）
    lod.addLevel(high, 0); // 距离 <8 用高精度
    lod.addLevel(low, 8); // 距离 8~18 用低精度
    lod.addLevel(new THREE.Object3D(), 18); // 距离 >18 不渲染
    // Object3D 是空对象，相当于"隐藏"该 LOD
    lod.position.set(x, 0.35, z);
    lod.rotation.y = rotateY;
    houseGroup.add(lod);
    // 把 high/low 内部所有 mesh 的 geometry/material 加入 disposables
    lod.traverse((obj) => {
      if (obj.geometry) track(obj);
    });
  };

  // 餐桌 + 2 椅子（放在房子中前部）
  addLOD(makeTableHigh(matSet), makeTableLow(matSet), 0, 1.0);
  addLOD(makeChairHigh(matSet), makeChairLow(matSet), -0.9, 1.0);
  addLOD(makeChairHigh(matSet), makeChairLow(matSet), 0.9, 1.0, Math.PI);

  // 床（放在房子右后角，朝向 -X）
  addLOD(makeBedHigh(matSet), makeBedLow(matSet), 2.5, -1.5, -Math.PI / 2);

  // 柜子（放在房子左后角）
  addLOD(makeCabinetHigh(matSet), makeCabinetLow(matSet), -3.0, -2.0);
};

// ============================================================================
//  12. [stage-13] 合并几何体：把"石阶装饰"合并为一个 BufferGeometry
// ============================================================================
/**
 * 在草地到台阶之间铺一条"碎石小径"：传统做法是为每块石头创建一个 Mesh，
 * 100 块石头 = 100 个 DrawCall。这里用 mergeGeometries 把所有石头合并成
 * 一个 BufferGeometry，只用一个 Mesh 渲染，DrawCall 从 100 降为 1。
 *
 * 注意：合并的前提是这些几何体**共用同一份材质**（材质不同无法合并），
 * 且**位置/旋转已 bake 进顶点数据**（用 geometry.applyMatrix4 把世界
 * 变换烘焙到顶点里），否则合并后会重叠在原点。
 */
const addMergedStonePath = () => {
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xa8a8a8,
    roughness: 0.95,
    metalness: 0.0,
  });

  // 收集每块石头的小几何体（已 bake 位置）
  const geos = [];
  const STONE_COUNT = 30;
  for (let i = 0; i < STONE_COUNT; i++) {
    // 每块石头：0.3~0.5 米见方的小盒子
    const size = 0.3 + Math.random() * 0.2;
    const g = new THREE.BoxGeometry(size, 0.05, size);
    // 沿 +Z 方向从台阶向远处铺开，左右随机偏移
    const x = (Math.random() - 0.5) * 1.5;
    const z = 3.5 + i * 0.25; // 从 3.5 一路铺到 ~10.75
    const y = 0.025;
    // 用 applyMatrix4 把"平移"烘焙进顶点
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
    geos.push(g);
  }
  // 合并所有小盒子为一个 BufferGeometry
  const merged = mergeGeometries(geos, false);
  // 合并后立即释放原始小几何体（已被合并到 merged 里）
  geos.forEach((g) => g.dispose());

  const stones = new THREE.Mesh(merged, stoneMat);
  stones.castShadow = true;
  stones.receiveShadow = true;
  scene.add(track(stones));
};

// ============================================================================
//  13. [stage-13] InstancedMesh：批量渲染"落叶"
// ============================================================================
/**
 * 在草地上撒 200 片"落叶"。每片叶子是一个小四边形（PlaneGeometry），
 * 如果用 200 个独立 Mesh，就是 200 个 DrawCall；用 InstancedMesh 则只需
 * 1 个 DrawCall，性能提升巨大。
 *
 * InstancedMesh 的核心：一份 geometry + 一份 material + N 个"实例矩阵"。
 * 每个实例的位置/旋转/缩放由 setMatrixAt(i, matrix4) 设置。
 * 设置完后必须设置 instanceMatrix.needsUpdate = true 让 GPU 重新上传。
 *
 * 这里还会在 animate 里给叶子轻微"摆动"演示动态更新实例矩阵。
 */
const addInstancedLeaves = () => {
  // 单片叶子的几何：0.15×0.15 的平面（双面）
  const leafGeo = new THREE.PlaneGeometry(0.15, 0.15);
  // 叶子材质：暖橙色（秋天落叶）
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  leavesMesh = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES_COUNT);
  leavesMesh.castShadow = true;
  leavesMesh.receiveShadow = true;

  // 给每个实例设置初始矩阵（位置 + 旋转 + 缩放）
  // 同时把"基准位置"存到 userData，方便 animate 里摆动
  leavesMesh.userData.basePositions = [];
  for (let i = 0; i < LEAVES_COUNT; i++) {
    // 随机散布在 40x40 草地上，但避开房子地基范围（|x|<5, |z|<3.5 内不放）
    let x, z;
    do {
      x = (Math.random() - 0.5) * 38;
      z = (Math.random() - 0.5) * 38;
    } while (Math.abs(x) < 5 && Math.abs(z) < 3.5);
    const y = 0.05 + Math.random() * 0.05; // 略浮于草地之上

    _leafPos.set(x, y, z);
    _leafEuler.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    _leafQuat.setFromEuler(_leafEuler);
    const s = 0.7 + Math.random() * 0.6;
    _leafScale.set(s, s, s);
    _leafMatrix.compose(_leafPos, _leafQuat, _leafScale);
    leavesMesh.setMatrixAt(i, _leafMatrix);
    leavesMesh.userData.basePositions.push({ x, y, z, phase: Math.random() * Math.PI * 2 });
  }
  leavesMesh.instanceMatrix.needsUpdate = true;
  // 让 frustum culling 按完整包围盒判断（默认 true，这里显式说明）
  leavesMesh.frustumCulled = true;
  scene.add(track(leavesMesh));
};

// ============================================================================
//  14. [stage-12] 烟囱粒子（THREE.Points 实现烟雾上升）
// ============================================================================
/**
 * 在烟囱顶部 (2, 5.3, -1.5) 持续生成烟雾粒子。每个粒子：
 *   - 初始位置：烟囱顶 + 随机小偏移
 *   - 速度：向上为主，加一点水平随机
 *   - 生命周期：上升到一定高度后重置回烟囱顶
 * 用 BufferGeometry + PointsMaterial 实现，全部粒子共用一份材质，
 * 一次 DrawCall 渲染。
 */
const addSmokeParticles = () => {
  const COUNT = 120;
  const positions = new Float32Array(COUNT * 3);
  smokeVelocities = new Float32Array(COUNT * 3);

  const chimneyTop = new THREE.Vector3(2, 5.3, -1.5);
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = chimneyTop.x + (Math.random() - 0.5) * 0.3;
    positions[i3 + 1] = chimneyTop.y + Math.random() * 0.5;
    positions[i3 + 2] = chimneyTop.z + (Math.random() - 0.5) * 0.3;
    // 速度：向上 0.3~0.6 m/s，水平 ±0.1
    smokeVelocities[i3] = (Math.random() - 0.5) * 0.2;
    smokeVelocities[i3 + 1] = 0.3 + Math.random() * 0.3;
    smokeVelocities[i3 + 2] = (Math.random() - 0.5) * 0.2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  // 用 Canvas 画一个柔和的圆形作为粒子纹理（避免方点外观）
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(220,220,220,0.9)");
  grad.addColorStop(0.5, "rgba(210,210,210,0.4)");
  grad.addColorStop(1, "rgba(200,200,200,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const smokeTex = new THREE.CanvasTexture(c);

  const mat = new THREE.PointsMaterial({
    size: 0.6,
    map: smokeTex,
    transparent: true,
    opacity: 0.7,
    depthWrite: false, // 不写深度，避免粒子互相遮挡出黑边
    blending: THREE.NormalBlending,
    sizeAttenuation: true, // 随距离衰减
  });

  smokePoints = new THREE.Points(geo, mat);
  smokePoints.frustumCulled = false; // 粒子运动范围小，关掉 culling 避免闪烁
  scene.add(smokePoints);
  track(smokePoints);
};

// ============================================================================
//  15. 组装整个房子
// ============================================================================
const addHouse = () => {
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";
  addWallsAndDoor(houseGroup); // [stage-03 + stage-08] 墙 + 门(带门轴)
  addRoof(houseGroup); // [stage-04] 屋顶 + 山墙
  addChimneyAndFloor(houseGroup); // [stage-04] 烟囱 + 室内地板
  addFurniture(houseGroup); // [stage-09 + stage-13 LOD] 家具
  scene.add(houseGroup);
  return houseGroup;
};

// ============================================================================
//  16. [stage-08 + stage-13] 键盘交互：O 门 / L 灯 / P 性能模式 / S 切 Stats
// ============================================================================
const onKeyDown = (e) => {
  const key = e.key.toLowerCase();
  if (key === "o") {
    // 切换门目标状态
    doorState = doorState === 0 ? 1 : 0;
    ui.doorState = doorState === 1 ? "开启" : "关闭";
    needsRender = true; // [stage-13] 状态变化，标记需要重绘
  } else if (key === "l") {
    // 切换室内灯目标状态
    lampOn = !lampOn;
    ui.lampState = lampOn ? "开启" : "关闭";
    needsRender = true;
  } else if (key === "p") {
    // [stage-13] 切换"性能模式"：true=静态按需渲染，false=动画全开
    perfMode = !perfMode;
    ui.perfMode = perfMode ? "静态(按需)" : "动画";
    needsRender = true;
    // 切换模式时立刻重绘一帧，避免画面停在中间状态
  } else if (key === "s") {
    // [stage-13] 循环切换 Stats 显示模式：FPS → MS → MB → FPS
    if (stats) {
      statsMode = (statsMode + 1) % 3;
      setStatsMode(statsMode);
    }
  }
};

// ============================================================================
//  17. [stage-08] 帧率无关动画核心：门 / 灯 / 昼夜
// ============================================================================
/**
 * 门动画：把当前 doorAngle lerp 向目标 doorState * 90°
 * @param {number} dt 帧间隔（秒）
 */
const updateDoor = (dt) => {
  if (!doorGroup) return;
  const targetAngle = doorState * (Math.PI / 2); // 0 或 90°
  // 帧率无关 lerp：speed 越大越快，10 表示约 0.1 秒到位
  const speed = 8;
  doorAngle += (targetAngle - doorAngle) * Math.min(1, speed * dt);
  doorGroup.rotation.y = doorAngle;
};

/**
 * 室内灯动画：把当前 lampIntensity lerp 向目标 (lampOn ? 1 : 0)
 * 同时驱动壁灯强度
 * @param {number} dt 帧间隔（秒）
 */
const updateLamp = (dt) => {
  if (!indoorLamp) return;
  const target = lampOn ? 1.0 : 0.0;
  const speed = 5;
  lampIntensity += (target - lampIntensity) * Math.min(1, speed * dt);
  indoorLamp.intensity = lampIntensity * 1.5; // 室内点光源峰值 1.5
  // 壁灯跟随
  disposables.forEach((obj) => {
    if (obj.userData && obj.userData.isWallLamp) {
      obj.intensity = lampIntensity * 1.2;
    }
  });
};

/**
 * 昼夜交替：cycleTime 累加，归一化 t∈[0,1]，用余弦把 t 映射到光照强度
 * 关键帧概念：t=0 正午、t=0.25 黄昏、t=0.5 子夜、t=0.75 黎明、t=1 回到正午
 * @param {number} dt 帧间隔（秒）
 */
const updateDayNight = (dt) => {
  cycleTime = (cycleTime + dt) % DAY_PERIOD;
  const t = cycleTime / DAY_PERIOD; // 归一化时间 [0,1]
  // 余弦曲线：cos(2πt) 在 t=0 时为 1（正午），t=0.5 时为 -1（子夜）
  // 映射到 [0,1]：dayFactor = (cos(2πt) + 1) / 2，t=0 → 1（白天），t=0.5 → 0（夜晚）
  const dayFactor = (Math.cos(t * Math.PI * 2) + 1) / 2;

  // 颜色 lerp：白天暖白 → 夜晚冷蓝
  _tmpSunColor.copy(NIGHT_SUN_COLOR).lerp(DAY_SUN_COLOR, dayFactor);
  sunLight.color.copy(_tmpSunColor);
  // 阳光强度：白天 1.4 → 夜晚 0.25
  sunLight.intensity =
    NIGHT_SUN_INTENSITY + (DAY_SUN_INTENSITY - NIGHT_SUN_INTENSITY) * dayFactor;

  // 环境光强度：白天 0.55 → 夜晚 0.12
  ambientLight.intensity =
    NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * dayFactor;

  // 天空颜色 lerp：天空蓝 → 深夜蓝黑
  _tmpSkyColor.copy(NIGHT_SKY_COLOR).lerp(DAY_SKY_COLOR, dayFactor);
  scene.background.copy(_tmpSkyColor);

  // 阳光位置也随时间在天空划弧（更真实）
  const angle = t * Math.PI * 2;
  sunLight.position.set(
    Math.cos(angle) * 12, // X：东 → 西
    Math.sin(angle) * 12 + 2, // Y：日升 → 正午 → 日落 → 地下
    8 // Z：固定略偏南
  );

  // 更新 UI 阶段文案
  if (dayFactor > 0.75) ui.phase = "白天";
  else if (dayFactor > 0.4) ui.phase = "黄昏/黎明";
  else ui.phase = "夜晚";
};

// ============================================================================
//  18. [stage-12] 烟雾粒子动画（每帧更新位置）
// ============================================================================
/**
 * 每帧让所有烟粒子按速度上升，超出顶部就重置回烟囱口
 * @param {number} dt 帧间隔（秒）
 */
const updateSmoke = (dt) => {
  if (!smokePoints) return;
  const posAttr = smokePoints.geometry.attributes.position;
  const arr = posAttr.array;
  const TOP = 8.0; // 上升到 8 米就重置
  const chimneyTop = { x: 2, y: 5.3, z: -1.5 };
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] += smokeVelocities[i] * dt;
    arr[i + 1] += smokeVelocities[i + 1] * dt;
    arr[i + 2] += smokeVelocities[i + 2] * dt;
    // 上升超过 TOP 或漂得太远就重置
    if (arr[i + 1] > TOP) {
      arr[i] = chimneyTop.x + (Math.random() - 0.5) * 0.3;
      arr[i + 1] = chimneyTop.y + Math.random() * 0.3;
      arr[i + 2] = chimneyTop.z + (Math.random() - 0.5) * 0.3;
    }
  }
  posAttr.needsUpdate = true; // 通知 GPU 重新上传位置数据
};

// ============================================================================
//  19. [stage-13] InstancedMesh 落叶摆动动画
// ============================================================================
/**
 * 每帧给每片叶子加一点轻微摆动（模拟风吹），用 time + phase 让每片错峰
 * 注意：更新 InstancedMesh 必须重新 compose 矩阵并 setMatrixAt，
 * 最后设 instanceMatrix.needsUpdate = true。
 *
 * 性能提醒：200 片叶子每帧重新设置矩阵在桌面端毫无压力，但若数量到
 * 万级以上，频繁更新会有 CPU 开销。可以用 GPU 实例化着色器（在 vertex
 * shader 里用 attribute 算摆动）把这部分计算搬到 GPU，本教学先保留 CPU 方案。
 * @param {number} time 累计时间（秒）
 */
const updateLeaves = (time) => {
  if (!leavesMesh) return;
  const bases = leavesMesh.userData.basePositions;
  if (!bases) return;
  for (let i = 0; i < LEAVES_COUNT; i++) {
    const b = bases[i];
    // 用 sin 让叶子在原地小幅起伏 + 旋转
    const wobble = Math.sin(time * 1.5 + b.phase) * 0.05;
    _leafPos.set(b.x, b.y + wobble, b.z);
    _leafEuler.set(
      Math.PI / 2 + Math.sin(time + b.phase) * 0.2,
      time * 0.3 + b.phase,
      0
    );
    _leafQuat.setFromEuler(_leafEuler);
    _leafScale.set(1, 1, 1);
    _leafMatrix.compose(_leafPos, _leafQuat, _leafScale);
    leavesMesh.setMatrixAt(i, _leafMatrix);
  }
  leavesMesh.instanceMatrix.needsUpdate = true;
};

// ============================================================================
//  20. [stage-13] 读取 renderer.info 实时统计（DrawCall / 三角形数）
// ============================================================================
/**
 * renderer.info 记录了上一帧的渲染统计：
 *   render.calls = DrawCall 数（每多一个 Mesh/Points 就 +1）
 *   render.triangles = 渲染的三角形数
 *   memory.geometries / programs / textures = 资源计数
 * 把这些读到 UI 卡片上，方便用户对照 Stats 面板理解"瓶颈在哪"。
 */
const updateRenderInfo = () => {
  if (!renderer) return;
  ui.drawCalls = renderer.info.render.calls;
  ui.triangles = renderer.info.render.triangles;
};

// ============================================================================
//  21. 渲染循环（帧率无关动画总入口 + 按需渲染分支）
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  // [stage-13] Stats 面板每帧开始计量
  if (stats) stats.begin();

  const dt = clock.getDelta();
  const time = clock.elapsedTime;

  if (perfMode) {
    // ========================================================
    //  [stage-13] 静态按需渲染模式：
    //  关停所有动画（昼夜/粒子/落叶都不更新），仅在 needsRender=true
    //  时才真正调用 renderer.render。这样可以极大降低 GPU 占用——
    //  静止时几乎 0 耗电，仅在用户拖拽相机/按键时才重绘一帧。
    //  controls.change 事件会设 needsRender=true，保证拖拽时画面跟手。
    // ========================================================
    controls.update(); // 阻尼仍需每帧 update 才能平滑停止
    if (needsRender) {
      renderer.render(scene, camera);
      updateRenderInfo();
      needsRender = false;
    }
  } else {
    // ========================================================
    //  动画全开模式：每帧都更新所有动画 + 渲染
    // ========================================================
    controls.update();
    updateDoor(dt);
    updateLamp(dt);
    updateDayNight(dt);
    updateSmoke(dt);
    updateLeaves(time);
    renderer.render(scene, camera);
    updateRenderInfo();
  }

  // [stage-13] Stats 面板每帧结束计量
  if (stats) stats.end();
};

// ============================================================================
//  22. resize 处理
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  needsRender = true; // [stage-13] 尺寸变了，需要重绘一帧
};

// ============================================================================
//  23. [stage-13] OrbitControls 事件 → 触发按需渲染
// ============================================================================
/**
 * 在"静态按需渲染模式"下，只有 needsRender=true 才会真正绘制。
 * 所以必须监听 OrbitControls 的事件，用户一拖拽就标记"需要重绘"。
 * 即使不在 perfMode，这些事件也无副作用（animate 里 perfMode=false 时
 * 每帧都渲染，needsRender 标记被忽略）。
 */
const onControlsChange = () => {
  needsRender = true;
};

// ============================================================================
//  24. 资源释放（dispose）
// ============================================================================
const disposeScene = () => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", onKeyDown);
  if (controls) controls.removeEventListener("change", onControlsChange);

  // [stage-13] 移除 Stats 面板 DOM
  if (stats) {
    if (stats.dom && stats.dom.parentNode) {
      stats.dom.parentNode.removeChild(stats.dom);
    }
    stats = null;
  }

  // 释放 doorGroup 子级（门板 geometry / material）
  if (doorGroup) {
    doorGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    if (doorGroup.parent) doorGroup.parent.remove(doorGroup);
    doorGroup = null;
  }

  // 释放 disposables 中收集的 geometry / material / 纹理
  disposables.forEach((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
    if (obj.target && obj.target.parent) obj.target.parent.remove(obj.target);
    if (obj.parent) obj.parent.remove(obj);
  });
  disposables.length = 0;

  // 释放 InstancedMesh 的几何体/材质（已在 disposables 里，但确保 instanceMatrix 释放）
  leavesMesh = null;
  smokePoints = null;
  smokeVelocities = null;

  if (controls) controls.dispose();
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  scene = null;
  camera = null;
  renderer = null;
  controls = null;
  clock = null;
};

// ============================================================================
//  25. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器/时钟/Stats
  addLights(); // 2. [stage-06] 灯光 + 阴影
  addGround(); // 3. [stage-01] 草地
  addFoundation(); // 4. [stage-02] 地基 + 台阶
  addHouse(); // 5~9. [stage-03/04/05/09] 房子(墙+门+屋顶+烟囱+地板+玻璃+家具)
  addSkybox(); // 10. [stage-05] 天空盒
  addMergedStonePath(); // 11. [stage-13] 合并几何体（碎石小径）
  addInstancedLeaves(); // 12. [stage-13] InstancedMesh（落叶）
  addSmokeParticles(); // 13. [stage-12] 烟囱粒子
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", onKeyDown); // [stage-08 + stage-13] 键盘交互
  controls.addEventListener("change", onControlsChange); // [stage-13] 按需渲染触发
  animate(); // 启动渲染循环（含门/灯/昼夜/粒子/落叶动画 + 按需渲染分支）
});

onUnmounted(() => {
  disposeScene();
});
</script>

<template>
  <!-- 容器：相对定位，便于内部 UI 卡片绝对定位 -->
  <div style="position: relative; width: 100%; height: 100%">
    <!-- Three.js 渲染画布：铺满整个视口 -->
    <canvas
      ref="canvasRef"
      style="display: block; width: 100%; height: 100%"
    />

    <!-- 左上角：操作提示卡片（Element Plus 配色 + 阴影） -->
    <!-- 注意：Stats 面板 fixed 在左上角 (12,12)，所以提示卡片放在画布右上角避免遮挡 -->
    <div
      style="
        position: absolute;
        top: 20px;
        right: 20px;
        padding: 14px 18px;
        background: rgba(255, 255, 255, 0.94);
        border-radius: 8px;
        box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
        font-size: 14px;
        color: #303133;
        line-height: 1.8;
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC',
          'Microsoft YaHei', sans-serif;
        backdrop-filter: blur(6px);
        user-select: none;
        min-width: 200px;
      "
    >
      <div style="font-weight: 700; color: #409eff; margin-bottom: 6px">
        🚀 阶段 13 · 流畅运行
      </div>
      <div>
        <span
          style="
            display: inline-block;
            min-width: 22px;
            padding: 1px 6px;
            margin-right: 6px;
            background: #409eff;
            color: #fff;
            border-radius: 4px;
            text-align: center;
            font-weight: 600;
          "
          >O</span
        >开门 / 关门
      </div>
      <div>
        <span
          style="
            display: inline-block;
            min-width: 22px;
            padding: 1px 6px;
            margin-right: 6px;
            background: #67c23a;
            color: #fff;
            border-radius: 4px;
            text-align: center;
            font-weight: 600;
          "
          >L</span
        >开灯 / 关灯
      </div>
      <div>
        <span
          style="
            display: inline-block;
            min-width: 22px;
            padding: 1px 6px;
            margin-right: 6px;
            background: #e6a23c;
            color: #fff;
            border-radius: 4px;
            text-align: center;
            font-weight: 600;
          "
          >P</span
        >切换性能模式（{{ ui.perfMode }}）
      </div>
      <div>
        <span
          style="
            display: inline-block;
            min-width: 22px;
            padding: 1px 6px;
            margin-right: 6px;
            background: #909399;
            color: #fff;
            border-radius: 4px;
            text-align: center;
            font-weight: 600;
          "
          >S</span
        >切换 Stats 模式
      </div>
      <div style="color: #909399; font-size: 12px; margin-top: 4px">
        左上角 Stats 面板实时显示 FPS/MS/MB
      </div>
    </div>

    <!-- 右下角：实时状态 + 性能数据卡片 -->
    <div
      style="
        position: absolute;
        bottom: 20px;
        right: 20px;
        padding: 14px 18px;
        background: rgba(255, 255, 255, 0.94);
        border-radius: 8px;
        box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
        font-size: 13px;
        color: #303133;
        line-height: 1.8;
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC',
          'Microsoft YaHei', sans-serif;
        backdrop-filter: blur(6px);
        user-select: none;
        min-width: 220px;
      "
    >
      <div style="font-weight: 700; color: #67c23a; margin-bottom: 6px">
        📊 实时状态
      </div>
      <div>
        门：<span
          :style="{
            color: ui.doorState === '开启' ? '#67c23a' : '#909399',
            fontWeight: 600,
          }"
          >{{ ui.doorState }}</span
        >
        ｜ 灯：<span
          :style="{
            color: ui.lampState === '开启' ? '#e6a23c' : '#909399',
            fontWeight: 600,
          }"
          >{{ ui.lampState }}</span
        >
      </div>
      <div>昼夜阶段：<span style="color: #409eff; font-weight: 600">{{ ui.phase }}</span></div>
      <div style="border-top: 1px solid #ebeef5; margin: 6px 0; padding-top: 6px">
        <div style="color: #f56c6c; font-weight: 600">性能监测</div>
        <div>渲染模式：<span style="color: #409eff">{{ ui.perfMode }}</span></div>
        <div>DrawCall：<span style="color: #303133; font-weight: 600">{{ ui.drawCalls }}</span> 次</div>
        <div>三角形：<span style="color: #303133; font-weight: 600">{{ ui.triangles.toLocaleString() }}</span> 个</div>
      </div>
    </div>

    <!-- 左下角：性能优化说明卡片 -->
    <div
      style="
        position: absolute;
        bottom: 20px;
        left: 20px;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.94);
        border-radius: 8px;
        box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
        font-size: 12px;
        color: #606266;
        line-height: 1.7;
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC',
          'Microsoft YaHei', sans-serif;
        backdrop-filter: blur(6px);
        user-select: none;
        max-width: 260px;
      "
    >
      <div style="font-weight: 700; color: #a0522d; margin-bottom: 4px">
        ⚙️ 已启用优化
      </div>
      <div>· Stats 性能面板（FPS/MS/MB）</div>
      <div>· LOD 多精度家具（按距离切换）</div>
      <div>· InstancedMesh 落叶×{{ LEAVES_COUNT }}（1 DrawCall）</div>
      <div>· mergeGeometries 碎石小径（30→1）</div>
      <div>· 按需渲染（P 键切换静态模式）</div>
      <div>· frustum culling（Three.js 默认）</div>
    </div>
  </div>
</template>
