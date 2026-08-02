<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 09：家具进场
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-09）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 砖墙/木门/玻璃贴图（程序化 CanvasTexture）
 *    [stage-06] 阳光/环境光/室内点光源/壁灯聚光灯 + 阴影
 *    [stage-07] 相机漫游（本快照简化为 OrbitControls，保留 target 与阻尼）
 *    [stage-08] 开关门动画（O 键）+ 开关灯（L 键）+ 昼夜自动循环
 *    [stage-09] 家具进场：程序化搭建餐桌/椅子×2/床/沙发 + GLTFLoader 生产用法演示
 *
 *  本阶段新增教学（模型加载）：
 *    1) 用基础几何体程序化搭建家具（离线可运行，无外部模型文件依赖）
 *       - 餐桌：桌面 Box + 4 CylinderGeometry 腿，Group 组织
 *       - 椅子：座板 + 靠背 + 4 腿，封装为 makeChair() 复用两次
 *       - 床：床框 + 床垫 + 枕头×2
 *       - 沙发：底座 + 靠背 + 2 扶手 + 坐垫×2
 *    2) GLTFLoader 生产用法演示（注释 + 可选在线尝试）：
 *       - loader.load(url, onLoad, onProgress, onError) 四回调
 *       - onLoad 拿到 gltf.scene（一个 Group），traverse 处理材质/阴影
 *       - scale/position 适配模型到室内
 *       - onError 静默回退（程序化家具已先行布置，保证离线可见）
 *    3) 家具 Group 统一挂到 houseGroup 下，随房子一起 dispose
 *
 *  家具坐标系说明：
 *    室内地板顶面在 y=0.35（地板 mesh 中心 0.325 + 厚度 0.05/2）。
 *    所有家具 Group 的原点放在地板顶面 (y=0.35)，零件用局部坐标从 y=0
 *    （即地板顶面）向上搭建，这样"腿/底座底部"自然落在 y=0.35。
 * ============================================================================
 */
import { ref, reactive, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// [stage-09] GLTFLoader：生产环境用于加载外部 .glb/.gltf 模型
// 这里 import 仅用于演示 API；本快照的家具是程序化搭建，离线可运行
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ----------------------------- Vue 引用 / 响应式 UI -----------------------------
const canvasRef = ref(null);

// UI 文案状态（驱动 template 中的提示卡片）
const ui = reactive({
  doorState: "关闭", // 显示当前门状态：关闭 / 开启
  lampState: "关闭", // 显示当前室内灯状态
  phase: "白天", // 显示当前昼夜阶段：白天 / 黄昏 / 夜晚 / 黎明
  furniture: "程序化家具已就位", // [stage-09] 家具加载状态
});

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let clock = null; // 帧率无关动画的核心时钟
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

// [stage-09] 家具容器 Group（统一 dispose 用）
let furnitureGroup = null;

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
};

// ============================================================================
//  2. [stage-05] 程序化贴图（Canvas 生成砖墙 / 木纹 / 玻璃 / 草地纹理）
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
//  3. [stage-06] 灯光（阳光 + 环境光 + 室内点光源 + 壁灯聚光灯 + 阴影）
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
  // 这里直接 add 到场景，每帧在 animate 中根据 lampIntensity 调整强度
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
//  4. [stage-01] 草地（带程序化草地贴图）
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
//  5. [stage-02] 地基平台 + 入口台阶
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
//  6. [stage-03 + stage-08] 四面墙(含门洞/窗洞) + 木门(带门轴 pivot)
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
//  7. [stage-04] 尖屋顶（双坡顶 + 山墙）
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
//  8. [stage-04] 烟囱 + 室内地板
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
//  9. [stage-09] 家具进场——程序化搭建（离线可运行核心）
// ----------------------------------------------------------------------------
//  设计思路：
//  - 室内地板顶面 y=0.35（地板中心 0.325 + 半厚 0.025）
//  - 所有家具 Group 原点放在地板顶面 (y=0.35)，零件用局部坐标从 y=0 向上搭
//  - 用 Group 组织同一件家具的多个零件，便于整体移动/旋转/dispose
//  - 共享 geometry（如圆柱腿）减少 GPU buffer 数量
//  - castShadow/receiveShadow 全开，家具参与阴影
// ============================================================================
const FLOOR_TOP = 0.35; // 地板顶面 y

