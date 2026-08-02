<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 06：阳光与室内灯
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-06）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 程序化贴图(砖墙/木纹/地板) + 玻璃窗 + 天空盒(渐变背景)
 *    [stage-06] 环境光 + 阳光(平行光) + 室内点光源 + 壁灯聚光灯×2 + 阴影系统
 *
 *  本阶段新增教学（灯光与阴影）：
 *    1) 移除前序阶段的临时预览灯光，正式引入完整灯光系统
 *    2) AmbientLight(0xffffff, 0.3) 环境光，提供基础亮度
 *    3) DirectionalLight(0xfffaf0, 1.2) 阳光，position(10,15,8)，castShadow，
 *       shadow.mapSize(2048,2048)，shadow.camera 覆盖整栋房子
 *    4) PointLight(0xffd27a, 1.0, 10, 1.5) 室内点光源，position(0,2.8,0)，castShadow
 *    5) SpotLight×2(0xffe4b5, 0.8) 壁灯聚光灯，position(±2,2.5,-2.8) 朝前下，
 *       angle/penumbra 配置，配 SpotLightHelper 演示光锥
 *    6) 渲染器开启 shadowMap.enabled=true、type=PCFSoftShadowMap
 *    7) 所有墙/屋顶/门/地基 castShadow + receiveShadow；草地 receiveShadow；玻璃不投影
 *
 *  灯光参数严格遵循 HOUSE_SPEC 第 33~36 行：
 *    阳光 #fffaf0 暖白 / 环境光弱 / 室内点光源 #ffd27a 暖黄 / 壁灯 #ffe4b5
 * ============================================================================
 */
import { ref, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ----------------------------- Vue 引用 -----------------------------
const canvasRef = ref(null);

// ----------------------------- 教学开关 -----------------------------
// 是否显示灯光辅助线框（SpotLightHelper 等）。教学时设 true 可直观光锥，
// 想看最终效果时设 false 即可。AmbientLight/DirectionalLight 无 Helper 需要。
const SHOW_LIGHT_HELPERS = true;

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationId = null;

// 收集所有需要 dispose 的 geometry / material / texture，便于统一释放
const disposables = [];
// 收集所有灯光（含 helper），便于统一 dispose 与从场景移除
const lights = [];
const lightHelpers = [];

/**
 * 注册一个 mesh（或 group）到 disposables，组件卸载时统一释放。
 * @param {THREE.Mesh|THREE.Group} obj
 */
const track = (obj) => {
  disposables.push(obj);
  return obj;
};

// ============================================================================
//  1. 场景 / 相机 / 渲染器 / 控制器
// ============================================================================
const initScene = () => {
  scene = new THREE.Scene();
  // [stage-05] 天空盒：用程序化渐变 CanvasTexture 作为 scene.background，
  // 比纯色更像真实天空（顶部深蓝、地平线浅蓝），且无需外部 HDR 资源
  scene.background = createSkyTexture();

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

  // [stage-06] 阴影系统核心：开启阴影贴图，使用 PCFSoft 软阴影
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 输出色彩空间设为 sRGB，让贴图与灯光颜色显示正确（Three.js r152+ 默认即 sRGB）
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // OrbitControls：拖拽旋转、滚轮缩放
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 启用阻尼，旋转更顺滑
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.5, 0); // 视线中心略抬到房子中部
  controls.update();
};

