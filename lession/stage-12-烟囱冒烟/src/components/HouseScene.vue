<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 12：烟囱冒烟
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-12）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 砖墙/木门/草地贴图（程序化 CanvasTexture）+ 天空盒(简化为纯色背景)
 *    [stage-06] 阳光/环境光/室内点光源/壁灯聚光灯 + 阴影
 *    [stage-07] 相机漫游（本快照简化为 OrbitControls）
 *    [stage-08] 开关门动画(O) + 开关灯(L) + 昼夜自动循环
 *    [stage-09] 家具（用基础几何体代替 GLTF：桌椅 + 床 + 地毯，自包含可教学）
 *    [stage-10] 玻璃着色器（自定义 ShaderMaterial 实现菲涅尔透射玻璃）
 *    [stage-11] Bloom 泛光后期（EffectComposer + RenderPass + UnrealBloomPass + OutputPass）
 *    [stage-12] 烟囱烟雾粒子(200) + 落叶粒子(100)  ← 本阶段新增教学重点
 *
 *  本阶段新增教学（粒子系统全知识）：
 *    1) THREE.Points + BufferGeometry + PointsMaterial 三件套
 *    2) 程序化 CanvasTexture 生成圆形烟雾贴图与叶子贴图（无外部图片）
 *    3) Float32Array 位置属性 + 平行数组管理每粒子状态(速度/年龄/寿命)
 *    4) 烟雾：上升 + 水平扩散 + 亮度衰减 + 寿命循环重生
 *    5) 落叶：下落 + sin 飘摆 + 触地重生，季节氛围
 *    6) 完整 dispose（粒子 geometry / material / texture / composer 全释放）
 * ============================================================================
 */
import { ref, reactive, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// [stage-11] 后期处理相关引入
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// ----------------------------- Vue 引用 / 响应式 UI -----------------------------
const canvasRef = ref(null);

// UI 文案状态（驱动 template 中的提示卡片）
const ui = reactive({
  doorState: "关闭", // 显示当前门状态：关闭 / 开启
  lampState: "关闭", // 显示当前室内灯状态
  phase: "白天", // 显示当前昼夜阶段：白天 / 黄昏 / 夜晚 / 黎明
  smoke: "冒烟中", // 烟囱粒子状态
  leaves: "飘落中", // 落叶粒子状态
});

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let clock = null; // 帧率无关动画的核心时钟
let animationId = null;
let composer = null; // [stage-11] 后期合成器

// 收集所有需要 dispose 的 geometry / material，便于统一释放
const disposables = [];
const track = (obj) => {
  disposables.push(obj);
  return obj;
};

// ----------------------------- 动画状态变量（stage-08 门/灯/昼夜） -----------------------------
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

// ----------------------------- [stage-12] 粒子系统状态变量 -----------------------------
// 烟雾粒子：200 个，从烟囱顶 (2, 5.3, -1.5) 附近升起
const SMOKE_COUNT = 200;
const SMOKE_ORIGIN = new THREE.Vector3(2, 5.3, -1.5); // 烟囱顶中心
const SMOKE_MAX_Y = 8.5; // 烟雾升到该高度后重生
let smokePoints = null; // THREE.Points 对象
let smokePositions = null; // Float32Array 位置数组（写入 geometry 的 position 属性）
let smokeColors = null; // Float32Array 颜色数组（用于亮度衰减）
let smokeTexture = null; // 程序化圆形烟雾贴图
// 每粒子状态（平行数组，不进 GPU，仅 CPU 维护）
let smokeVel = null; // 速度 Float32Array(SMOKE_COUNT * 3)
let smokeAge = null; // 年龄 Float32Array(SMOKE_COUNT)
let smokeLife = null; // 寿命 Float32Array(SMOKE_COUNT)

// 落叶粒子：100 个，从天空随机下落 + sin 飘摆，秋叶橙红 #e6a23c
const LEAF_COUNT = 100;
const LEAF_COLOR = 0xe6a23c; // Element Plus 警告色（秋叶橙红）
let leafPoints = null; // THREE.Points 对象
let leafPositions = null; // Float32Array 位置数组
let leafTexture = null; // 程序化叶子贴图
// 每粒子状态
let leafVy = null; // 下落速度
let leafSwayAmp = null; // 飘摆振幅
let leafSwayFreq = null; // 飘摆频率
let leafPhase = null; // 飘摆相位（让每片叶子不同步）
let leafBaseX = null; // 基准 X（飘摆围绕该值）
let leafBaseZ = null; // 基准 Z
let leafFallTime = null; // 已下落时间

// ============================================================================
//  1. 场景 / 相机 / 渲染器 / 控制器 / 后期合成器
// ============================================================================
const initScene = () => {
  scene = new THREE.Scene();
  // 初始背景设为天空蓝（昼/夜循环里会持续覆盖这个颜色）
  scene.background = new THREE.Color(0x87ceeb);
  // 一点雾，让远处落叶/烟雾自然融入（增强氛围）
  scene.fog = new THREE.Fog(0x87ceeb, 25, 70);

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
  // [stage-11] 色调映射：让 Bloom 效果在视觉上更自然
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // [stage-07 简化版] OrbitControls：拖拽旋转、滚轮缩放
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 启用阻尼，旋转更顺滑
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.5, 0); // 视线中心略抬到房子中部
  controls.minDistance = 4;
  controls.maxDistance = 40;
  controls.update();

  // [stage-08] 创建全局时钟（用于帧率无关动画）
  clock = new THREE.Clock();

  // [stage-11] 后期合成器：RenderPass → UnrealBloomPass → OutputPass
  // 后期管线：先渲染场景，再让亮像素(室内灯/壁灯)泛光，最后输出到屏幕
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35, // strength：泛光强度（较低，避免白天过曝）
    0.6, // radius：泛光半径
    0.7 // threshold：亮度阈值，只有高于该值的像素才会泛光
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass()); // 处理色调映射与色彩空间输出
};

