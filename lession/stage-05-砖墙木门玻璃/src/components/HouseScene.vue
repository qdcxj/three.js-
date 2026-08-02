<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 05：砖墙木门玻璃
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-05）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 程序化纹理(砖墙/木纹/瓦片) + 玻璃窗(透射) + 天空盒(渐变)
 *
 *  本阶段新增教学（贴图全知识）：
 *    1) 用 CanvasTexture 程序化生成砖墙纹理 / 木纹 / 鱼鳞瓦片，不依赖任何外部图片
 *    2) 演示 UV 映射、wrapS/wrapT(RepeatWrapping/ClampToEdge)、repeat/offset
 *    3) 演示 minFilter/magFilter、anisotropy(各向异性过滤)、colorSpace(SRGB)
 *    4) 用 MeshPhysicalMaterial 的 transmission/ior/thickness 做真实玻璃窗 + 窗框
 *    5) 用程序化 Canvas 渐变贴图作 scene.background 实现天空盒
 *
 *  重要约束：所有纹理均由 Canvas 2D 实时绘制，保证快照自包含可运行。
 * ============================================================================
 */
import { ref, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ----------------------------- Vue 引用 -----------------------------
const canvasRef = ref(null);

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationId = null;

// 收集所有需要 dispose 的 geometry / material / group，便于统一释放
const disposables = [];
// 收集所有 texture，单独释放（material.dispose() 不会自动释放 map）
const textures = [];

// 程序化纹理（在 createTextures 中赋值）
let brickTex = null; // 砖墙
let woodTex = null; // 木门
let tileTex = null; // 屋顶瓦片
let skyTex = null; // 天空渐变

/**
 * 注册一个 mesh / group 到 disposables，组件卸载时统一释放。
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
  // 背景暂时留空，createTextures() 中会设为程序化天空渐变贴图

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
  // 输出颜色空间设为 sRGB，让贴图颜色显示正确（0.169 默认即为 sRGB，显式写出便于教学）
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // OrbitControls：拖拽旋转、滚轮缩放
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 启用阻尼，旋转更顺滑
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.5, 0); // 视线中心略抬到房子中部
  controls.update();
};

// ============================================================================
//  2. 灯光（让材质与玻璃可见的最简配置）
// ============================================================================
const addLights = () => {
  // 环境光：弱环境光 #404040，提供基础亮度，避免阴影面纯黑
  const ambient = new THREE.AmbientLight(0x404040, 1.0);
  scene.add(ambient);

  // 平行光：模拟阳光，暖白 #fffaf0，从 (10,15,8) 照向原点
  const sun = new THREE.DirectionalLight(0xfffaf0, 1.2);
  sun.position.set(10, 15, 8);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  // 补一束从相反方向的弱光，让背光面也能看清玻璃透射效果
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.3);
  fill.position.set(-8, 6, -6);
  scene.add(fill);
};

// ============================================================================
//  3. [stage-01] 草地
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
  scene.add(track(ground));
};

// ============================================================================
//  4. [stage-02] 地基平台 + 入口台阶
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
  scene.add(track(platform));

  // 入口台阶：两级，1.5(X) × 0.4(Z) × 0.15(Y)
  // 第一级 y=0.075（半高），第二级 y=0.225（1.5 倍高）
  const step1 = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.15, 0.4),
    foundationMat
  );
  step1.position.set(0, 0.075, 3.2);
  scene.add(track(step1));

  const step2 = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.15, 0.4),
    foundationMat
  );
  step2.position.set(0, 0.225, 3.0); // 第二级略往里收
  scene.add(track(step2));
};

// ============================================================================
//  5. [stage-05] 程序化纹理生成器（核心新增）
// ============================================================================
//
//  以下三个函数都用 Canvas 2D 实时绘制纹理，再用 THREE.CanvasTexture 包装。
//  优势：零外部依赖、快照自包含、可参数化调整；劣势：不如真实照片逼真。
//  教学要点：CanvasTexture + wrapS/wrapT + repeat + colorSpace + filter + anisotropy
// ============================================================================

/**
 * 生成砖墙纹理：暖米色底 #e6d5b8 + 砖缝网格线（running bond 错缝）。
 * 画布 256×256，含 4 列 × 8 行砖块，奇数行偏移半块，RepeatWrapping 无缝拼接。
 * @returns {THREE.CanvasTexture}
 */
const createBrickTexture = () => {
  const size = 256; // 画布尺寸（正方形，便于 RepeatWrapping 无缝）
  const cols = 4; // 砖块列数
  const rows = 8; // 砖块行数
  const bw = size / cols; // 每块砖宽 64px
  const bh = size / rows; // 每块砖高 32px
  const seam = 2; // 砖缝宽度 2px

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // 1) 先整体填砖缝颜色（深米色），后续画砖时留出 seam 即形成网格线
  ctx.fillStyle = "#a89878"; // 砖缝色（比砖体深）
  ctx.fillRect(0, 0, size, size);

  // 2) 逐块画砖：暖米色 #e6d5b8 = rgb(230,213,184)，每块加轻微随机亮度
  for (let r = 0; r < rows; r++) {
    // running bond：奇数行水平偏移半块，让竖缝错开
    const offset = (r % 2) * (bw / 2);
    // c 从 -1 到 cols，确保画布左右边缘出现半块砖，RepeatWrapping 拼接后形成整块
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset + seam / 2;
      const y = r * bh + seam / 2;
      const w = bw - seam;
      const h = bh - seam;
      // 轻微随机亮度变化（±15），让每块砖不死板
      const v = Math.floor(Math.random() * 30 - 15);
      ctx.fillStyle = `rgb(${230 + v}, ${213 + v}, ${184 + v})`;
      ctx.fillRect(x, y, w, h);
    }
  }

  // 3) 转 CanvasTexture
  const texture = new THREE.CanvasTexture(canvas);
  // wrapS/wrapT = RepeatWrapping：超出 [0,1] 的 UV 重复平铺（而非截断）
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // repeat(4,2)：U 方向重复 4 次、V 方向重复 2 次（每个墙面 4×2=8 个砖块图案）
  texture.repeat.set(4, 2);
  // offset：纹理平移（这里用默认 0,0；调大可让砖缝偏移，演示用）
  texture.offset.set(0, 0);
  // colorSpace = SRGB：颜色贴图必须设 sRGB，否则会发灰
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * 生成木纹纹理：棕色底 #8b5a2b + 垂直纹理条纹 + 木节。
 * 画布 256×512（竖向，匹配门板 1:2 比例），ClampToEdge 不重复。
 * @returns {THREE.CanvasTexture}
 */
const createWoodTexture = () => {
  const w = 256;
  const h = 512; // 竖向画布，匹配门板宽高比 1:2
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // 1) 基色：木色 #8b5a2b = rgb(139,90,43)
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(0, 0, w, h);

  // 2) 画 60 条垂直木纹：用正弦波模拟自然纹理的弯曲
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w; // 条纹基准 x
    const amp = Math.random() * 8 + 2; // 弯曲幅度
    const freq = Math.random() * 0.05 + 0.02; // 弯曲频率
    const alpha = Math.random() * 0.3 + 0.1; // 透明度
    const dark = Math.random() > 0.5;
    // 深纹（暗）与浅纹（亮）交替，模拟木材年轮的深浅
    ctx.strokeStyle = dark
      ? `rgba(80, 45, 20, ${alpha})`
      : `rgba(170, 120, 70, ${alpha})`;
    ctx.lineWidth = Math.random() * 2 + 0.5;
    ctx.beginPath();
    for (let y = 0; y < h; y += 2) {
      const xx = x + Math.sin(y * freq) * amp;
      if (y === 0) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }

  // 3) 加 3 个木节（深色径向渐变椭圆），增加真实感
  for (let i = 0; i < 3; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h;
    const rx = Math.random() * 15 + 8;
    const ry = rx * (0.6 + Math.random() * 0.4);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grad.addColorStop(0, "rgba(60, 35, 15, 0.8)");
    grad.addColorStop(1, "rgba(60, 35, 15, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4) 转 CanvasTexture
  const texture = new THREE.CanvasTexture(canvas);
  // 门板是单块木板，不需要重复平铺，用 ClampToEdgeWrapping（边缘拉伸）
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1); // 不重复
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * 生成鱼鳞瓦片纹理：砖红底 #a0522d + 重叠半圆瓦片。
 * 画布 256×256，RepeatWrapping 横竖无缝，repeat(6,4) 让屋顶瓦片密度合适。
 * @returns {THREE.CanvasTexture}
 */
const createRoofTileTexture = () => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // 1) 基色：砖红 #a0522d
  ctx.fillStyle = "#a0522d";
  ctx.fillRect(0, 0, size, size);

  // 2) 鱼鳞瓦片：逐行画半椭圆，下一行覆盖上一行下半部分
  const tileW = 64; // 每片宽
  const tileH = 48; // 每片露出高度
  const rows = Math.ceil(size / tileH) + 2;
  const cols = Math.ceil(size / tileW) + 2;

  for (let r = 0; r < rows; r++) {
    const y = r * tileH;
    const offset = (r % 2) * (tileW / 2); // 奇数行偏移半片
    for (let c = -1; c <= cols; c++) {
      const x = c * tileW + offset;
      // 每片瓦用径向渐变：中心亮（高光）、边缘暗（阴影/缝隙）
      const grad = ctx.createRadialGradient(x, y - tileH * 0.3, 2, x, y, tileW / 2);
      grad.addColorStop(0, "#c4683a"); // 顶部高光
      grad.addColorStop(0.6, "#a0522d"); // 中部砖红
      grad.addColorStop(1, "#6e3820"); // 底部阴影
      ctx.fillStyle = grad;
      ctx.beginPath();
      // 画上半椭圆（瓦片露出的弧形），canvas 中 y 向下，π~2π 为上半部分
      ctx.ellipse(x, y, tileW / 2, tileH, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3) 转 CanvasTexture
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // repeat(6,4)：屋顶面积大，多重复几次让瓦片密度合理
  texture.repeat.set(6, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * 生成天空渐变贴图：上蓝下白垂直渐变。
 * 画布 16×256（细长，只为携带垂直渐变），作 scene.background 全屏拉伸。
 * @returns {THREE.CanvasTexture}
 */
const createSkyTexture = () => {
  const w = 16;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // 垂直渐变：顶部深蓝 → 中部天蓝 → 底部近白（地平线）
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#4a7fc1"); // 天顶深蓝
  grad.addColorStop(0.5, "#87ceeb"); // 中部天蓝
  grad.addColorStop(1, "#e8f0f5"); // 地平线近白
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * 集中创建所有纹理，并设置 filter / anisotropy 等采样参数。
 * 必须在 renderer 创建后调用（anisotropy 依赖 renderer.capabilities）。
 */
const createTextures = () => {
  brickTex = createBrickTexture();
  woodTex = createWoodTexture();
  tileTex = createRoofTileTexture();
  skyTex = createSkyTexture();

  // 演示 filter 与 anisotropy：对 3 张物体贴图统一设置采样参数
  // anisotropy：各向异性过滤，缓解斜视角下纹理模糊（地面/墙面斜看时最明显）
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  [brickTex, woodTex, tileTex].forEach((t) => {
    // minFilter：纹理被缩小（远）时用 LinearMipmapLinearFilter（三线性 + Mipmap），最平滑
    t.minFilter = THREE.LinearMipmapLinearFilter;
    // magFilter：纹理被放大（近）时用 LinearFilter（双线性），无 Mipmap
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = maxAniso; // 各向异性等级拉满
    t.needsUpdate = true;
  });

  // 天空贴图作为场景背景（全屏拉伸渲染）
  scene.background = skyTex;

  // 收集到 textures 数组，dispose 时统一释放
  textures.push(brickTex, woodTex, tileTex, skyTex);
};

// ============================================================================
//  6. [stage-03] 四面墙（含门洞/窗洞）+ 木门板（stage-05 加砖墙/木纹贴图）
// ============================================================================
const addWallsAndDoor = (houseGroup) => {
  // 外墙材质：stage-05 给 map 贴砖墙纹理。
  // 注意：使用 map 时 color 应设白色 0xffffff，避免对贴图二次染色。
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // 白色 = 不染色，让砖墙纹理原色显示
    map: brickTex, // 砖墙 CanvasTexture
    roughness: 0.9,
    metalness: 0.0,
  });

  // 木门材质：贴木纹纹理
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodTex, // 木纹 CanvasTexture
    roughness: 0.6,
    metalness: 0.0,
  });

  // 墙体尺寸常量（来自 HOUSE_SPEC）
  // 墙厚 0.2，墙高 3.0，墙中心 y=1.8（即墙顶 y=3.3，墙底 y=0.3 与地基顶齐平）
  const WT = 0.2; // 墙厚

  // 辅助函数：创建墙块并加到 houseGroup
  const block = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    houseGroup.add(track(m));
    return m;
  };

  // ---- 后墙：8(X) × 3(Y) × 0.2(Z)，整体一块（无洞），中心 (0,1.8,-3) ----
  block(8, 3, WT, 0, 1.8, -3);

  // ---- 左墙：0.2(X) × 3(Y) × 6(Z)，中心 (-4,1.8,0)，含 1 个侧窗洞 ----
  // 侧窗洞尺寸：1.2(Z) × 1.2(Y)，中心 (±4, 1.5, 0)
  // 拆分 4 块：
  //   1) 下行 y∈[0.3,0.9] 高 0.6，整深 6m，中心 (-4, 0.6, 0)
  block(WT, 0.6, 6, -4, 0.6, 0);
  //   2) 中行 y∈[0.9,2.1] 高 1.2，避窗洞 z∈[-0.6,0.6]，左右两块
  block(WT, 1.2, 2.4, -4, 1.5, -1.8); // z∈[-3,-0.6]
  block(WT, 1.2, 2.4, -4, 1.5, 1.8); //  z∈[0.6,3]
  //   3) 上行 y∈[2.1,3.3] 高 1.2，整深 6m，中心 (-4, 2.7, 0)
  block(WT, 1.2, 6, -4, 2.7, 0);

  // ---- 右墙：对称（X=+4）----
  block(WT, 0.6, 6, 4, 0.6, 0);
  block(WT, 1.2, 2.4, 4, 1.5, -1.8);
  block(WT, 1.2, 2.4, 4, 1.5, 1.8);
  block(WT, 1.2, 6, 4, 2.7, 0);

  // ---- 前墙：8(X) × 3(Y) × 0.2(Z)，含 1 门洞 + 2 窗洞，z=3 ----
  // 门洞：1.0(X) × 2.0(Y)，中心 (0, 1.3, 3) → x∈[-0.5,0.5], y∈[0.3,2.3]
  // 前窗洞×2：0.8(X) × 1.2(Y)，中心 (±2, 1.5, 3) → x∈[±1.6,±2.4], y∈[0.9,2.1]
  // 拆分 8 块（按行切）：
  //   1) 下行 y∈[0.3,0.9] 高 0.6，整宽 8m，中心 (0, 0.6, 3)
  block(8, 0.6, WT, 0, 0.6, 3);
  //   2) 中行 y∈[0.9,2.1] 高 1.2，避 3 个洞，4 块
  block(1.6, 1.2, WT, -3.2, 1.5, 3); // x∈[-4,-2.4] 左窗洞左
  block(1.1, 1.2, WT, -1.05, 1.5, 3); // x∈[-1.6,-0.5] 左窗洞右-门洞左
  block(1.1, 1.2, WT, 1.05, 1.5, 3); //  x∈[0.5,1.6] 门洞右-右窗洞左
  block(1.6, 1.2, WT, 3.2, 1.5, 3); //   x∈[2.4,4] 右窗洞右
  //   3) 上行 y∈[2.1,3.3] 高 1.2，门洞只到 y=2.3，所以分 2 小块+1 整块
  block(3.5, 0.2, WT, -2.25, 2.2, 3); // y∈[2.1,2.3] 门洞上方 0.2m 高，左半
  block(3.5, 0.2, WT, 2.25, 2.2, 3); //  y∈[2.1,2.3] 门洞上方 0.2m 高，右半
  block(8, 1.0, WT, 0, 2.8, 3); //      y∈[2.3,3.3] 顶部整宽

  // ---- 木门板：1.0(X) × 2.0(Y) × 0.05(Z)，中心 (0, 1.3, 3.125) ----
  // 略凸出墙面（墙厚 0.2 在 z∈[2.9,3.1]，门板贴在墙外表面 z=3.1 处，门中心 z=3.125）
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.05), doorMat);
  door.position.set(0, 1.3, 3.125);
  houseGroup.add(track(door));
};