// ============================================================================
//  2. [stage-06] 灯光系统（环境光 + 阳光 + 室内点光源 + 壁灯聚光灯）
// ============================================================================
const addLights = () => {
  // -------- 2.1 环境光 AmbientLight --------
  // 环境光没有方向、没有位置，均匀照亮所有物体的所有面，强度 0.3。
  // 作用：避免阳光照不到的背阴面（如墙体内侧、屋檐下）纯黑。
  // 颜色用纯白 0xffffff，强度压到 0.3，保证阳光阴影对比明显。
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);
  lights.push(ambient);

  // -------- 2.2 阳光 DirectionalLight（平行光）--------
  // 平行光模拟无限远的太阳：所有光线平行，位置只决定方向（position - target）。
  // 颜色 #fffaf0 暖白，强度 1.2；position(10,15,8)，target(0,0,0)。
  const sun = new THREE.DirectionalLight(0xfffaf0, 1.2);
  sun.position.set(10, 15, 8);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  // [stage-06] 阳光投射阴影：这是户外主阴影来源（房子在草地上投下长影）
  sun.castShadow = true;
  // 阴影贴图分辨率 2048×2048，越高越细腻但越耗显存（512/1024/2048 常用）
  sun.shadow.mapSize.set(2048, 2048);
  // 平行光阴影使用正交相机（OrthographicCamera），需手动设定可视范围覆盖房子
  // 左右上下 ±15 覆盖 8×6 的房子并留余量；near 0.1、far 30 覆盖光路距离
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 30;
  // 阴影偏置：负值消除"阴影痤疮"（物体表面出现条纹状假阴影）
  sun.shadow.bias = -0.0005;
  // 让阴影边缘更柔和（PCFSoft 已软，再加 normalBias 减少自阴影穿孔）
  sun.shadow.normalBias = 0.02;
  // 更新投影矩阵（改完 camera 参数必须调用）
  sun.shadow.camera.updateProjectionMatrix();
  lights.push(sun);

  // -------- 2.3 室内点光源 PointLight --------
  // 点光源从中心向四面八方均匀发光，有 distance/decay 模拟距离衰减。
  // 位置 (0,2.8,0) —— 室内天花板正中，照亮整个房间内部。
  // 颜色 #ffd27a 暖黄（像白炽灯），强度 1.0，distance=10（10m 外衰减为 0），decay=1.5。
  const indoorLight = new THREE.PointLight(0xffd27a, 1.0, 10, 1.5);
  indoorLight.position.set(0, 2.8, 0);
  // 点光源也投射阴影：注意点光源阴影是 6 面立方体贴图，开销是平行光的 6 倍，
  // 因此 mapSize 用 512 控制成本；室内小范围 512 已足够。
  indoorLight.castShadow = true;
  indoorLight.shadow.mapSize.set(512, 512);
  indoorLight.shadow.camera.near = 0.1;
  indoorLight.shadow.camera.far = 10;
  indoorLight.shadow.bias = -0.001;
  scene.add(indoorLight);
  lights.push(indoorLight);

  // -------- 2.4 壁灯聚光灯 SpotLight ×2 --------
  // 聚光灯有方向、有角度，形成一个光锥。构造参数：
  //   SpotLight(color, intensity, distance, angle, penumbra, decay)
  // 位置 (±2, 2.5, -2.8) —— 后墙内侧两盏壁灯；朝前下照射室内地板。
  const createWallLamp = (x) => {
    const spot = new THREE.SpotLight(
      0xffe4b5, // 颜色：暖光
      0.8, // 强度
      8, // distance：8m 外衰减为 0
      Math.PI / 6, // angle：30° 半锥角
      0.4, // penumbra：0.4 半影，锥边柔和过渡
      1.5 // decay：距离衰减
    );
    spot.position.set(x, 2.5, -2.8);
    // target 放在前下方，让光锥朝 +Z（前方）和 -Y（下方）打出去
    spot.target.position.set(x, 0.5, 0.5);
    scene.add(spot);
    scene.add(spot.target);

    // 聚光灯投射阴影：壁灯照亮地板时，家具/门会在地板投下局部阴影
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 10;
    spot.shadow.bias = -0.0005;
    lights.push(spot);

    // SpotLightHelper：可视化光锥方向与角度，教学调试用
    if (SHOW_LIGHT_HELPERS) {
      const helper = new THREE.SpotLightHelper(spot, 0xffe4b5);
      scene.add(helper);
      lightHelpers.push(helper);
    }

    return spot;
  };
  createWallLamp(-2); // 左壁灯
  createWallLamp(2); // 右壁灯
};

// ============================================================================
//  3. [stage-05] 程序化贴图工厂（CanvasTexture）
// ============================================================================
/**
 * 创建天空渐变贴图：顶部深蓝 → 中部蓝 → 地平线浅蓝。
 * 作为 scene.background 使用，无需外部 HDR。
 */
const createSkyTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#1e3a8a"); // 天顶深蓝
  grad.addColorStop(0.5, "#3b82f6"); // 中部蓝
  grad.addColorStop(1.0, "#bae6fd"); // 地平线浅蓝
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  track({ geometry: null, material: null, texture: tex }); // 借用 track 统一 dispose
  return tex;
};

/**
 * 创建砖墙贴图：暖米色基底 + 错缝砖块 + 灰浆缝。
 * 用于四面外墙，让墙体看起来有砖纹质感（取代 stage-04 的纯色墙）。
 */
const createBrickTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  // 灰浆底色（缝的颜色）
  ctx.fillStyle = "#cdb892";
  ctx.fillRect(0, 0, 256, 256);

  // 砖块参数
  const brickW = 60;
  const brickH = 24;
  const gap = 4; // 灰浆缝宽
  const colors = ["#e6d5b8", "#dcc8a6", "#d2bd96"]; // 暖米色砖块三档

  let row = 0;
  for (let y = 0; y < 256; y += brickH + gap) {
    const offset = row % 2 === 0 ? 0 : (brickW + gap) / 2; // 错缝
    let col = 0;
    for (let x = -brickW; x < 256; x += brickW + gap) {
      ctx.fillStyle = colors[(row + col) % colors.length];
      ctx.fillRect(x + offset + gap / 2, y + gap / 2, brickW, brickH);
      col++;
    }
    row++;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1); // 沿墙面横向重复 2 次
  track({ geometry: null, material: null, texture: tex });
  return tex;
};

/**
 * 创建木纹贴图：用于门板与室内地板，深浅木纹纵向流动。
 * @param {string} base 木纹基色
 */
const createWoodTexture = (base) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  // 基底
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // 木纹：多条深浅不一的纵向曲线
  for (let i = 0; i < 24; i++) {
    const x = (i / 24) * 256 + (Math.random() - 0.5) * 6;
    const alpha = 0.08 + Math.random() * 0.18;
    ctx.strokeStyle =
      Math.random() > 0.5
        ? `rgba(60,40,20,${alpha})` // 深纹
        : `rgba(255,240,210,${alpha * 0.6})`; // 浅纹
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 16) {
      ctx.lineTo(x + Math.sin(y / 32 + i) * 4, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  track({ geometry: null, material: null, texture: tex });
  return tex;
};

// ============================================================================
//  4. [stage-01] 草地
// ============================================================================
const addGround = () => {
  // 草地：40×40 平面，水平铺设（rotateX -90°），颜色 #67c23a 成功绿
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x67c23a,
    roughness: 1.0, // 草地完全粗糙
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2; // 让平面从 XY 旋转到 XZ（水平地面）
  ground.position.y = 0;
  // [stage-06] 草地只接收阴影（不投射，避免大平面互投）
  ground.receiveShadow = true;
  scene.add(track(ground));
};

// ============================================================================
//  5. [stage-02] 地基平台 + 入口台阶
// ============================================================================
const addFoundation = () => {
  // 地基材质：信息灰 #909399，粗糙石材
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
  // [stage-06] 地基既投阴影（被阳光照出轮廓）又接收阴影（承接房子投影）
  platform.castShadow = true;
  platform.receiveShadow = true;
  scene.add(track(platform));

  // 入口台阶：两级，1.5(X) × 0.4(Z) × 0.15(Y)
  const makeStep = (x, y, z) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 0.4), foundationMat);
    s.position.set(x, y, z);
    s.castShadow = true;
    s.receiveShadow = true;
    scene.add(track(s));
  };
  makeStep(0, 0.075, 3.2); // 第一级（半高）
  makeStep(0, 0.225, 3.0); // 第二级略往里收
};