/**
 * 创建一把椅子（局部坐标：座板中心在 (0,0.43,0)，靠背在 -Z 方向，朝 +Z 坐）
 * @param {THREE.Material} woodMat 木色材质
 * @param {THREE.CylinderGeometry} legGeo 共享的腿几何体
 * @returns {THREE.Group}
 */
const makeChair = (woodMat, legGeo) => {
  const chair = new THREE.Group();
  chair.name = "Chair";

  // 座板：0.4 × 0.04 × 0.4，中心 y=0.43（座高约 0.45m，从地板顶面起算）
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), woodMat);
  seat.position.set(0, 0.43, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  chair.add(seat);

  // 靠背：0.4 × 0.45 × 0.04，在座板 -Z 端（坐着的人背后）
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.04), woodMat);
  back.position.set(0, 0.66, -0.18);
  back.castShadow = true;
  back.receiveShadow = true;
  chair.add(back);

  // 4 条腿：CylinderGeometry(上半径,下半径,高)，放在座板四角下方
  const legPositions = [
    [-0.17, 0.205, -0.17],
    [0.17, 0.205, -0.17],
    [-0.17, 0.205, 0.17],
    [0.17, 0.205, 0.17],
  ];
  legPositions.forEach((p) => {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(p[0], p[1], p[2]);
    leg.castShadow = true;
    leg.receiveShadow = true;
    chair.add(leg);
  });

  return chair;
};

/**
 * 创建餐桌（桌面 + 4 腿）
 * @param {THREE.Material} woodMat 木色材质
 * @param {THREE.CylinderGeometry} legGeo 共享的腿几何体
 * @returns {THREE.Group}
 */
const makeTable = (woodMat, legGeo) => {
  const table = new THREE.Group();
  table.name = "Table";

  // 桌面：1.2 × 0.1 × 0.8，中心 y=0.55（桌高约 0.6m，从地板顶面起算）
  // 注意：HOUSE_SPEC 给的"位置 (-2, 0.9, -1)"指桌面世界 y≈0.9
  //   = FLOOR_TOP(0.35) + 桌面局部 y(0.55)，与之吻合
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.8), woodMat);
  top.position.set(0, 0.55, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);

  // 4 条腿：高 0.50（从地板顶面 y=0 到桌面底 y=0.50），中心 y=0.25
  const legPositions = [
    [-0.5, 0.25, -0.32],
    [0.5, 0.25, -0.32],
    [-0.5, 0.25, 0.32],
    [0.5, 0.25, 0.32],
  ];
  legPositions.forEach((p) => {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(p[0], p[1], p[2]);
    leg.castShadow = true;
    leg.receiveShadow = true;
    table.add(leg);
  });

  return table;
};

/**
 * 创建床（床框 + 床垫 + 2 枕头）
 * @param {THREE.Material} frameMat 床框材质
 * @param {THREE.Material} mattressMat 床垫材质
 * @param {THREE.Material} pillowMat 枕头材质
 * @returns {THREE.Group}
 */
const makeBed = (frameMat, mattressMat, pillowMat) => {
  const bed = new THREE.Group();
  bed.name = "Bed";

  // 床框：1.5 × 0.3 × 2，中心 y=0.15（底贴地板顶面）
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 2), frameMat);
  frame.position.set(0, 0.15, 0);
  frame.castShadow = true;
  frame.receiveShadow = true;
  bed.add(frame);

  // 床垫：1.4 × 0.2 × 1.9，中心 y=0.40（叠在床框上）
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.2, 1.9),
    mattressMat
  );
  mattress.position.set(0, 0.4, 0);
  mattress.castShadow = true;
  mattress.receiveShadow = true;
  bed.add(mattress);

  // 枕头 ×2：0.45 × 0.12 × 0.3，放在床的 +Z 端（床头）
  const pillowGeo = new THREE.BoxGeometry(0.45, 0.12, 0.3);
  const pillowPositions = [
    [-0.35, 0.56, 0.78],
    [0.35, 0.56, 0.78],
  ];
  pillowPositions.forEach((p) => {
    const pillow = new THREE.Mesh(pillowGeo, pillowMat);
    pillow.position.set(p[0], p[1], p[2]);
    pillow.castShadow = true;
    pillow.receiveShadow = true;
    bed.add(pillow);
  });

  return bed;
};

