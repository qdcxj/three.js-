<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 11：氛围营造（后期处理）
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-11）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 砖墙/木门贴图（程序化 CanvasTexture）
 *    [stage-06] 阳光/环境光/室内点光源/壁灯聚光灯 + 阴影
 *    [stage-07] OrbitControls（含阻尼）
 *    [stage-08] 开关门动画(O) + 开关灯(L) + 昼夜自动循环
 *    [stage-09] 家具（本快照简化为程序化木箱/桌椅占位，避免外部 GLTF 依赖）
 *    [stage-10] 玻璃着色器(Fresnel 边缘高光) + 草地着色器(时间驱动波纹)
 *    [stage-11] 后期处理：EffectComposer = RenderPass → UnrealBloomPass
 *               → BokehPass → OutputPass，ACESFilmic 色调映射
 *
 *  本阶段新增教学：
 *    1) EffectComposer 后期合成器：把"渲染到屏幕"改为"渲染到离屏纹理 → 多个
 *       Pass 流水线加工 → OutputPass 输出"
 *    2) UnrealBloomPass：strength=0.6 / radius=0.4 / threshold=0.85，让室内
 *       灯泡、玻璃边缘高光、壁灯产生电影级辉光
 *    3) BokehPass：景深（DoF），focus=12 / aperture=0.0025 / maxblur=0.008
 *    4) ACESFilmicToneMapping + OutputPass：HDR 线性 → 电影级色调 → sRGB 屏幕
 *    5) 渲染循环用 composer.render() 替代 renderer.render()；resize 同步 composer
 *    6) 完整 dispose：composer / 每个 pass / renderer / controls / 全部 geometry+material
 *
 *  操作：
 *    鼠标拖拽=旋转 / 滚轮=缩放 / O=开关门 / L=开关灯 / B=开关 Bloom / D=开关景深
 * ============================================================================
 */
import { ref, reactive, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// [stage-11] 后期处理相关模块
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// ----------------------------- Vue 引用 / 响应式 UI -----------------------------
const canvasRef = ref(null);

// UI 文案状态（驱动 template 中的提示卡片）
const ui = reactive({
  doorState: "关闭",
  lampState: "关闭",
  phase: "白天",
  bloomState: "开启", // [stage-11] Bloom 当前状态
  dofState: "开启", // [stage-11] 景深当前状态
});

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let clock = null;
let animationId = null;

// [stage-11] 后期合成器与各 Pass
let composer = null;
let bloomPass = null;
let bokehPass = null;
let outputPass = null;
let bloomEnabled = true; // B 键切换
let dofEnabled = true; // D 键切换

// 收集所有需要 dispose 的 geometry / material / 纹理 / Pass，便于统一释放
const disposables = [];
const track = (obj) => {
  disposables.push(obj);
  return obj;
};

// ----------------------------- [stage-10] 着色器 uniforms -----------------------------
// 草地着色器与玻璃着色器共享的时间 uniform；每帧在 animate 中更新
const shaderUniforms = {
  uTime: { value: 0 },
  uLampIntensity: { value: 0 }, // 玻璃着色器读取：让玻璃在开灯时边缘辉光
};

// ----------------------------- 动画状态变量（stage-08 继承） -----------------------------
let doorGroup = null;
let doorState = 0; // 0 关 / 1 开
let doorAngle = 0;

let indoorLamp = null; // 室内点光源
let lampBulb = null; // [stage-11] 室内灯泡网格（MeshBasicMaterial，bloom 捕捉对象）
let wallLampBulbs = []; // [stage-11] 壁灯灯泡网格 ×2
let lampOn = false;
let lampIntensity = 0;

let sunLight = null;
let ambientLight = null;
let cycleTime = 0;
const DAY_PERIOD = 24;
const DAY_SUN_COLOR = new THREE.Color(0xfffaf0);
const NIGHT_SUN_COLOR = new THREE.Color(0x6f8fff);
const DAY_SKY_COLOR = new THREE.Color(0x87ceeb);
const NIGHT_SKY_COLOR = new THREE.Color(0x0a0f2a);
const DAY_AMBIENT = 0.55;
const NIGHT_AMBIENT = 0.12;
const DAY_SUN_INTENSITY = 1.4;
const NIGHT_SUN_INTENSITY = 0.25;

const _tmpSunColor = new THREE.Color();
const _tmpSkyColor = new THREE.Color();

// ============================================================================
//  1. 场景 / 相机 / 渲染器 / 控制器
// ============================================================================
const initScene = () => {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  // [stage-11] 雾：增加远景层次感，配合景深效果更佳
  scene.fog = new THREE.Fog(0x87ceeb, 25, 60);

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // [stage-11] 色调映射：ACES Filmic（电影级）
  // 注意：必须在创建 OutputPass 之前设置，因为 OutputPass 在构造时读取
  // renderer.toneMapping 来决定其片元着色器中的色调映射算法
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.5, 0);
  controls.minDistance = 4;
  controls.maxDistance = 40;
  controls.update();

  clock = new THREE.Clock();
};