// ============================================================================
//  7. [stage-04] 尖屋顶（双坡顶 + 山墙）—— stage-05 加瓦片贴图
// ============================================================================
const addRoof = (houseGroup) => {
  // 屋顶材质：贴鱼鳞瓦片纹理
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tileTex, // 瓦片 CanvasTexture
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide, // 双面渲染（屋檐下也能看见）
  });

  // 山墙材质：保持纯色 #e6d5b8（三角形 ExtrudeGeometry 的 UV 不规则，不上贴图更干净）
  const gableMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // ---- 屋顶几何参数（精确推导，同 stage-04）----
  const ridgeY = 5.0; // 屋脊高度
  const eaveY = 3.3; // 屋檐高度（= 墙顶）
  const halfSpan = 4.0; // 半跨度 X
  const ridgeLen = 6.6; // 屋脊长度 Z（墙深 6m + 出挑 0.3m×2）
  const slopeLen = Math.sqrt(halfSpan * halfSpan + (ridgeY - eaveY) ** 2); // 斜坡长 ≈ 4.347
  const slopeAngle = Math.atan((ridgeY - eaveY) / halfSpan); // 坡度角 ≈ 0.4014 rad ≈ 23.04°

  // ---- 左坡板 ----
  const leftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  leftRoof.position.set(-2, 4.15, 0);
  leftRoof.rotation.z = slopeAngle; // 绕 Z 轴正方向旋转
  houseGroup.add(track(leftRoof));

  // ---- 右坡板：对称 ----
  const rightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  rightRoof.position.set(2, 4.15, 0);
  rightRoof.rotation.z = -slopeAngle; // 反向倾斜
  houseGroup.add(track(rightRoof));

  // ---- 前山墙：三角形封堵（Shape + ExtrudeGeometry）----
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-4, 0);
  gableShape.lineTo(4, 0);
  gableShape.lineTo(0, 1.7);
  gableShape.lineTo(-4, 0); // 闭合
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 0.2,
    bevelEnabled: false,
  });

  const frontGable = new THREE.Mesh(gableGeo, gableMat);
  frontGable.position.set(0, 3.3, 3.0);
  houseGroup.add(track(frontGable));

  const backGable = new THREE.Mesh(gableGeo, gableMat);
  backGable.position.set(0, 3.3, -3.2);
  houseGroup.add(track(backGable));
};