// ============================================================================
//  2. [stage-05] 程序化贴图（砖墙 / 木纹 / 草地）
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
  ctx.fillStyle = "#e6d5b8";
  ctx.fillRect(0, 0, 256, 256);
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
//  3. [stage-12] 程序化粒子贴图（圆形烟雾 + 叶子）
// ============================================================================
/**
 * 生成圆形烟雾贴图：径向渐变从中心半透明白到边缘全透明
 * 关键：边缘必须透明，否则粒子会显示成"方块"而不是"圆点"
 * @returns {THREE.CanvasTexture}
 */
const makeSmokeTexture = () => {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  // 径向渐变：中心 rgba(255,255,255,1) → 边缘 rgba(255,255,255,0)
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
};

/**
 * 生成叶子贴图：在透明背景上画一片简化的椭圆叶子 + 中脉
 * @returns {THREE.CanvasTexture}
 */
const makeLeafTexture = () => {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  // 叶身：椭圆，填充橙红（实际显示色由 material.color 叠加，这里画白色便于调色）
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4); // 斜放更像落叶
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // 中脉：深色细线
  ctx.strokeStyle = "rgba(120,60,20,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(22, 0);
  ctx.stroke();
  // 叶柄
  ctx.strokeStyle = "rgba(90,45,15,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(28, 0);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
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
//  7. [stage-03 + stage-08 + stage-10] 四面墙(含门洞/窗洞) + 木门 + 着色器玻璃
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

  // ============================================================
  //  [stage-10] 玻璃着色器：自定义 ShaderMaterial 实现菲涅尔透射
  // ------------------------------------------------------------
  //  原理：视线越接近掠射角（与法线夹角越大），玻璃边缘越亮（菲涅尔效应）。
  //  这里用 1 - dot(normal, viewDir) 的幂次模拟菲涅尔强度，
  //  再把基础玻璃色与高光色按该强度混合，得到通透带反光的玻璃质感。
  //  这是 stage-10「着色器」阶段的代表实现，本快照保留以维持累积完整性。
  // ============================================================
  const makeGlassMaterial = () => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new THREE.Color(0xa8d0ff) }, // 浅蓝玻璃
        uRimColor: { value: new THREE.Color(0xffffff) }, // 边缘高光
        uOpacity: { value: 0.45 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBaseColor;
        uniform vec3 uRimColor;
        uniform float uOpacity;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          // 菲涅尔：视线与法线越垂直（掠射），强度越大
          float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
          vec3 finalColor = mix(uBaseColor, uRimColor, fresnel);
          // 透明度也随菲涅尔增强：边缘更不透明，正面更通透
          float alpha = uOpacity + fresnel * 0.4;
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  };
  const glassMat = makeGlassMaterial();
  track(glassMat); // 材质也要 dispose（ShaderMaterial 没有 map，但 dispose 仍需调用）

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
  // ============================================================
  doorGroup = new THREE.Group();
  doorGroup.position.set(-0.5, 1.3, 3.125);
  doorGroup.rotation.y = 0;

  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.05),
    doorMat
  );
  doorPanel.position.set(0.5, 0, 0); // 关键：偏移到门轴右侧
  doorPanel.castShadow = true;
  doorPanel.receiveShadow = true;
  doorGroup.add(doorPanel);
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

  // 后山墙共享 gableGeo，复用 geometry
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
//  10. [stage-09] 家具（用基础几何体代替 GLTF，自包含可教学）
// ============================================================================
const addFurniture = (houseGroup) => {
  // 木质材质（桌椅）与布艺材质（床/地毯）
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.6,
    metalness: 0.0,
  });
  const fabricMat = new THREE.MeshStandardMaterial({
    color: 0xc9a0dc,
    roughness: 0.9,
    metalness: 0.0,
  });
  const sheetMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5dc,
    roughness: 0.9,
    metalness: 0.0,
  });
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0xf56c6c,
    roughness: 0.95,
    metalness: 0.0,
  });

  // 辅助：创建一个家具部件
  const part = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    houseGroup.add(track(m));
    return m;
  };

  // ---- 餐桌：桌面 + 4 条腿，位于室内左前 (−2, *, 1.5) ----
  part(new THREE.BoxGeometry(1.6, 0.08, 0.9), woodMat, -2, 1.05, 1.5); // 桌面
  const legH = 1.0;
  part(new THREE.BoxGeometry(0.08, legH, 0.08), woodMat, -2.7, 0.55, 1.9);
  part(new THREE.BoxGeometry(0.08, legH, 0.08), woodMat, -1.3, 0.55, 1.9);
  part(new THREE.BoxGeometry(0.08, legH, 0.08), woodMat, -2.7, 0.55, 1.1);
  part(new THREE.BoxGeometry(0.08, legH, 0.08), woodMat, -1.3, 0.55, 1.1);

  // ---- 两把椅子：坐垫 + 靠背 + 4 腿，围着桌子 ----
  const makeChair = (cx, cz, faceZ) => {
    part(new THREE.BoxGeometry(0.4, 0.05, 0.4), woodMat, cx, 0.5, cz); // 坐垫
    part(new THREE.BoxGeometry(0.4, 0.5, 0.05), woodMat, cx, 0.75, cz + faceZ * 0.22); // 靠背
    part(new THREE.BoxGeometry(0.05, 0.5, 0.05), woodMat, cx - 0.17, 0.25, cz - 0.17);
    part(new THREE.BoxGeometry(0.05, 0.5, 0.05), woodMat, cx + 0.17, 0.25, cz - 0.17);
    part(new THREE.BoxGeometry(0.05, 0.5, 0.05), woodMat, cx - 0.17, 0.25, cz + 0.17);
    part(new THREE.BoxGeometry(0.05, 0.5, 0.05), woodMat, cx + 0.17, 0.25, cz + 0.17);
  };
  makeChair(-2, 2.4, -1); // 桌前椅（靠背朝 +Z，即面朝桌子）
  makeChair(-2, 0.6, 1); // 桌后椅

  // ---- 床：床架 + 床垫 + 枕头，位于室内右后 (2.5, *, -1.5) ----
  part(new THREE.BoxGeometry(2.0, 0.2, 1.4), woodMat, 2.5, 0.45, -1.5); // 床架
  part(new THREE.BoxGeometry(1.9, 0.25, 1.3), sheetMat, 2.5, 0.65, -1.5); // 床垫
  part(new THREE.BoxGeometry(0.6, 0.12, 1.2), fabricMat, 3.55, 0.78, -1.5); // 枕头（靠后墙侧）
  part(new THREE.BoxGeometry(2.0, 0.5, 0.08), woodMat, 2.5, 0.85, -2.13); // 床头板

  // ---- 地毯：扁平方块，位于室内中央 ----
  part(new THREE.BoxGeometry(2.4, 0.02, 2.0), rugMat, 0, 0.36, 0);
};