/**
 * 创建沙发（底座 + 靠背 + 2 扶手 + 2 坐垫）
 * @param {THREE.Material} sofaMat 沙发布料材质
 * @param {THREE.Material} cushionMat 坐垫材质
 * @returns {THREE.Group}
 */
const makeSofa = (sofaMat, cushionMat) => {
  const sofa = new THREE.Group();
  sofa.name = "Sofa";

  // 底座：2.0 × 0.3 × 0.9，中心 y=0.15（底贴地板顶面）
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.9), sofaMat);
  base.position.set(0, 0.15, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  sofa.add(base);

  // 靠背：2.0 × 0.6 × 0.15，在底座 +Z 端（沙发背朝 +Z，人朝 -Z 看壁炉墙）
  const backrest = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.6, 0.15),
    sofaMat
  );
  backrest.position.set(0, 0.55, 0.375);
  backrest.castShadow = true;
  backrest.receiveShadow = true;
  sofa.add(backrest);

  // 扶手 ×2：0.15 × 0.4 × 0.9，在底座左右两侧
  const armGeo = new THREE.BoxGeometry(0.15, 0.4, 0.9);
  const armLeft = new THREE.Mesh(armGeo, sofaMat);
  armLeft.position.set(-0.925, 0.35, 0);
  armLeft.castShadow = true;
  armLeft.receiveShadow = true;
  sofa.add(armLeft);
  const armRight = new THREE.Mesh(armGeo, sofaMat);
  armRight.position.set(0.925, 0.35, 0);
  armRight.castShadow = true;
  armRight.receiveShadow = true;
  sofa.add(armRight);

  // 坐垫 ×2：0.95 × 0.15 × 0.8，叠在底座上
  const cushionGeo = new THREE.BoxGeometry(0.95, 0.15, 0.8);
  const cushionPositions = [
    [-0.48, 0.375, -0.02],
    [0.48, 0.375, -0.02],
  ];
  cushionPositions.forEach((p) => {
    const cushion = new THREE.Mesh(cushionGeo, cushionMat);
    cushion.position.set(p[0], p[1], p[2]);
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    sofa.add(cushion);
  });

  return sofa;
};

/**
 * 家具进场总入口：创建所有家具并摆到室内
 * @param {THREE.Group} houseGroup 房子 Group（家具挂其下，随房子一起 dispose）
 */
const addFurniture = (houseGroup) => {
  furnitureGroup = new THREE.Group();
  furnitureGroup.name = "Furniture";

  // ---- 共享材质 ----
  // 木色 #8b5a2b（HOUSE_SPEC 木门同色），用于桌椅
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.6,
    metalness: 0.0,
  });
  // 床框深木色
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x6b4423,
    roughness: 0.7,
    metalness: 0.0,
  });
  // 床垫白色
  const mattressMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    roughness: 0.9,
    metalness: 0.0,
  });
  // 枕头浅蓝
  const pillowMat = new THREE.MeshStandardMaterial({
    color: 0xa8d0ff,
    roughness: 0.9,
    metalness: 0.0,
  });
  // 沙发布料暖灰
  const sofaMat = new THREE.MeshStandardMaterial({
    color: 0x9c8a78,
    roughness: 0.85,
    metalness: 0.0,
  });
  // 坐垫浅米
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    roughness: 0.85,
    metalness: 0.0,
  });

  // ---- 共享几何体（桌椅腿用同一圆柱，减少 buffer 数量）----
  // 桌/椅腿半径 0.04/0.025，统一用 0.03 视觉兼顾；高 0.50/0.41 不能共用，
  // 所以这里建两个 CylinderGeometry，桌椅各自的 makeXxx 内部复用同一份。
  const tableLegGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 12);
  const chairLegGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.41, 10);

  // ============================================================
  //  餐桌 + 2 椅子：餐桌区在室内左前 (-2, ?, -1)
  //  桌子 Group 原点 (x=-2, z=-1)，y=FLOOR_TOP(0.35)
  //  椅子分置桌子 ±X 两侧，旋转使座面朝向桌子
  // ============================================================
  const table = makeTable(woodMat, tableLegGeo);
  table.position.set(-2, FLOOR_TOP, -1);
  furnitureGroup.add(table);

  // 椅子1：桌子 -X 侧（x=-3.0），朝 +X 坐（默认朝 +Z，需绕 Y 转 +90°）
  const chair1 = makeChair(woodMat, chairLegGeo);
  chair1.position.set(-3.0, FLOOR_TOP, -1);
  chair1.rotation.y = Math.PI / 2; // +Z 朝向 → +X 朝向
  furnitureGroup.add(chair1);

  // 椅子2：桌子 +X 侧（x=-1.0），朝 -X 坐（绕 Y 转 -90°）
  const chair2 = makeChair(woodMat, chairLegGeo);
  chair2.position.set(-1.0, FLOOR_TOP, -1);
  chair2.rotation.y = -Math.PI / 2; // +Z 朝向 → -X 朝向
  furnitureGroup.add(chair2);

  // ============================================================
  //  床：右后区 (2.5, ?, -1.5)
  //  床 Group 原点 (x=2.5, z=-1.5)，y=FLOOR_TOP(0.35)
  //  床头朝 +Z（朝向房子中部），枕头在 +Z 端
  // ============================================================
  const bed = makeBed(frameMat, mattressMat, pillowMat);
  bed.position.set(2.5, FLOOR_TOP, -1.5);
  furnitureGroup.add(bed);

  // ============================================================
  //  沙发：中部靠前 (0, ?, 1.5)
  //  沙发 Group 原点 (x=0, z=1.5)，y=FLOOR_TOP(0.35)
  //  沙发背朝 +Z（背朝门），人坐下朝 -Z 看后墙/壁炉
  // ============================================================
  const sofa = makeSofa(sofaMat, cushionMat);
  sofa.position.set(0, FLOOR_TOP, 1.5);
  furnitureGroup.add(sofa);

  // 把家具组挂到房子下（随房子一起渲染/dispose）
  houseGroup.add(furnitureGroup);

  // 注意：furnitureGroup 内的 geometry/material 没有逐个 track，
  // disposeScene 会用 traverse 统一释放（见 disposeScene 末尾的家具分支）
};