// ============================================================================
//  8. [stage-04] 烟囱 + 室内地板（保持纯色，无贴图）
// ============================================================================
const addChimneyAndFloor = (houseGroup) => {
  // 烟囱：0.6(X) × 1.5(Y) × 0.6(Z)，中心 (2, 4.5, -1.5)，信息灰 #909399
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
  houseGroup.add(track(chimney));

  // 室内地板：7.6(X) × 0.05(Y) × 5.6(Z)，中心 (0, 0.325, 0)，浅木色 #d2b48c
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
  houseGroup.add(track(floor));
};

// ============================================================================
//  9. [stage-05] 玻璃窗 + 窗框（核心新增）
// ============================================================================
//
//  每个窗户 = 1 块 MeshPhysicalMaterial 玻璃 + 4 根 BoxGeometry 窗框边 + 十字窗棂
//  玻璃用 transmission(透射) 实现真实折射，roughness=0 全透明，ior=1.5 玻璃折射率
// ============================================================================

/**
 * 创建一扇窗户（玻璃 + 窗框 + 十字窗棂），返回 Group。
 * 默认尺寸 0.8×1.2（匹配前墙窗洞），可绕 Y 旋转适配侧墙。
 * @param {number} width 窗框外宽
 * @param {number} height 窗框外高
 * @returns {THREE.Group}
 */