// ============================================================================
//  11. 组装整个房子
// ============================================================================
const addHouse = () => {
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";
  addWallsAndDoor(houseGroup); // [stage-03/08/10] 墙 + 门 + 着色器玻璃
  addRoof(houseGroup); // [stage-04] 屋顶 + 山墙
  addChimneyAndFloor(houseGroup); // [stage-04] 烟囱 + 室内地板
  addFurniture(houseGroup); // [stage-09] 家具
  scene.add(houseGroup);
  return houseGroup;
};

// ============================================================================
//  12. [stage-12] 烟囱烟雾粒子（200 个）
// ============================================================================
const addSmokeParticles = () => {
  // 1) 位置数组 + 颜色数组（Float32Array，写入 geometry 属性）
  smokePositions = new Float32Array(SMOKE_COUNT * 3);
  smokeColors = new Float32Array(SMOKE_COUNT * 3);
  // 平行状态数组（CPU 维护，不上 GPU）
  smokeVel = new Float32Array(SMOKE_COUNT * 3);
  smokeAge = new Float32Array(SMOKE_COUNT);
  smokeLife = new Float32Array(SMOKE_COUNT);

  // 2) 程序化圆形烟雾贴图
  smokeTexture = makeSmokeTexture();

  // 3) 初始化每个粒子：在烟囱顶附近随机散布，给一个初始上升速度
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const i3 = i * 3;
    // 起点：烟囱顶 (2, 5.3, -1.5) 附近 ±0.15 的方块内随机
    smokePositions[i3] = SMOKE_ORIGIN.x + (Math.random() - 0.5) * 0.3;
    smokePositions[i3 + 1] = SMOKE_ORIGIN.y + Math.random() * 0.2;
    smokePositions[i3 + 2] = SMOKE_ORIGIN.z + (Math.random() - 0.5) * 0.3;
    // 初始速度：主上升 + 微小水平随机
    smokeVel[i3] = (Math.random() - 0.5) * 0.1;
    smokeVel[i3 + 1] = 0.4 + Math.random() * 0.4; // 上升 0.4~0.8 m/s
    smokeVel[i3 + 2] = (Math.random() - 0.5) * 0.1;
    // 寿命 3~6 秒，年龄随机初始（让粒子不同步）
    smokeLife[i] = 3 + Math.random() * 3;
    smokeAge[i] = Math.random() * smokeLife[i];
    // 颜色：初始白色（与 material.color 0xd3d3d3 相乘得灰白烟）
    smokeColors[i3] = 1;
    smokeColors[i3 + 1] = 1;
    smokeColors[i3 + 2] = 1;
  }

  // 4) 构造 BufferGeometry，写入 position 与 color 属性
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(smokePositions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(smokeColors, 3));

  // 5) PointsMaterial：开启 vertexColors 让每粒子可独立调亮度（实现衰减）
  //    depthWrite:false 避免粒子之间互相遮挡写入深度缓冲造成"切割"伪影
  //    transparent:true + 贴图边缘透明 = 圆润烟雾
  const mat = new THREE.PointsMaterial({
    size: 0.3, // 粒子尺寸（米）
    map: smokeTexture, // 圆形渐变贴图
    transparent: true,
    opacity: 0.6, // 整体不透明度
    depthWrite: false, // 不写深度，避免粒子相互切割
    color: 0xd3d3d3, // 灰白烟色（与 vertex color 相乘）
    vertexColors: true, // 启用每粒子颜色（用于亮度衰减）
    sizeAttenuation: true, // 透视近大远小
    blending: THREE.NormalBlending, // 普通混合（烟雾不要加法发光）
  });

  smokePoints = new THREE.Points(geo, mat);
  smokePoints.frustumCulled = false; // 粒子可能升到包围盒外，禁用剔除避免消失
  scene.add(smokePoints);

  // 收集 geometry/material/texture 便于 dispose
  track(geo);
  track(mat);
  // texture 单独存引用（material.mapdispose 时 track 处理不到，因为 material 也在 track）
  // 这里通过 track(mat) + disposeScene 中处理 mat.map 来释放
};