// ============================================================================
//  2. [stage-05] 程序化贴图（砖墙 / 木纹）—— 墙体与门板使用
// ============================================================================
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

// ============================================================================
//  3. [stage-06] 灯光（阳光 + 环境光 + 室内点光源 + 壁灯聚光灯 + 阴影 + 灯泡）
// ============================================================================
const addLights = () => {
  ambientLight = new THREE.AmbientLight(0xffffff, DAY_AMBIENT);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(DAY_SUN_COLOR.getHex(), DAY_SUN_INTENSITY);
  sunLight.position.set(10, 15, 8);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 60;
  sunLight.shadow.camera.left = -15;
  sunLight.shadow.camera.right = 15;
  sunLight.shadow.camera.top = 15;
  sunLight.shadow.camera.bottom = -15;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // 室内点光源：暖黄，初始 0（关灯）
  indoorLamp = new THREE.PointLight(0xffd27a, 0, 12, 2);
  indoorLamp.position.set(0, 2.8, 0);
  indoorLamp.castShadow = true;
  indoorLamp.shadow.mapSize.set(512, 512);
  scene.add(indoorLamp);

  // [stage-11] 室内灯泡网格：MeshBasicMaterial 不受光照影响（纯自发光），
  // 其颜色直接输出到线性缓冲区。开灯时把线性颜色提到 >1.0（HDR），
  // UnrealBloomPass 的 threshold=0.85 就会捕捉到它，形成温暖辉光。
  const bulbMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.9,
  });
  // 用 setRGB + LinearSRGBColorSpace 直接写入线性值，便于 HDR 控制
  bulbMat.color.setRGB(0, 0, 0, THREE.LinearSRGBColorSpace);
  lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), bulbMat);
  lampBulb.position.set(0, 2.8, 0);
  scene.add(track(lampBulb));

  // 壁灯聚光灯 ×2 + 壁灯灯泡 ×2
  const makeWallLamp = (x) => {
    const spot = new THREE.SpotLight(
      0xffe4b5,
      0,
      8,
      Math.PI / 5,
      0.4,
      1.5
    );
    spot.position.set(x, 2.5, -2.8);
    spot.target.position.set(x, 0.5, 0);
    scene.add(spot);
    scene.add(spot.target);
    spot.userData.isWallLamp = true;
    track(spot);

    // 壁灯灯泡（纯自发光小球）
    const wbMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.95,
    });
    wbMat.color.setRGB(0, 0, 0, THREE.LinearSRGBColorSpace);
    const wb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), wbMat);
    wb.position.set(x, 2.5, -2.7);
    scene.add(track(wb));
    wallLampBulbs.push(wb);
  };
  makeWallLamp(-2);
  makeWallLamp(2);
};

// ============================================================================
//  4. [stage-10] 草地着色器（ShaderMaterial：时间驱动波纹 + 程序化配色）
// ============================================================================
/**
 * 草地着色器说明：
 *   - 顶点着色器：对 PlaneGeometry 的顶点做轻微 wind 位移（沿局部 Z，旋转后即世界 Y），
 *     营造风吹草动的波动。配合 32×32 分段，足够平滑。
 *   - 片元着色器：用 UV + hash 噪声生成深浅交错的草色，再叠加一条随时间流动的
 *     横向亮纹，模拟阳光掠过草地的光影。
 *   - 注意：ShaderMaterial 默认不接收/投射阴影。此处用程序化配色 + bloom 氛围
 *     弥补，整体视觉依然饱满（house 自身仍投影到地基/墙/屋顶上）。
 */