// ============================================================================
//  10. [stage-09] GLTFLoader 生产用法演示（可选 / 在线尝试）
// ----------------------------------------------------------------------------
//  本函数演示"如何在生产环境用 GLTFLoader 加载外部 .glb 模型替换程序化家具"。
//  为了保证源码快照离线可运行，这里采取"尝试加载 + 失败静默回退"策略：
//    - 程序化家具已在 addFurniture() 中先行布置，场景永远有家具
//    - 本函数尝试从 threejs 官方 CDN 加载一个示例 glb
//    - 加载成功：把模型缩放/平移到室内一角作为"装饰摆件"，演示流程
//    - 加载失败（离线 / CDN 不可达）：onError 静默，程序化家具照常显示
//
//  生产环境典型用法（文档 01.GLTF加载器.md 详解）：
//    const loader = new GLTFLoader();
//    loader.load(
//      "/models/sofa.glb",            // 模型 URL（同源 / CDN / OSS）
//      (gltf) => {                     // onLoad：成功回调
//        const model = gltf.scene;     // gltf.scene 是一个 Group
//        model.traverse((obj) => {     // 遍历处理材质/阴影
//          if (obj.isMesh) {
//            obj.castShadow = true;
//            obj.receiveShadow = true;
//          }
//        });
//        model.scale.setScalar(1);     // 适配尺寸
//        model.position.set(0, 0.35, 1.5);
//        scene.add(model);
//      },
//      (xhr) => {                      // onProgress：进度回调
//        console.log(`加载进度：${(xhr.loaded / xhr.total) * 100}%`);
//      },
//      (err) => {                      // onError：失败回调
//        console.warn("GLTF 模型加载失败，使用程序化家具兜底", err);
//      }
//    );
// ============================================================================
const tryLoadGltfDemo = (houseGroup) => {
  const loader = new GLTFLoader();
  // threejs 官方示例模型 CDN（需要联网；离线时 onError 触发，回退到程序化家具）
  const MODEL_URL =
    "https://threejs.org/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf";

  loader.load(
    MODEL_URL,
    (gltf) => {
      // onLoad：模型加载成功
      const model = gltf.scene;
      // 缩小并放到屋顶作为"风向标"装饰（不抢占室内家具的视觉焦点）
      model.scale.setScalar(0.6);
      model.position.set(0, 5.6, 0);
      model.rotation.y = Math.PI * 0.15;
      // 遍历开启阴影
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      houseGroup.add(model);
      ui.furniture = "程序化家具 + GLTF 装饰已就位";
      // 把模型挂到 furnitureGroup 下便于统一 dispose
      if (furnitureGroup) furnitureGroup.add(model);
    },
    (xhr) => {
      // onProgress：可选，演示用，不更新 UI
      if (xhr.total) {
        // 可在此处更新加载百分比，本快照省略
      }
    },
    (err) => {
      // onError：离线或 CDN 不可达，静默回退
      // 程序化家具已先行布置，无需额外处理
      console.warn(
        "[stage-09] GLTF 演示模型加载失败（可能离线），已回退到程序化家具。",
        err?.message || err
      );
      ui.furniture = "程序化家具已就位（GLTF 离线回退）";
    }
  );
};