// ============================================================================
//  13. [stage-12] 落叶粒子（100 个）
// ============================================================================
const addLeafParticles = () => {
  // 1) 位置数组 + 平行状态数组
  leafPositions = new Float32Array(LEAF_COUNT * 3);
  leafVy = new Float32Array(LEAF_COUNT);
  leafSwayAmp = new Float32Array(LEAF_COUNT);
  leafSwayFreq = new Float32Array(LEAF_COUNT);
  leafPhase = new Float32Array(LEAF_COUNT);
  leafBaseX = new Float32Array(LEAF_COUNT);
  leafBaseZ = new Float32Array(LEAF_COUNT);
  leafFallTime = new Float32Array(LEAF_COUNT);

  // 2) 程序化叶子贴图
  leafTexture = makeLeafTexture();

  // 3) 初始化每个叶子：在房子上方一片区域随机出现
  for (let i = 0; i < LEAF_COUNT; i++) {
    const i3 = i * 3;
    // 水平基准位置：房子周围 ±12 范围
    leafBaseX[i] = (Math.random() - 0.5) * 24;
    leafBaseZ[i] = (Math.random() - 0.5) * 24;
    // 初始高度：5~15 米高空
    leafPositions[i3] = leafBaseX[i];
    leafPositions[i3 + 1] = 5 + Math.random() * 10;
    leafPositions[i3 + 2] = leafBaseZ[i];
    // 下落速度：0.4~0.9 m/s
    leafVy[i] = 0.4 + Math.random() * 0.5;
    // 飘摆参数：振幅 0.5~1.5 米，频率 0.5~1.5 rad/s，相位 0~2π
    leafSwayAmp[i] = 0.5 + Math.random() * 1.0;
    leafSwayFreq[i] = 0.5 + Math.random() * 1.0;
    leafPhase[i] = Math.random() * Math.PI * 2;
    leafFallTime[i] = Math.random() * 5;
  }

  // 4) 构造 BufferGeometry
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(leafPositions, 3));

  // 5) PointsMaterial：秋叶橙红 #e6a23c，加法略发光让落叶更醒目
  const mat = new THREE.PointsMaterial({
    size: 0.25, // 叶子尺寸
    map: leafTexture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    color: LEAF_COLOR, // 秋叶橙红
    sizeAttenuation: true,
    blending: THREE.NormalBlending,
  });

  leafPoints = new THREE.Points(geo, mat);
  leafPoints.frustumCulled = false;
  scene.add(leafPoints);

  track(geo);
  track(mat);
};