const createWindow = (width = 0.8, height = 1.2) => {
  const group = new THREE.Group();

  // ---- 窗框材质：Element Plus 主色 #409eff，半光泽 ----
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x409eff,
    roughness: 0.4,
    metalness: 0.3,
  });

  // ---- 玻璃材质：MeshPhysicalMaterial 透射玻璃 ----
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa8d0ff, // 浅蓝玻璃色
    transmission: 1.0, // 完全透射（光线穿过）
    roughness: 0.0, // 完全光滑（清晰无磨砂）
    ior: 1.5, // 玻璃折射率（空气 1.0，水 1.33，玻璃 1.5）
    thickness: 0.1, // 玻璃厚度（影响折射位移程度）
    transparent: true, // 开启透明渲染通道
    side: THREE.DoubleSide, // 双面可见（室内外都能看）
  });

  const border = 0.04; // 窗框边宽
  const t = 0.06; // 窗框厚度（沿墙面方向）

  // ---- 玻璃：0.72 × 1.12 × 0.02 ----
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(width - 2 * border, height - 2 * border, 0.02),
    glassMat
  );
  group.add(track(glass));

  // ---- 4 根窗框边（上/下/左/右）----
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, border, t), frameMat);
  top.position.set(0, height / 2 - border / 2, 0);
  group.add(track(top));

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(width, border, t), frameMat);
  bottom.position.set(0, -height / 2 + border / 2, 0);
  group.add(track(bottom));

  const left = new THREE.Mesh(new THREE.BoxGeometry(border, height, t), frameMat);
  left.position.set(-width / 2 + border / 2, 0, 0);
  group.add(track(left));

  const right = new THREE.Mesh(new THREE.BoxGeometry(border, height, t), frameMat);
  right.position.set(width / 2 - border / 2, 0, 0);
  group.add(track(right));

  // ---- 十字窗棂（mullion）：把玻璃分 4 格，更欧式 ----
  const mullionH = new THREE.Mesh(
    new THREE.BoxGeometry(width - 2 * border, border * 0.6, t * 0.6),
    frameMat
  );
  group.add(track(mullionH));

  const mullionV = new THREE.Mesh(
    new THREE.BoxGeometry(border * 0.6, height - 2 * border, t * 0.6),
    frameMat
  );
  group.add(track(mullionV));

  return group;
};