const GRASS_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // 风的位移：基于顶点 x、y 与时间的正弦组合
    float wave = sin(pos.x * 0.6 + uTime * 1.5) * 0.06
               + sin(pos.y * 0.8 + uTime * 1.1) * 0.05;
    pos.z += wave;            // 局部 Z → 旋转后世界 Y（向上）
    vWave = wave;             // 传给片元做明暗
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const GRASS_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  // 简易 hash 噪声
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // 两层不同尺度的噪点，得到自然的草丛深浅
    float n1 = hash(floor(vUv * 60.0));
    float n2 = hash(floor(vUv * 240.0));
    float n = n1 * 0.7 + n2 * 0.3;

    // Element Plus 成功绿 #67c23a → 线性近似
    vec3 base = vec3(0.40, 0.76, 0.23);
    vec3 dark = vec3(0.28, 0.55, 0.16);
    vec3 color = mix(dark, base, n);

    // 流动的横向亮纹（模拟阳光掠过）
    float stripe = sin(vUv.y * 120.0 + uTime * 1.8) * 0.5 + 0.5;
    color += vec3(0.06, 0.08, 0.04) * stripe * 0.4;

    // 受风浪影响的明暗微调
    color += vec3(0.04) * vWave * 4.0;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const addGround = () => {
  const groundGeo = new THREE.PlaneGeometry(40, 40, 32, 32);
  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shaderUniforms.uTime,
    },
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
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

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, 6),
    foundationMat
  );
  platform.position.set(0, 0.15, 0);
  platform.castShadow = true;
  platform.receiveShadow = true;
  scene.add(track(platform));

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
//  6. [stage-03 + stage-08 + stage-10] 墙(含洞) + 木门(门轴) + 玻璃着色器
// ============================================================================
/**
 * 玻璃着色器说明（stage-10）：
 *   - 顶点着色器：把法线与视向(viewDirection)传到片元
 *   - 片元着色器：Fresnel = pow(1 - dot(N, V), power)，视角越掠射边缘越亮
 *   - 把 Fresnel 强度乘以 (0.5 + uLampIntensity * 1.6)：白天边缘淡淡反光，
 *     夜晚开灯后边缘线性值突破 0.85，UnrealBloomPass 会捕捉成辉光
 *   - 透明度也由 Fresnel 驱动：正对视角半透，边缘更实
 */
const GLASS_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const GLASS_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uLampIntensity;
  uniform vec3 uBaseColor;
  uniform vec3 uRimColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.5);
    // 基础玻璃色（浅蓝 #a8d0ff 线性近似）
    vec3 color = uBaseColor;
    // 边缘辉光：白天淡，夜晚开灯强（HDR > 0.85 触发 Bloom）
    float glow = fresnel * (0.45 + uLampIntensity * 1.6);
    color += uRimColor * glow;
    // 透明度：正面更透，边缘更实
    float alpha = 0.35 + fresnel * 0.45;
    gl_FragColor = vec4(color, alpha);
  }