// ============================================================================
//  14. [stage-12] 烟雾粒子更新：上升 + 扩散 + 衰减 + 循环重生
// ============================================================================
/**
 * 每帧更新烟雾粒子
 * 算法：
 *   - 位置 += 速度 * dt（上升为主）
 *   - 速度：水平分量随时间增大（烟雾扩散），上升分量略减（逐渐减速）
 *   - 亮度（vertex color）：随年龄/寿命线性衰减，从白→暗灰，模拟烟雾变淡
 *   - 当年龄 > 寿命 或 y > 最大高度：重生（重置到烟囱顶附近，新随机参数）
 * @param {number} dt 帧间隔（秒）
 */
const updateSmoke = (dt) => {
  if (!smokePoints) return;
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const i3 = i * 3;
    // 年龄累加
    smokeAge[i] += dt;
    const t = smokeAge[i] / smokeLife[i]; // 归一化进度 [0,1]

    // 位置更新：上升 + 水平扩散
    smokePositions[i3] += smokeVel[i3] * dt;
    smokePositions[i3 + 1] += smokeVel[i3 + 1] * dt;
    smokePositions[i3 + 2] += smokeVel[i3 + 2] * dt;

    // 速度演化：水平扩散随时间增强（烟雾越升越散）
    // 给水平速度持续加微小随机扰动，模拟空气湍流
    smokeVel[i3] += (Math.random() - 0.5) * 0.15 * dt;
    smokeVel[i3 + 2] += (Math.random() - 0.5) * 0.15 * dt;
    // 上升速度逐渐衰减（烟雾到高处减速）
    smokeVel[i3 + 1] *= 1 - 0.15 * dt;

    // 亮度衰减：1 → 0.2，随 t 线性下降（与 material.color 0xd3d3d3 相乘）
    const brightness = 1 - t * 0.8;
    smokeColors[i3] = brightness;
    smokeColors[i3 + 1] = brightness;
    smokeColors[i3 + 2] = brightness;

    // 重生条件：超寿命 或 升过最大高度
    if (smokeAge[i] >= smokeLife[i] || smokePositions[i3 + 1] > SMOKE_MAX_Y) {
      // 重置到烟囱顶附近
      smokePositions[i3] = SMOKE_ORIGIN.x + (Math.random() - 0.5) * 0.3;
      smokePositions[i3 + 1] = SMOKE_ORIGIN.y + Math.random() * 0.2;
      smokePositions[i3 + 2] = SMOKE_ORIGIN.z + (Math.random() - 0.5) * 0.3;
      smokeVel[i3] = (Math.random() - 0.5) * 0.1;
      smokeVel[i3 + 1] = 0.4 + Math.random() * 0.4;
      smokeVel[i3 + 2] = (Math.random() - 0.5) * 0.1;
      smokeLife[i] = 3 + Math.random() * 3;
      smokeAge[i] = 0;
      smokeColors[i3] = 1;
      smokeColors[i3 + 1] = 1;
      smokeColors[i3 + 2] = 1;
    }
  }
  // 标记 position 与 color 属性需要重新上传 GPU
  smokePoints.geometry.attributes.position.needsUpdate = true;
  smokePoints.geometry.attributes.color.needsUpdate = true;
};