// ============================================================================
//  6. [stage-03] 四面墙（含门洞/窗洞）+ 木门板
// ============================================================================
const addWallsAndDoor = (houseGroup) => {
  // [stage-05] 外墙材质升级：用砖墙 CanvasTexture，保留暖米色调
  const brickTex = createBrickTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    map: brickTex,
    color: 0xffffff, // 用贴图时 color 设白，避免染色
    roughness: 0.9,
    metalness: 0.0,
  });

  // [stage-05] 木门材质升级：用木纹 CanvasTexture
  const doorTex = createWoodTexture("#8b5a2b");
  const doorMat = new THREE.MeshStandardMaterial({
    map: doorTex,
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0.0,
  });

  // 墙体尺寸常量（来自 HOUSE_SPEC）
  // 墙厚 0.2，墙高 3.0，墙中心 y=1.8（墙顶 y=3.3，墙底 y=0.3 与地基顶齐平）
  const WT = 0.2;

  // 辅助函数：创建墙块并加到 houseGroup，统一开启投影与接收阴影
  const block = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true; // [stage-06] 墙体投射阴影
    m.receiveShadow = true; // [stage-06] 墙体接收阴影（如屋顶在墙上的投影）
    houseGroup.add(track(m));
    return m;
  };

  // ---- 后墙：8(X) × 3(Y) × 0.2(Z)，整体一块（无洞），中心 (0,1.8,-3) ----
  block(8, 3, WT, 0, 1.8, -3);

  // ---- 左墙：0.2(X) × 3(Y) × 6(Z)，中心 (-4,1.8,0)，含 1 个侧窗洞 ----
  // 侧窗洞尺寸：1.2(Z) × 1.2(Y)，中心 (±4, 1.5, 0)
  block(WT, 0.6, 6, -4, 0.6, 0); // 下行
  block(WT, 1.2, 2.4, -4, 1.5, -1.8); // 中行左
  block(WT, 1.2, 2.4, -4, 1.5, 1.8); // 中行右
  block(WT, 1.2, 6, -4, 2.7, 0); // 上行

  // ---- 右墙：对称（X=+4）----
  block(WT, 0.6, 6, 4, 0.6, 0);
  block(WT, 1.2, 2.4, 4, 1.5, -1.8);
  block(WT, 1.2, 2.4, 4, 1.5, 1.8);
  block(WT, 1.2, 6, 4, 2.7, 0);

  // ---- 前墙：8(X) × 3(Y) × 0.2(Z)，含 1 门洞 + 2 窗洞，z=3 ----
  block(8, 0.6, WT, 0, 0.6, 3); // 下行
  block(1.6, 1.2, WT, -3.2, 1.5, 3); // 左窗洞左
  block(1.1, 1.2, WT, -1.05, 1.5, 3); // 左窗洞右-门洞左
  block(1.1, 1.2, WT, 1.05, 1.5, 3); // 门洞右-右窗洞左
  block(1.6, 1.2, WT, 3.2, 1.5, 3); // 右窗洞右
  block(3.5, 0.2, WT, -2.25, 2.2, 3); // 门洞上方左半
  block(3.5, 0.2, WT, 2.25, 2.2, 3); // 门洞上方右半
  block(8, 1.0, WT, 0, 2.8, 3); // 顶部整宽

  // ---- 木门板：1.0(X) × 2.0(Y) × 0.05(Z)，中心 (0, 1.3, 3.125) ----
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.05), doorMat);
  door.position.set(0, 1.3, 3.125);
  door.castShadow = true; // [stage-06] 门板投射阴影
  door.receiveShadow = true;
  houseGroup.add(track(door));
};