/**
 * 在 4 个窗洞位置放置玻璃窗。
 * 前墙窗洞×2：(±2, 1.5, 3)，朝 +Z 不旋转
 * 侧墙窗洞×2：(±4, 1.5, 0)，绕 Y 旋转 90° 让窗面朝 ±X
 */
const addWindows = (houseGroup) => {
  // 前墙左窗
  const frontLeft = createWindow();
  frontLeft.position.set(-2, 1.5, 3.0);
  houseGroup.add(frontLeft);

  // 前墙右窗
  const frontRight = createWindow();
  frontRight.position.set(2, 1.5, 3.0);
  houseGroup.add(frontRight);

  // 左墙窗：绕 Y 旋转 90°，窗面从朝 +Z 变为朝 -X
  const leftWin = createWindow();
  leftWin.position.set(-4, 1.5, 0);
  leftWin.rotation.y = Math.PI / 2;
  houseGroup.add(leftWin);

  // 右墙窗：对称
  const rightWin = createWindow();
  rightWin.position.set(4, 1.5, 0);
  rightWin.rotation.y = Math.PI / 2;
  houseGroup.add(rightWin);
};

// ============================================================================
//  10. 组装整个房子（House Group）
// ============================================================================
const addHouse = () => {
  // 用 Group 把房子所有部件组织在一起，便于整体移动/旋转
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";

  addWallsAndDoor(houseGroup); // [stage-03~05] 墙 + 门（含贴图）
  addRoof(houseGroup); // [stage-04~05] 屋顶 + 山墙（含瓦片贴图）
  addChimneyAndFloor(houseGroup); // [stage-04] 烟囱 + 室内地板
  addWindows(houseGroup); // [stage-05] 4 扇玻璃窗

  scene.add(track(houseGroup));
  return houseGroup;
};

// ============================================================================
//  11. 渲染循环
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  controls.update(); // OrbitControls 阻尼更新
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
//  13. 资源释放（dispose）—— stage-05 新增 texture.dispose()
// ============================================================================
const disposeScene = () => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener("resize", handleResize);

  // 遍历 disposables，释放 geometry / material
  disposables.forEach((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
    // 从场景移除
    if (obj.parent) obj.parent.remove(obj);
  });
  disposables.length = 0;

  // 单独释放所有 texture（material.dispose() 不会自动释放其 map）
  textures.forEach((t) => t.dispose());
  textures.length = 0;

  if (controls) controls.dispose();
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  scene = null;
  camera = null;
  renderer = null;
  controls = null;
  brickTex = null;
  woodTex = null;
  tileTex = null;
  skyTex = null;
};

// ============================================================================
//  14. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器
  createTextures(); // 2. [stage-05] 程序化纹理 + 天空盒（依赖 renderer）
  addLights(); // 3. 灯光
  addGround(); // 4. [stage-01] 草地
  addFoundation(); // 5. [stage-02] 地基 + 台阶
  addHouse(); // 6~9. [stage-03~05] 房子（墙+门+屋顶+烟囱+地板+玻璃窗）
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