// ============================================================================
//  15. [stage-12] 落叶粒子更新：下落 + sin 飘摆 + 触地重生
// ============================================================================
/**
 * 每帧更新落叶粒子
 * 算法：
 *   - Y -= 下落速度 * dt（重力下落）
 *   - X = baseX + sin(time * freq + phase) * amp（左右飘摆）
 *   - Z = baseZ + cos(time * freq + phase) * amp * 0.5（前后飘摆，相位差让运动更自然）
 *   - 当 Y < 0（落地）：重置到高空，新的水平基准位置
 * @param {number} dt 帧间隔（秒）
 */
const updateLeaves = (dt, elapsed) => {
  if (!leafPoints) return;
  for (let i = 0; i < LEAF_COUNT; i++) {
    const i3 = i * 3;
    // 下落
    leafPositions[i3 + 1] -= leafVy[i] * dt;
    // 飘摆：围绕基准位置做正弦运动
    leafPositions[i3] =
      leafBaseX[i] + Math.sin(elapsed * leafSwayFreq[i] + leafPhase[i]) * leafSwayAmp[i];
    leafPositions[i3 + 2] =
      leafBaseZ[i] +
      Math.cos(elapsed * leafSwayFreq[i] + leafPhase[i]) * leafSwayAmp[i] * 0.5;
    // 累计下落时间（用于未来扩展，如旋转）
    leafFallTime[i] += dt;

    // 触地重生：换一个新的水平基准位置 + 高空起点
    if (leafPositions[i3 + 1] < 0.1) {
      leafBaseX[i] = (Math.random() - 0.5) * 24;
      leafBaseZ[i] = (Math.random() - 0.5) * 24;
      leafPositions[i3] = leafBaseX[i];
      leafPositions[i3 + 1] = 12 + Math.random() * 5;
      leafPositions[i3 + 2] = leafBaseZ[i];
      leafVy[i] = 0.4 + Math.random() * 0.5;
      leafSwayAmp[i] = 0.5 + Math.random() * 1.0;
      leafSwayFreq[i] = 0.5 + Math.random() * 1.0;
      leafPhase[i] = Math.random() * Math.PI * 2;
      leafFallTime[i] = 0;
    }
  }
  leafPoints.geometry.attributes.position.needsUpdate = true;
};