// ============================================================================
//  7. [stage-04] 尖屋顶（双坡顶 + 山墙）
// ============================================================================
const addRoof = (houseGroup) => {
  // 屋顶材质：砖红瓦 #a0522d
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xa0522d,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide, // 双面渲染（屋檐下也能看见）
  });

  // 山墙材质：与外墙一致 #e6d5b8
  const gableMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // ---- 屋顶几何参数（精确推导，见 stage-04 文档）----
  const ridgeY = 5.0; // 屋脊高度
  const eaveY = 3.3; // 屋檐高度（= 墙顶）
  const halfSpan = 4.0; // 半跨度 X
  const ridgeLen = 6.6; // 屋脊长度 Z
  const slopeLen = Math.sqrt(halfSpan * halfSpan + (ridgeY - eaveY) ** 2); // 斜坡长 ≈ 4.347
  const slopeAngle = Math.atan((ridgeY - eaveY) / halfSpan); // 坡度角 ≈ 23.04°

  // ---- 左坡板 ----
  const leftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  leftRoof.position.set(-2, 4.15, 0);
  leftRoof.rotation.z = slopeAngle;
  leftRoof.castShadow = true; // [stage-06] 屋顶投射阴影（房子主轮廓）
  leftRoof.receiveShadow = true;
  houseGroup.add(track(leftRoof));

  // ---- 右坡板 ----
  const rightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  rightRoof.position.set(2, 4.15, 0);
  rightRoof.rotation.z = -slopeAngle;
  rightRoof.castShadow = true;
  rightRoof.receiveShadow = true;
  houseGroup.add(track(rightRoof));

  // ---- 前后山墙：三角形 Shape + ExtrudeGeometry ----
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
  frontGable.castShadow = true; // [stage-06] 山墙投射阴影
  frontGable.receiveShadow = true;
  houseGroup.add(track(frontGable));

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
  // 烟囱：0.6 × 1.5 × 0.6，中心 (2, 4.5, -1.5)
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
  chimney.castShadow = true; // [stage-06] 烟囱投射阴影
  chimney.receiveShadow = true;
  houseGroup.add(track(chimney));

  // [stage-05] 室内地板材质升级：用木纹贴图，浅木色 #d2b48c
  const floorTex = createWoodTexture("#d2b48c");
  floorTex.repeat.set(3, 2); // 地板纹路更密
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 0.05, 5.6),
    floorMat
  );
  floor.position.set(0, 0.325, 0);
  floor.receiveShadow = true; // [stage-06] 地板接收室内灯光投射的阴影
  floor.castShadow = true;
  houseGroup.add(track(floor));
};

// ============================================================================
//  9. [stage-05] 窗框 + 玻璃（4 个窗洞）
// ============================================================================
const addWindows = (houseGroup) => {
  // 窗框材质：Element Plus 主色蓝 #409eff
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x409eff,
    roughness: 0.5,
    metalness: 0.0,
  });

  // [stage-05] 玻璃材质：MeshPhysicalMaterial 透射，浅蓝透射 #a8d0ff
  // 关键：玻璃不投射阴影（castShadow=false），阳光穿过玻璃照进室内
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa8d0ff,
    metalness: 0.0,
    roughness: 0.05,
    transmission: 0.85, // 透射率，越高越透明
    transparent: true,
    opacity: 0.55,
    ior: 1.5, // 折射率（玻璃 ≈ 1.5）
    thickness: 0.5,
    side: THREE.DoubleSide,
  });

  /**
   * 创建一扇窗：窗框（4 根细条）+ 玻璃面板。
   * @param {number} cx 中心 X
   * @param {number} cy 中心 Y
   * @param {number} cz 中心 Z
   * @param {'front'|'side'} orient 朝向：front=前墙(z面)、side=侧墙(x面)
   */
  const makeWindow = (cx, cy, cz, orient) => {
    const win = new THREE.Group();
    const wW = 0.8; // 窗洞宽（前墙）/ 窗洞深（侧墙）
    const wH = 1.2; // 窗洞高
    const t = 0.05; // 框厚

    if (orient === "front") {
      // 前墙窗：框在 z 方向薄，玻璃 0.72×1.12
      // 上下左右四根框条
      const top = new THREE.Mesh(new THREE.BoxGeometry(wW, t, t), frameMat);
      top.position.set(0, wH / 2, 0);
      const bot = new THREE.Mesh(new THREE.BoxGeometry(wW, t, t), frameMat);
      bot.position.set(0, -wH / 2, 0);
      const left = new THREE.Mesh(new THREE.BoxGeometry(t, wH, t), frameMat);
      left.position.set(-wW / 2, 0, 0);
      const right = new THREE.Mesh(new THREE.BoxGeometry(t, wH, t), frameMat);
      right.position.set(wW / 2, 0, 0);
      // 玻璃
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 1.12, 0.02),
        glassMat
      );
      glass.position.set(0, 0, 0.03); // 略凸出框面
      glass.castShadow = false; // [stage-06] 玻璃不投影
      glass.receiveShadow = false;
      [top, bot, left, right].forEach((m) => {
        m.castShadow = true;
        m.receiveShadow = true;
        win.add(m);
      });
      win.add(glass);
    } else {
      // 侧墙窗：框在 x 方向薄，玻璃 0.02×1.12×0.72
      const top = new THREE.Mesh(new THREE.BoxGeometry(t, t, wW), frameMat);
      top.position.set(0, wH / 2, 0);
      const bot = new THREE.Mesh(new THREE.BoxGeometry(t, t, wW), frameMat);
      bot.position.set(0, -wH / 2, 0);
      const left = new THREE.Mesh(new THREE.BoxGeometry(t, wH, t), frameMat);
      left.position.set(0, 0, -wW / 2);
      const right = new THREE.Mesh(new THREE.BoxGeometry(t, wH, t), frameMat);
      right.position.set(0, 0, wW / 2);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 1.12, 0.72),
        glassMat
      );
      glass.position.set(0.03, 0, 0); // 略凸出框面（朝外）
      glass.castShadow = false; // [stage-06] 玻璃不投影
      glass.receiveShadow = false;
      [top, bot, left, right].forEach((m) => {
        m.castShadow = true;
        m.receiveShadow = true;
        win.add(m);
      });
      win.add(glass);
    }

    win.position.set(cx, cy, cz);
    houseGroup.add(track(win));
  };

  // 前墙 2 窗：(±2, 1.5, 3)
  makeWindow(-2, 1.5, 3, "front");
  makeWindow(2, 1.5, 3, "front");
  // 侧墙 2 窗：(±4, 1.5, 0)
  makeWindow(-4, 1.5, 0, "side");
  makeWindow(4, 1.5, 0, "side");
};