// ============================================================================
//  11. 组装整个房子
// ============================================================================
const addHouse = () => {
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";
  addWallsAndDoor(houseGroup); // [stage-03 + stage-08] 墙 + 门(带门轴)
  addRoof(houseGroup); // [stage-04] 屋顶 + 山墙
  addChimneyAndFloor(houseGroup); // [stage-04] 烟囱 + 室内地板
  addFurniture(houseGroup); // [stage-09] 家具进场（程序化）
  scene.add(houseGroup);
  return houseGroup;
};

// ============================================================================
//  12. [stage-08] 键盘交互：O 开关门 / L 开关灯
// ============================================================================
const onKeyDown = (e) => {
  const key = e.key.toLowerCase();
  if (key === "o") {
    // 切换门目标状态
    doorState = doorState === 0 ? 1 : 0;
    ui.doorState = doorState === 1 ? "开启" : "关闭";
  } else if (key === "l") {
    // 切换室内灯目标状态
    lampOn = !lampOn;
    ui.lampState = lampOn ? "开启" : "关闭";
  }
};

// ============================================================================
//  13. [stage-08] 帧率无关动画核心：门 / 灯 / 昼夜
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

  // 阳光位置也随时间在天空划弧（更真实）：t=0 在正东上方，t=0.5 在正西下方
  // 用极坐标：高度 = sin(2πt)，水平角度 = 2πt
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
//  14. 渲染循环（帧率无关动画总入口）
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  // 关键：用 Clock.getDelta() 取得上一帧到本帧的真实时间间隔
  // 这样动画速度与帧率无关：60fps 每帧 dt≈0.0167s，30fps 每帧 dt≈0.0333s，
  // 但每秒累计的位移相同
  const dt = clock.getDelta();

  controls.update();
  updateDoor(dt); // [stage-08] 门动画
  updateLamp(dt); // [stage-08] 灯动画
  updateDayNight(dt); // [stage-08] 昼夜循环

  renderer.render(scene, camera);
};

// ============================================================================
//  15. resize 处理
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
//  16. 资源释放（dispose）
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

  // [stage-09] 释放家具 Group 内所有子级 geometry / material
  // （程序化家具 + 可能加载的 GLTF 模型，统一 traverse 释放）
  if (furnitureGroup) {
    furnitureGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            // GLTF 模型材质可能带 map，一并释放
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      }
    });
    if (furnitureGroup.parent) furnitureGroup.parent.remove(furnitureGroup);
    furnitureGroup = null;
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
//  17. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器/时钟
  addLights(); // 2. [stage-06] 灯光 + 阴影
  addGround(); // 3. [stage-01] 草地
  addFoundation(); // 4. [stage-02] 地基 + 台阶
  const house = addHouse(); // 5~9. [stage-03/04/05/09] 房子（墙+门+屋顶+烟囱+地板+玻璃+家具）
  // [stage-09] 可选：尝试在线加载 GLTF 演示模型，离线时静默回退
  tryLoadGltfDemo(house);
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", onKeyDown); // [stage-08] 键盘交互
  animate(); // 启动渲染循环（含门/灯/昼夜动画）
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
        🏠 阶段 09 · 家具进场
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
          >🖱</span
        >拖拽旋转 / 滚轮缩放
      </div>
      <div style="color: #909399; font-size: 12px; margin-top: 2px">
        室内已布置：餐桌·椅×2·床·沙发
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
        min-width: 160px;
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
        家具：<span style="color: #67c23a; font-weight: 600">{{
          ui.furniture
        }}</span>
      </div>
    </div>

    <!-- 底部居中：阶段说明 -->
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
      🪑 程序化家具（Box/Cylinder）· GLTFLoader 生产用法演示 · 离线可运行
    </div>
  </div>
</template>