// ============================================================================
//  16. [stage-08] 键盘交互：O 开关门 / L 开关灯
// ============================================================================
const onKeyDown = (e) => {
  const key = e.key.toLowerCase();
  if (key === "o") {
    doorState = doorState === 0 ? 1 : 0;
    ui.doorState = doorState === 1 ? "开启" : "关闭";
  } else if (key === "l") {
    lampOn = !lampOn;
    ui.lampState = lampOn ? "开启" : "关闭";
  }
};

// ============================================================================
//  17. [stage-08] 帧率无关动画：门 / 灯 / 昼夜
// ============================================================================
const updateDoor = (dt) => {
  if (!doorGroup) return;
  const targetAngle = doorState * (Math.PI / 2); // 0 或 90°
  const speed = 8;
  doorAngle += (targetAngle - doorAngle) * Math.min(1, speed * dt);
  doorGroup.rotation.y = doorAngle;
};

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

const updateDayNight = (dt) => {
  cycleTime = (cycleTime + dt) % DAY_PERIOD;
  const t = cycleTime / DAY_PERIOD; // 归一化时间 [0,1]
  const dayFactor = (Math.cos(t * Math.PI * 2) + 1) / 2;

  _tmpSunColor.copy(NIGHT_SUN_COLOR).lerp(DAY_SUN_COLOR, dayFactor);
  sunLight.color.copy(_tmpSunColor);
  sunLight.intensity =
    NIGHT_SUN_INTENSITY + (DAY_SUN_INTENSITY - NIGHT_SUN_INTENSITY) * dayFactor;

  ambientLight.intensity =
    NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * dayFactor;

  _tmpSkyColor.copy(NIGHT_SKY_COLOR).lerp(DAY_SKY_COLOR, dayFactor);
  scene.background.copy(_tmpSkyColor);
  // 雾色跟随天空，避免远处色差
  if (scene.fog) scene.fog.color.copy(_tmpSkyColor);

  // 阳光位置随时间在天空划弧
  const angle = t * Math.PI * 2;
  sunLight.position.set(
    Math.cos(angle) * 12,
    Math.sin(angle) * 12 + 2,
    8
  );

  if (dayFactor > 0.75) ui.phase = "白天";
  else if (dayFactor > 0.4) ui.phase = "黄昏/黎明";
  else ui.phase = "夜晚";
};

// ============================================================================
//  18. 渲染循环（帧率无关动画总入口）
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime; // 累计时间，用于落叶飘摆相位

  controls.update();
  updateDoor(dt); // [stage-08] 门动画
  updateLamp(dt); // [stage-08] 灯动画
  updateDayNight(dt); // [stage-08] 昼夜循环
  updateSmoke(dt); // [stage-12] 烟雾粒子
  updateLeaves(dt, elapsed); // [stage-12] 落叶粒子

  // [stage-11] 用 composer 代替 renderer.render 输出（含 Bloom 后期）
  composer.render();
};