// ============================================================================
//  10. 组装整个房子（House Group）
// ============================================================================
const addHouse = () => {
  // 用 Group 把房子所有部件组织在一起，便于整体移动/旋转
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";

  addWallsAndDoor(houseGroup); // [stage-03] 墙 + 门
  addRoof(houseGroup); // [stage-04] 屋顶 + 山墙
  addChimneyAndFloor(houseGroup); // [stage-04] 烟囱 + 室内地板
  addWindows(houseGroup); // [stage-05] 窗框 + 玻璃

  scene.add(houseGroup);
  return houseGroup;
};

// ============================================================================
//  11. 渲染循环
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  controls.update(); // OrbitControls 阻尼更新
  // SpotLightHelper 需要在每帧更新以反映光锥变化（位置/角度改后）
  if (SHOW_LIGHT_HELPERS) {
    lightHelpers.forEach((h) => h.update && h.update());
  }
  renderer.render(scene, camera);
};

// ============================================================================
//  12. resize 处理
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
//  13. 资源释放（dispose）—— [stage-06] 含灯光与 helper
// ============================================================================
const disposeScene = () => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener("resize", handleResize);

  // 释放灯光 helper
  lightHelpers.forEach((h) => {
    if (h.parent) h.parent.remove(h);
    if (h.dispose) h.dispose();
  });
  lightHelpers.length = 0;

  // 释放灯光（PointLight/SpotLight 的 shadow map 需手动 dispose）
  lights.forEach((l) => {
    if (l.shadow && l.shadow.map) l.shadow.map.dispose();
    if (l.parent) l.parent.remove(l);
    // DirectionalLight.target 也要移除
    if (l.target && l.target.parent) l.target.parent.remove(l.target);
  });
  lights.length = 0;

  // 遍历 disposables，释放 geometry / material / texture
  disposables.forEach((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
    if (obj.texture) obj.texture.dispose();
    // 从场景移除
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
};

// ============================================================================
//  14. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器（含天空盒、shadowMap）
  addLights(); // 2. [stage-06] 灯光系统（环境光+阳光+点光+聚光灯+阴影）
  addGround(); // 3. [stage-01] 草地（receiveShadow）
  addFoundation(); // 4. [stage-02] 地基 + 台阶
  addHouse(); // 5~9. [stage-03~05] 房子（墙+门+屋顶+烟囱+地板+窗+玻璃）
  window.addEventListener("resize", handleResize);
  animate(); // 启动渲染循环
});

onUnmounted(() => {
  disposeScene();
});
</script>

<template>
  <!-- Three.js 渲染画布：铺满整个视口 -->
  <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%" />
</template>