`;

const addWallsAndDoor = (houseGroup) => {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    map: makeBrickTexture(),
    roughness: 0.9,
    metalness: 0.0,
  });

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    map: makeWoodTexture(),
    roughness: 0.6,
    metalness: 0.0,
  });

  const WT = 0.2;
  const block = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    houseGroup.add(track(m));
    return m;
  };

  // 后墙
  block(8, 3, WT, 0, 1.8, -3);
  // 左墙（含侧窗洞）
  block(WT, 0.6, 6, -4, 0.6, 0);
  block(WT, 1.2, 2.4, -4, 1.5, -1.8);
  block(WT, 1.2, 2.4, -4, 1.5, 1.8);
  block(WT, 1.2, 6, -4, 2.7, 0);
  // 右墙（对称）
  block(WT, 0.6, 6, 4, 0.6, 0);
  block(WT, 1.2, 2.4, 4, 1.5, -1.8);
  block(WT, 1.2, 2.4, 4, 1.5, 1.8);
  block(WT, 1.2, 6, 4, 2.7, 0);
  // 前墙（含门洞 + 2 窗洞）
  block(8, 0.6, WT, 0, 0.6, 3);
  block(1.6, 1.2, WT, -3.2, 1.5, 3);
  block(1.1, 1.2, WT, -1.05, 1.5, 3);
  block(1.1, 1.2, WT, 1.05, 1.5, 3);
  block(1.6, 1.2, WT, 3.2, 1.5, 3);
  block(3.5, 0.2, WT, -2.25, 2.2, 3);
  block(3.5, 0.2, WT, 2.25, 2.2, 3);
  block(8, 1.0, WT, 0, 2.8, 3);

  // ---- [stage-10] 玻璃 ×4：使用 ShaderMaterial（Fresnel + 受灯光驱动）----
  const glassMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shaderUniforms.uTime,
      uLampIntensity: shaderUniforms.uLampIntensity,
      uBaseColor: { value: new THREE.Color(0x3a5a8a) }, // 线性暗蓝
      uRimColor: { value: new THREE.Color(0x9ec5ff) }, // 浅蓝边缘
    },
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
    transparent: true,
    depthWrite: false, // 玻璃不写深度，避免遮挡内部灯光导致 bloom 失效
    side: THREE.DoubleSide,
  });

  // 前墙 2 窗
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
  // 侧墙 2 窗
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

  // ---- [stage-08] 木门 + 门轴 pivot ----
  doorGroup = new THREE.Group();
  doorGroup.position.set(-0.5, 1.3, 3.125);
  doorGroup.rotation.y = 0;

  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.05),
    doorMat
  );
  doorPanel.position.set(0.5, 0, 0);
  doorPanel.castShadow = true;
  doorPanel.receiveShadow = true;
  doorGroup.add(doorPanel);
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
//  9. [stage-09 简化] 程序化家具占位（木箱 + 桌子 + 椅子）
// ============================================================================
const addFurniture = (houseGroup) => {
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.7,
    metalness: 0.0,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c3a1e,
    roughness: 0.7,
    metalness: 0.0,
  });

  // 中央桌子
  const tableTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.08, 0.9),
    woodMat
  );
  tableTop.position.set(0, 0.85, 0);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  houseGroup.add(track(tableTop));

  const makeLeg = (x, z) => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.8, 0.08),
      darkWoodMat
    );
    leg.position.set(x, 0.425, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    houseGroup.add(track(leg));
  };
  makeLeg(-0.7, -0.35);
  makeLeg(0.7, -0.35);
  makeLeg(-0.7, 0.35);
  makeLeg(0.7, 0.35);

  // 椅子（简化为一个小方块占位）
  const chair = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.5, 0.4),
    darkWoodMat
  );
  chair.position.set(-1.4, 0.575, 0);
  chair.castShadow = true;
  chair.receiveShadow = true;
  houseGroup.add(track(chair));

  // 角落木箱
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    woodMat
  );
  crate.position.set(2.8, 0.725, -2.0);
  crate.castShadow = true;
  crate.receiveShadow = true;
  houseGroup.add(track(crate));
};

// ============================================================================
//  10. 组装整个房子
// ============================================================================
const addHouse = () => {
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";
  addWallsAndDoor(houseGroup);
  addRoof(houseGroup);
  addChimneyAndFloor(houseGroup);
  addFurniture(houseGroup); // [stage-09 简化]
  scene.add(houseGroup);
  return houseGroup;
};

// ============================================================================
//  11. [stage-11] 后期处理：EffectComposer 流水线
// ============================================================================
/**
 * 后期管线（按顺序串联，每个 Pass 的输出作为下一个 Pass 的输入）：
 *
 *   场景 ─→ [RenderPass]      渲染场景到离屏纹理（线性空间，未做色调映射）
 *              │
 *              ▼
 *          [UnrealBloomPass]  提取亮度 > 0.85 的像素 → 高斯模糊 → 叠加辉光
 *              │
 *              ▼
 *          [BokehPass]        基于深度图的景深模糊，焦点 12m 处清晰，远近虚化
 *              │
 *              ▼
 *          [OutputPass]       ACESFilmic 色调映射 + sRGB 编码 → 输出到屏幕
 *
 *  关键点：
 *   - RenderPass 输出的是线性 HDR 数据（材质在渲染到 RenderTarget 时不做色调映射），
 *     所以 UnrealBloomPass 的 threshold=0.85 是在线性空间比较，符合物理直觉。
 *   - OutputPass 必须放在最后，它读取 renderer.toneMapping（此处为 ACESFilmic）
 *     完成色调映射，并把线性数据转成 sRGB 显示。
 *   - composer.render() 替代 renderer.render()；resize 时调用 composer.setSize。
 */
const initPostProcessing = () => {
  composer = new EffectComposer(renderer);

  // Pass 1：RenderPass —— 把场景渲染到离屏纹理
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  track(renderPass);

  // Pass 2：UnrealBloomPass —— 辉光
  //   strength  = 0.6  辉光强度
  //   radius    = 0.4  辉光半径（高斯模糊扩散范围）
  //   threshold = 0.85 亮度阈值（线性空间，超过才发光）
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,
    0.4,
    0.85
  );
  composer.addPass(bloomPass);
  track(bloomPass);

  // Pass 3：BokehPass —— 景深
  //   focus    = 12.0  焦点距离（约等于相机到房子的距离，单位：米）
  //   aperture = 0.0025 光圈（越大越虚）
  //   maxblur  = 0.008 最大模糊量（保持较低，避免画面糊成一团）
  bokehPass = new BokehPass(scene, camera, {
    focus: 12.0,
    aperture: 0.0025,
    maxblur: 0.008,
  });
  composer.addPass(bokehPass);
  track(bokehPass);

  // Pass 4：OutputPass —— 色调映射 + sRGB 输出（必须最后）
  outputPass = new OutputPass();
  composer.addPass(outputPass);
  track(outputPass);
};

// ============================================================================
//  12. 键盘交互：O 门 / L 灯 / B Bloom / D 景深
// ============================================================================
const onKeyDown = (e) => {
  const key = e.key.toLowerCase();
  if (key === "o") {
    doorState = doorState === 0 ? 1 : 0;
    ui.doorState = doorState === 1 ? "开启" : "关闭";
  } else if (key === "l") {
    lampOn = !lampOn;
    ui.lampState = lampOn ? "开启" : "关闭";
  } else if (key === "b") {
    // [stage-11] 切换 Bloom
    bloomEnabled = !bloomEnabled;
    if (bloomPass) bloomPass.enabled = bloomEnabled;
    ui.bloomState = bloomEnabled ? "开启" : "关闭";
  } else if (key === "d") {
    // [stage-11] 切换景深
    dofEnabled = !dofEnabled;
    if (bokehPass) bokehPass.enabled = dofEnabled;
    ui.dofState = dofEnabled ? "开启" : "关闭";
  }
};

// ============================================================================
//  13. 帧率无关动画（stage-08 继承 + stage-10/11 扩展）
// ============================================================================
const updateDoor = (dt) => {
  if (!doorGroup) return;
  const targetAngle = doorState * (Math.PI / 2);
  const speed = 8;
  doorAngle += (targetAngle - doorAngle) * Math.min(1, speed * dt);
  doorGroup.rotation.y = doorAngle;
};

const updateLamp = (dt) => {
  if (!indoorLamp) return;
  const target = lampOn ? 1.0 : 0.0;
  const speed = 5;
  lampIntensity += (target - lampIntensity) * Math.min(1, speed * dt);
  indoorLamp.intensity = lampIntensity * 1.5;

  // 壁灯强度跟随
  disposables.forEach((obj) => {
    if (obj.userData && obj.userData.isWallLamp) {
      obj.intensity = lampIntensity * 1.2;
    }
  });

  // [stage-11] 更新灯泡 HDR 颜色：开灯时线性值 > 0.85 触发 Bloom
  // 暖黄色 (1.6, 1.25, 0.55) 线性 → bloom 捕捉
  if (lampBulb) {
    const k = lampIntensity;
    lampBulb.material.color.setRGB(
      1.6 * k,
      1.25 * k,
      0.55 * k,
      THREE.LinearSRGBColorSpace
    );
    lampBulb.material.opacity = 0.4 + 0.6 * k;
  }
  wallLampBulbs.forEach((b) => {
    const k = lampIntensity;
    b.material.color.setRGB(
      1.5 * k,
      1.2 * k,
      0.5 * k,
      THREE.LinearSRGBColorSpace
    );
    b.material.opacity = 0.4 + 0.6 * k;
  });

  // [stage-10] 把灯强度同步给玻璃着色器，让玻璃边缘随灯光发光
  shaderUniforms.uLampIntensity.value = lampIntensity;
};

const updateDayNight = (dt) => {
  cycleTime = (cycleTime + dt) % DAY_PERIOD;
  const t = cycleTime / DAY_PERIOD;
  const dayFactor = (Math.cos(t * Math.PI * 2) + 1) / 2;

  _tmpSunColor.copy(NIGHT_SUN_COLOR).lerp(DAY_SUN_COLOR, dayFactor);
  sunLight.color.copy(_tmpSunColor);
  sunLight.intensity =
    NIGHT_SUN_INTENSITY + (DAY_SUN_INTENSITY - NIGHT_SUN_INTENSITY) * dayFactor;

  ambientLight.intensity =
    NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * dayFactor;

  _tmpSkyColor.copy(NIGHT_SKY_COLOR).lerp(DAY_SKY_COLOR, dayFactor);
  scene.background.copy(_tmpSkyColor);
  // 雾色跟随天空
  if (scene.fog) scene.fog.color.copy(_tmpSkyColor);

  // 阳光轨迹
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
//  14. 渲染循环（stage-11：用 composer.render 替代 renderer.render）
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // 更新着色器时间 uniform（草地波纹 + 玻璃 Fresnel 都用到）
  shaderUniforms.uTime.value += dt;

  controls.update();
  updateDoor(dt);
  updateLamp(dt);
  updateDayNight(dt);

  // [stage-11] 关键改动：用 EffectComposer 渲染，串联所有 Pass
  // 若 composer 不可用则回退到普通渲染（容错）
  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
};

// ============================================================================
//  15. resize 处理（stage-11：同步 composer.setSize）
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // [stage-11] 同步 composer 与 bloom 分辨率
  if (composer) {
    composer.setSize(w, h);
    if (bloomPass) bloomPass.setSize(w, h);
  }
};

// ============================================================================
//  16. 资源释放（dispose，含 composer / passes）
// ============================================================================
const disposeScene = () => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", onKeyDown);

  // 释放 doorGroup 子级
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

  // 释放 disposables 中收集的 geometry / material / 纹理 / 灯光 target
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
  wallLampBulbs = [];

  // [stage-11] 释放后期 Pass（EffectComposer 会在 dispose 时一并释放内部
  // renderTarget，但单独调用每个 pass 的 dispose 更稳妥）
  if (bloomPass) {
    bloomPass.dispose?.();
    bloomPass = null;
  }
  if (bokehPass) {
    bokehPass.dispose?.();
    bokehPass = null;
  }
  if (outputPass) {
    outputPass.dispose?.();
    outputPass = null;
  }
  if (composer) {
    composer.dispose?.();
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
//  17. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器/时钟/色调映射
  addLights(); // 2. 灯光 + 阴影 + 灯泡
  addGround(); // 3. [stage-10] 草地着色器
  addFoundation(); // 4. 地基 + 台阶
  addHouse(); // 5~9. 墙+门+玻璃着色器+屋顶+烟囱+地板+家具
  initPostProcessing(); // 10. [stage-11] EffectComposer 后期管线
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", onKeyDown);
  animate(); // 启动渲染循环（用 composer.render）
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
        🎬 阶段 11 · 氛围营造（后期处理）
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
        >开灯 / 关灯（开灯后看 Bloom 辉光）
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
          >B</span
        >开关 Bloom 辉光
      </div>
      <div>
        <span
          style="
            display: inline-block;
            min-width: 22px;
            padding: 1px 6px;
            margin-right: 6px;
            background: #f56c6c;
            color: #fff;
            border-radius: 4px;
            text-align: center;
            font-weight: 600;
          "
          >D</span
        >开关景深（DoF）
      </div>
      <div style="color: #909399; font-size: 12px; margin-top: 2px">
        昼夜自动循环（每 24 秒一天）· 鼠标拖拽旋转 / 滚轮缩放
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
        min-width: 150px;
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
        Bloom：<span
          :style="{
            color: ui.bloomState === '开启' ? '#409eff' : '#909399',
            fontWeight: 600,
          }"
          >{{ ui.bloomState }}</span
        >
      </div>
      <div>
        景深：<span
          :style="{
            color: ui.dofState === '开启' ? '#f56c6c' : '#909399',
            fontWeight: 600,
          }"
          >{{ ui.dofState }}</span
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
    </div>

    <!-- 底部居中：后期管线说明 -->
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
      🎞️ EffectComposer · RenderPass → UnrealBloomPass → BokehPass → OutputPass ·
      ACESFilmic 色调映射
    </div>
  </div>
</template>