// ============================================================================
//  19. resize 处理
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // [stage-11] 后期合成器也要同步尺寸
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
};

// ============================================================================
//  20. 资源释放（dispose）—— 含粒子 geometry/material/texture/composer
// ============================================================================
const disposeScene = () => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", onKeyDown);

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

  // 释放 [stage-12] 粒子的 texture（map 不在 disposables 里，单独释放）
  if (smokeTexture) {
    smokeTexture.dispose();
    smokeTexture = null;
  }
  if (leafTexture) {
    leafTexture.dispose();
    leafTexture = null;
  }
  // 粒子 Points 对象从场景移除
  if (smokePoints) {
    if (smokePoints.parent) smokePoints.parent.remove(smokePoints);
    smokePoints = null;
  }
  if (leafPoints) {
    if (leafPoints.parent) leafPoints.parent.remove(leafPoints);
    leafPoints = null;
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

  // 释放 [stage-11] 后期合成器
  if (composer) {
    composer.dispose();
    composer = null;
  }
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
//  21. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器/时钟/后期合成器
  addLights(); // 2. [stage-06] 灯光 + 阴影
  addGround(); // 3. [stage-01] 草地
  addFoundation(); // 4. [stage-02] 地基 + 台阶
  addHouse(); // 5~10. [stage-03/04/05/08/09/10] 房子(墙+门+屋顶+烟囱+地板+玻璃着色器+家具)
  addSmokeParticles(); // 6. [stage-12] 烟囱烟雾粒子
  addLeafParticles(); // 7. [stage-12] 落叶粒子
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", onKeyDown); // [stage-08] 键盘交互
  animate(); // 启动渲染循环（含门/灯/昼夜/粒子动画）
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
    <div
      style="
        position: absolute;
        top: 20px;
        left: 20px;
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
      "
    >
      <div style="font-weight: 700; color: #409eff; margin-bottom: 6px">
        🏠 阶段 12 · 烟囱冒烟
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
      <div style="color: #909399; font-size: 12px; margin-top: 2px">
        鼠标拖拽旋转 · 滚轮缩放
      </div>
    </div>

    <!-- 右上角：实时状态卡片 -->
    <div
      style="
        position: absolute;
        top: 20px;
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
        min-width: 140px;
      "
    >
      <div style="font-weight: 700; color: #e6a23c; margin-bottom: 6px">
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
      </div>
      <div>
        室内灯：<span
          :style="{
            color: ui.lampState === '开启' ? '#e6a23c' : '#909399',
            fontWeight: 600,
          }"
          >{{ ui.lampState }}</span
        >
      </div>
      <div>
        时段：<span
          :style="{
            color:
              ui.phase === '白天'
                ? '#409eff'
                : ui.phase === '夜晚'
                ? '#6f8fff'
                : '#e6a23c',
            fontWeight: 600,
          }"
          >{{ ui.phase }}</span
        >
      </div>
      <div>
        烟雾：<span style="color: #909399; font-weight: 600">{{ ui.smoke }}</span>
      </div>
      <div>
        落叶：<span style="color: #e6a23c; font-weight: 600">{{ ui.leaves }}</span>
      </div>
    </div>

    <!-- 底部居中：粒子系统说明 -->
    <div
      style="
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 16px;
        background: rgba(48, 49, 51, 0.85);
        color: #f0f2f5;
        border-radius: 20px;
        box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
        font-size: 12px;
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC',
          'Microsoft YaHei', sans-serif;
        backdrop-filter: blur(4px);
        white-space: nowrap;
        user-select: none;
      "
    >
      💨 THREE.Points · 200 烟雾粒子上升扩散 + 100 落叶粒子飘摆下落 · Bloom 后期
    </div>
  </div>
</template>
