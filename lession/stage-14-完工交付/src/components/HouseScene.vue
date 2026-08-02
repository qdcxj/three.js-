<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 14：完工交付（最终完整版欧式乡村小屋）
 * ----------------------------------------------------------------------------
 *  本文件是整个教程的最终交付源码，整合了 stage-01 ~ stage-13 的全部构件与
 *  功能，建造出一栋完整、精致、可交互的欧式乡村小屋。
 *
 *  累积内容一览：
 *    [stage-01] 草地（PlaneGeometry 40×40，程序化草地贴图）
 *    [stage-02] 地基平台 + 入口台阶（两级）
 *    [stage-03] 四面墙(含门洞/窗洞，多块 Box 拼接) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 砖墙/木纹/草地程序化贴图(CanvasTexture) + 天空背景
 *    [stage-06] 阳光/环境光/室内点光源/壁灯聚光灯 + PCF 软阴影
 *    [stage-07] 第一人称漫游(PointerLockControls) + 鸟瞰(OrbitControls)切换
 *    [stage-08] 开关门动画(O键) + 开关灯(L键) + 昼夜自动循环
 *    [stage-09] 室内家具(桌/椅/床/沙发，程序化几何体)
 *    [stage-10] 玻璃反射着色器(Fresnel) + 草地波动着色器(InstancedMesh + onBeforeCompile)
 *    [stage-11] Bloom 辉光 + ACES 色调映射后期(EffectComposer)
 *    [stage-12] 烟囱冒烟粒子系统(Points + 自定义着色器)
 *    [stage-13] FPS 面板 + LOD 多细节层次(装饰树) + InstancedMesh(草叶)
 *    [stage-14] 最终整合，交付完整可交互小屋
 *
 *  交互键位：
 *    O —— 开门/关门（动画过渡）
 *    L —— 开灯/关灯（室内灯 + 壁灯）
 *    F —— 切换第一人称漫游
 *    G —— 切换鸟瞰模式
 *    W/A/S/D —— 第一人称模式下前后左右移动
 *    鼠标 —— 鸟瞰拖拽旋转 / 第一人称视角转动
 *
 *  代码组织：按功能分区为 createXxx / setupXxx / updateXxx / disposeScene
 * ============================================================================
 */
import { ref, reactive, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// ============================ Vue 响应式状态 ============================
const canvasRef = ref(null);

// UI 面板状态
const ui = reactive({
  fps: 60, // 实时帧率
  stage: "14 · 完工交付", // 当前阶段
  doorState: "关闭", // 门状态
  lampState: "关闭", // 灯状态
  phase: "白天", // 昼夜时段
  controlMode: "鸟瞰", // 控制模式
});

// ============================ Three.js 全局对象 ============================
let scene = null;
let camera = null;
let renderer = null;
let clock = null;
let animationId = null;

// 控制器
let orbitControls = null;
let pointerLockControls = null;
let controlMode = "bird"; // 'bird' | 'fps'

// 后期处理
let composer = null;
let bloomPass = null;

// 着色器材质（需要每帧更新 uniform）
let glassMaterial = null;
let grassMaterial = null; // onBeforeCompile 注入的自定义着色器
let grassShaderRef = null; // onBeforeCompile 回调中保存的 shader 引用
let skyMaterial = null;

// 灯光
let sunLight = null;
let ambientLight = null;
let indoorLamp = null;
const wallLamps = []; // 壁灯聚光灯数组

// 粒子系统
let smokePoints = null;
let smokeGeometry = null;
let smokeMaterial = null;
const smokeCount = 150;
const smokeVelocities = [];
const smokeLifetimes = new Float32Array(smokeCount);

// 动画状态
let doorGroup = null;
let doorState = 0; // 0=关, 1=开
let doorAngle = 0; // 当前门旋转弧度
let lampOn = false;
let lampIntensity = 0;
let cycleTime = 0;
const DAY_PERIOD = 30; // 一天周期 30 秒（演示用）

// WASD 移动状态
const moveState = { forward: false, backward: false, left: false, right: false };

// FPS 计数
let fpsFrames = 0;
let fpsPrevTime = 0;

// 收集所有需要 dispose 的资源
const disposables = [];
const track = (obj) => {
  disposables.push(obj);
  return obj;
};

// ============================ 昼夜循环颜色常量 ============================
const DAY_SUN_COLOR = new THREE.Color(0xfffaf0);
const NIGHT_SUN_COLOR = new THREE.Color(0x6f8fff);
const DAY_SKY_TOP = new THREE.Color(0x4a90d9);
const DAY_SKY_BOTTOM = new THREE.Color(0xb0d4f1);
const NIGHT_SKY_TOP = new THREE.Color(0x05081a);
const NIGHT_SKY_BOTTOM = new THREE.Color(0x1a1a3a);
const DAY_AMBIENT = 0.55;
const NIGHT_AMBIENT = 0.12;
const DAY_SUN_INTENSITY = 1.4;
const NIGHT_SUN_INTENSITY = 0.25;
const _tmpSunColor = new THREE.Color();
const _tmpSkyTop = new THREE.Color();
const _tmpSkyBottom = new THREE.Color();

// ============================================================================
//  程序化贴图生成（CanvasTexture）
// ============================================================================
/** 生成砖墙纹理 */
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

/** 生成木纹纹理 */
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
      x + (Math.random() - 0.5) * 20, 80,
      x + (Math.random() - 0.5) * 20, 170,
      x + (Math.random() - 0.5) * 30, 256
    );
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
};

/** 生成草地纹理 */
const makeGrassTexture = () => {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#67c23a";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(${50 + Math.random() * 40},${120 + Math.random() * 60},${40 + Math.random() * 30},0.6)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
};

// ============================================================================
//  1. createScene —— 创建场景 + 天空盒（渐变球）
// ============================================================================
const createScene = () => {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  // 雾效：远处淡化，增强深度感
  scene.fog = new THREE.Fog(0x87ceeb, 30, 90);

  // 天空盒：大球内表面贴渐变着色器
  const skyGeo = new THREE.SphereGeometry(100, 32, 16);
  skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopColor: { value: new THREE.Color(0x4a90d9) },
      uBottomColor: { value: new THREE.Color(0xb0d4f1) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(uBottomColor, uTopColor, t), 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMaterial);
  scene.add(track(skyMesh));
};

// ============================================================================
//  2. createCamera —— 透视相机
// ============================================================================
const createCamera = () => {
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(12, 8, 12);
  camera.lookAt(0, 0, 0);
};

// ============================================================================
//  3. createRenderer —— WebGL 渲染器（含色调映射）
// ============================================================================
const createRenderer = () => {
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
};

// ============================================================================
//  4. createShadows —— 阴影系统配置
// ============================================================================
const createShadows = () => {
  // 开启渲染器阴影
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 阳光阴影：覆盖整个小屋
  if (sunLight) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 60;
    sunLight.shadow.camera.left = -15;
    sunLight.shadow.camera.right = 15;
    sunLight.shadow.camera.top = 15;
    sunLight.shadow.camera.bottom = -15;
    sunLight.shadow.bias = -0.0005;
  }

  // 室内点光源阴影
  if (indoorLamp) {
    indoorLamp.castShadow = true;
    indoorLamp.shadow.mapSize.set(512, 512);
  }
};

// ============================================================================
//  5. createShaders —— 玻璃反射着色器 + 草地波动着色器
// ============================================================================
const createShaders = () => {
  // ---- 玻璃反射着色器（Fresnel 边缘反射）----
  glassMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor: { value: new THREE.Color(0xa8d0ff) },
      uReflectionColor: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uBaseColor;
      uniform vec3 uReflectionColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 3.0);
        vec3 color = mix(uBaseColor, uReflectionColor, fresnel);
        float alpha = 0.35 + fresnel * 0.4;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  // ---- 草地波动着色器（onBeforeCompile 注入 MeshStandardMaterial）----
  // 用 onBeforeCompile 而非裸 ShaderMaterial，这样 InstancedMesh 自动支持
  // instanceMatrix，且保留 PBR 光照与阴影接收能力
  grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a9c2f,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       uniform float uTime;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `vec3 transformed = position;
       float heightFactor = clamp(position.y, 0.0, 1.0);
       float wave = sin(position.x * 5.0 + uTime * 2.0) * 0.08 * heightFactor;
       float wave2 = cos(position.z * 5.0 + uTime * 1.5) * 0.05 * heightFactor;
       transformed.x += wave;
       transformed.z += wave2;`
    );
    grassShaderRef = shader; // 保存引用以便每帧更新 uTime
  };
};

// ============================================================================
//  6. createGround —— 草地（地面 + InstancedMesh 草叶）
// ============================================================================
const createGround = () => {
  // ---- 地面平面：贴草地纹理，接收阴影 ----
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    roughness: 1.0,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(track(ground));

  // ---- InstancedMesh 草叶：千片草叶波动着色器 ----
  const bladeGeo = new THREE.PlaneGeometry(0.06, 0.3);
  bladeGeo.translate(0, 0.15, 0); // 把轴心移到底部
  const grassCount = 1500;
  const grassMesh = new THREE.InstancedMesh(bladeGeo, grassMaterial, grassCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < grassCount; i++) {
    // 随机散布在 30×30 范围内，避开房子地基区域
    let x, z;
    do {
      x = (Math.random() - 0.5) * 30;
      z = (Math.random() - 0.5) * 30;
    } while (Math.abs(x) < 4.5 && Math.abs(z) < 3.5);
    dummy.position.set(x, 0, z);
    dummy.rotation.y = Math.random() * Math.PI;
    const s = 0.5 + Math.random() * 0.8;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.receiveShadow = true;
  scene.add(track(grassMesh));
};

// ============================================================================
//  7. createFoundation —— 地基平台 + 入口台阶
// ============================================================================
const createFoundation = () => {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x909399,
    roughness: 0.9,
    metalness: 0.0,
  });
  // 地基平台 8×0.3×6
  const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 6), mat);
  platform.position.set(0, 0.15, 0);
  platform.castShadow = true;
  platform.receiveShadow = true;
  scene.add(track(platform));
  // 入口台阶 ×2
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 0.4), mat);
  step1.position.set(0, 0.075, 3.2);
  step1.castShadow = true;
  step1.receiveShadow = true;
  scene.add(track(step1));
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 0.4), mat);
  step2.position.set(0, 0.225, 3.0);
  step2.castShadow = true;
  step2.receiveShadow = true;
  scene.add(track(step2));
};

// ============================================================================
//  8. createWalls —— 四面墙(含门窗洞) + 玻璃窗
// ============================================================================
const createWalls = (houseGroup) => {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    map: makeBrickTexture(),
    roughness: 0.9,
    metalness: 0.0,
  });
  const WT = 0.2; // 墙厚
  // 辅助：创建墙块并开阴影
  const block = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    houseGroup.add(track(m));
    return m;
  };

  // 后墙：整块
  block(8, 3, WT, 0, 1.8, -3);
  // 左墙：含 1 个侧窗洞
  block(WT, 0.6, 6, -4, 0.6, 0);
  block(WT, 1.2, 2.4, -4, 1.5, -1.8);
  block(WT, 1.2, 2.4, -4, 1.5, 1.8);
  block(WT, 1.2, 6, -4, 2.7, 0);
  // 右墙：对称
  block(WT, 0.6, 6, 4, 0.6, 0);
  block(WT, 1.2, 2.4, 4, 1.5, -1.8);
  block(WT, 1.2, 2.4, 4, 1.5, 1.8);
  block(WT, 1.2, 6, 4, 2.7, 0);
  // 前墙：含 1 门洞 + 2 窗洞
  block(8, 0.6, WT, 0, 0.6, 3);
  block(1.6, 1.2, WT, -3.2, 1.5, 3);
  block(1.1, 1.2, WT, -1.05, 1.5, 3);
  block(1.1, 1.2, WT, 1.05, 1.5, 3);
  block(1.6, 1.2, WT, 3.2, 1.5, 3);
  block(3.5, 0.2, WT, -2.25, 2.2, 3);
  block(3.5, 0.2, WT, 2.25, 2.2, 3);
  block(8, 1.0, WT, 0, 2.8, 3);

  // 窗框 ×4（蓝色边框 #409eff）
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x409eff,
    roughness: 0.5,
    metalness: 0.3,
  });
  const makeFrame = (w, h, d, x, y, z) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    frame.position.set(x, y, z);
    houseGroup.add(track(frame));
  };
  makeFrame(0.78, 0.05, 0.04, -2, 2.1, 3); // 前左窗上框
  makeFrame(0.78, 0.05, 0.04, 2, 2.1, 3);  // 前右窗上框
  makeFrame(0.04, 1.15, 0.04, -2, 1.5, 3); // 前左窗侧框
  makeFrame(0.04, 1.15, 0.04, 2, 1.5, 3);
};

// ============================================================================
//  9. createRoof —— 尖屋顶(双坡顶 + 山墙)
// ============================================================================
const createRoof = (houseGroup) => {
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
  const slopeLen = Math.sqrt(halfSpan * halfSpan + (ridgeY - eaveY) ** 2);
  const slopeAngle = Math.atan((ridgeY - eaveY) / halfSpan);

  // 左坡
  const leftRoof = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen), roofMat);
  leftRoof.position.set(-2, 4.15, 0);
  leftRoof.rotation.z = slopeAngle;
  leftRoof.castShadow = true;
  leftRoof.receiveShadow = true;
  houseGroup.add(track(leftRoof));
  // 右坡
  const rightRoof = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen), roofMat);
  rightRoof.position.set(2, 4.15, 0);
  rightRoof.rotation.z = -slopeAngle;
  rightRoof.castShadow = true;
  rightRoof.receiveShadow = true;
  houseGroup.add(track(rightRoof));

  // 山墙三角形
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-4, 0);
  gableShape.lineTo(4, 0);
  gableShape.lineTo(0, 1.7);
  gableShape.lineTo(-4, 0);
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.2, bevelEnabled: false });
  const frontGable = new THREE.Mesh(gableGeo, gableMat);
  frontGable.position.set(0, 3.3, 3.0);
  frontGable.castShadow = true;
  houseGroup.add(track(frontGable));
  const backGable = new THREE.Mesh(gableGeo, gableMat);
  backGable.position.set(0, 3.3, -3.2);
  backGable.castShadow = true;
  houseGroup.add(track(backGable));
};

// ============================================================================
//  10. createDoor —— 木门(带门轴 pivot，可开关动画)
// ============================================================================
const createDoor = (houseGroup) => {
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    map: makeWoodTexture(),
    roughness: 0.6,
    metalness: 0.0,
  });
  // 门轴 Group：位置 = 门洞左边缘
  doorGroup = new THREE.Group();
  doorGroup.position.set(-0.5, 1.3, 3.125);
  doorGroup.rotation.y = 0;
  // 门板偏移到门轴右侧
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.05), doorMat);
  doorPanel.position.set(0.5, 0, 0);
  doorPanel.castShadow = true;
  doorPanel.receiveShadow = true;
  doorGroup.add(doorPanel);
  houseGroup.add(doorGroup);
};

// ============================================================================
//  11. createWindows —— 4 扇玻璃窗(反射着色器)
// ============================================================================
const createWindows = (houseGroup) => {
  // 前墙 2 窗
  const fg1 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.12, 0.02), glassMaterial);
  fg1.position.set(-2, 1.5, 3.0);
  houseGroup.add(track(fg1));
  const fg2 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.12, 0.02), glassMaterial);
  fg2.position.set(2, 1.5, 3.0);
  houseGroup.add(track(fg2));
  // 侧墙 2 窗
  const sg1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.12, 1.12), glassMaterial);
  sg1.position.set(-4, 1.5, 0);
  houseGroup.add(track(sg1));
  const sg2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.12, 1.12), glassMaterial);
  sg2.position.set(4, 1.5, 0);
  houseGroup.add(track(sg2));
};

// ============================================================================
//  12. createChimney —— 烟囱 + 室内地板
// ============================================================================
const createChimney = (houseGroup) => {
  const chimneyMat = new THREE.MeshStandardMaterial({
    color: 0x909399,
    roughness: 0.95,
    metalness: 0.0,
  });
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), chimneyMat);
  chimney.position.set(2, 4.5, -1.5);
  chimney.castShadow = true;
  chimney.receiveShadow = true;
  houseGroup.add(track(chimney));

  // 室内地板
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd2b48c,
    roughness: 0.7,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.05, 5.6), floorMat);
  floor.position.set(0, 0.325, 0);
  floor.receiveShadow = true;
  houseGroup.add(track(floor));
};

// ============================================================================
//  13. createFurniture —— 室内家具(桌/椅/床/沙发，程序化几何体)
// ============================================================================
const createFurniture = (houseGroup) => {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x409eff, roughness: 0.8 });
  const mattressMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.9 });
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const rugMat = new THREE.MeshStandardMaterial({ color: 0xe6a23c, roughness: 0.95 });

  // 辅助：创建家具部件
  const part = (geo, mat, x, y, z, group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(track(m));
    return m;
  };

  // ---- 桌子 ----
  const tableGroup = new THREE.Group();
  part(new THREE.BoxGeometry(1.2, 0.05, 0.8), woodMat, 0, 0.8, 0, tableGroup);
  const legPositions = [[-0.55, 0.4, -0.35], [0.55, 0.4, -0.35], [-0.55, 0.4, 0.35], [0.55, 0.4, 0.35]];
  legPositions.forEach(([x, y, z]) => {
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.8), woodMat, x, y, z, tableGroup);
  });
  tableGroup.position.set(1.5, 0.325, 0.5);
  houseGroup.add(tableGroup);

  // ---- 椅子 ×2 ----
  const makeChair = (x, z, rotY) => {
    const chairGroup = new THREE.Group();
    part(new THREE.BoxGeometry(0.4, 0.04, 0.4), woodMat, 0, 0.5, 0, chairGroup);
    part(new THREE.BoxGeometry(0.4, 0.5, 0.04), woodMat, 0, 0.75, -0.18, chairGroup);
    const cLegs = [[-0.17, 0.25, -0.17], [0.17, 0.25, -0.17], [-0.17, 0.25, 0.17], [0.17, 0.25, 0.17]];
    cLegs.forEach(([lx, ly, lz]) => {
      part(new THREE.CylinderGeometry(0.025, 0.025, 0.5), woodMat, lx, ly, lz, chairGroup);
    });
    chairGroup.position.set(x, 0.325, z);
    chairGroup.rotation.y = rotY;
    houseGroup.add(chairGroup);
  };
  makeChair(1.5, 1.3, 0);
  makeChair(1.5, -0.3, Math.PI);

  // ---- 床 ----
  const bedGroup = new THREE.Group();
  part(new THREE.BoxGeometry(1.5, 0.2, 2.0), woodMat, 0, 0.1, 0, bedGroup);
  part(new THREE.BoxGeometry(1.4, 0.15, 1.9), mattressMat, 0, 0.275, 0, bedGroup);
  part(new THREE.BoxGeometry(0.5, 0.1, 0.3), pillowMat, 0, 0.4, -0.75, bedGroup);
  bedGroup.position.set(-2, 0.425, -1.5);
  houseGroup.add(bedGroup);

  // ---- 沙发 ----
  const sofaGroup = new THREE.Group();
  part(new THREE.BoxGeometry(1.6, 0.4, 0.7), fabricMat, 0, 0.2, 0, sofaGroup);
  part(new THREE.BoxGeometry(1.6, 0.6, 0.2), fabricMat, 0, 0.5, -0.25, sofaGroup);
  part(new THREE.BoxGeometry(0.2, 0.5, 0.7), fabricMat, -0.7, 0.25, 0, sofaGroup);
  part(new THREE.BoxGeometry(0.2, 0.5, 0.7), fabricMat, 0.7, 0.25, 0, sofaGroup);
  sofaGroup.position.set(2, 0.525, -1.5);
  houseGroup.add(sofaGroup);

  // ---- 地毯 ----
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(1.5, 0.351, 0.5);
  rug.receiveShadow = true;
  houseGroup.add(track(rug));

  // ---- 装饰树（LOD 多细节层次）----
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.8 });
  const treePositions = [[-8, 0, 5], [10, 0, -3], [-10, 0, -5], [8, 0, 8], [-6, 0, -8]];

  treePositions.forEach(([tx, ty, tz]) => {
    // 高细节：8 段圆锥
    const highDetail = new THREE.Group();
    const trunkH = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 8), trunkMat);
    trunkH.position.y = 1;
    trunkH.castShadow = true;
    highDetail.add(trunkH);
    const leavesH = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 8), leafMat);
    leavesH.position.y = 3.5;
    leavesH.castShadow = true;
    highDetail.add(leavesH);
    track(trunkH);
    track(leavesH);

    // 低细节：4 段圆锥
    const lowDetail = new THREE.Group();
    const trunkL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 4), trunkMat);
    trunkL.position.y = 1;
    lowDetail.add(trunkL);
    const leavesL = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 4), leafMat);
    leavesL.position.y = 3.5;
    lowDetail.add(leavesL);
    track(trunkL);
    track(leavesL);

    const lod = new THREE.LOD();
    lod.addLevel(highDetail, 0);
    lod.addLevel(lowDetail, 20);
    lod.position.set(tx, ty, tz);
    scene.add(lod);
    track(lod);
  });
};

// ============================================================================
//  14. createLights —— 阳光 + 环境光 + 室内点光源 + 壁灯聚光灯
// ============================================================================
const createLights = () => {
  // 环境光
  ambientLight = new THREE.AmbientLight(0xffffff, DAY_AMBIENT);
  scene.add(ambientLight);

  // 阳光平行光
  sunLight = new THREE.DirectionalLight(DAY_SUN_COLOR.getHex(), DAY_SUN_INTENSITY);
  sunLight.position.set(10, 15, 8);
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(sunLight.target);

  // 室内点光源（暖黄 #ffd27a）
  indoorLamp = new THREE.PointLight(0xffd27a, 0, 12, 2);
  indoorLamp.position.set(0, 2.8, 0);
  scene.add(indoorLamp);

  // 壁灯聚光灯 ×2
  const lampPositions = [[-2, -2.8], [2, -2.8]];
  lampPositions.forEach(([x, z]) => {
    const spot = new THREE.SpotLight(0xffe4b5, 0, 8, Math.PI / 5, 0.4, 1.5);
    spot.position.set(x, 2.5, z);
    spot.target.position.set(x, 0.5, 0);
    scene.add(spot);
    scene.add(spot.target);
    wallLamps.push(spot);
    track(spot);
  });
};

// ============================================================================
//  15. createParticles —— 烟囱冒烟粒子系统
// ============================================================================
const createParticles = () => {
  const positions = new Float32Array(smokeCount * 3);
  const lifetimes = new Float32Array(smokeCount);
  const sizes = new Float32Array(smokeCount);

  for (let i = 0; i < smokeCount; i++) {
    resetSmokeParticle(i, positions, lifetimes, sizes);
  }

  smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  smokeGeometry.setAttribute("aLifetime", new THREE.BufferAttribute(lifetimes, 1));
  smokeGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  smokeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float aLifetime;
      attribute float aSize;
      varying float vLifetime;
      void main() {
        vLifetime = aLifetime;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * 40.0 / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vLifetime;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv);
        if (dist > 0.5) discard;
        float alpha = (1.0 - dist * 2.0) * vLifetime * 0.5;
        vec3 color = vec3(0.85, 0.85, 0.85);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  smokePoints = new THREE.Points(smokeGeometry, smokeMaterial);
  scene.add(track(smokePoints));
};

/** 重置一个粒子到烟囱顶部 */
const resetSmokeParticle = (i, positions, lifetimes, sizes) => {
  positions[i * 3] = 2 + (Math.random() - 0.5) * 0.2;
  positions[i * 3 + 1] = 5.3 + Math.random() * 0.1;
  positions[i * 3 + 2] = -1.5 + (Math.random() - 0.5) * 0.2;
  lifetimes[i] = 0.8 + Math.random() * 0.4;
  sizes[i] = 0.3 + Math.random() * 0.4;
  smokeVelocities[i] = new THREE.Vector3(
    (Math.random() - 0.5) * 0.008,
    0.008 + Math.random() * 0.02,
    (Math.random() - 0.5) * 0.008
  );
};

// ============================================================================
//  16. createPostprocessing —— Bloom 辉光 + 色调映射
// ============================================================================
const createPostprocessing = () => {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35, // strength：辉光强度
    0.4,  // radius：扩散半径
    0.85  // threshold：亮度阈值（只让高亮区域辉光）
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
//  17. createControls —— 鸟瞰(OrbitControls) + 第一人称(PointerLockControls)
// ============================================================================
const createControls = () => {
  // 鸟瞰：OrbitControls
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.target.set(0, 1.5, 0);
  orbitControls.minDistance = 4;
  orbitControls.maxDistance = 50;
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
  orbitControls.update();

  // 第一人称：PointerLockControls（r169 起 extends Controls，直接操控 camera，无需加入场景）
  pointerLockControls = new PointerLockControls(camera, renderer.domElement);

  // Esc 退出第一人称 → 自动切回鸟瞰
  pointerLockControls.addEventListener("unlock", () => {
    if (controlMode === "fps") {
      switchToBirdMode();
    }
  });
};

// ---- 模式切换 ----
const switchToBirdMode = () => {
  controlMode = "bird";
  orbitControls.enabled = true;
  if (pointerLockControls.isLocked) pointerLockControls.unlock();
  camera.position.set(12, 8, 12);
  orbitControls.target.set(0, 1.5, 0);
  orbitControls.update();
  ui.controlMode = "鸟瞰";
};

const switchToFpsMode = () => {
  controlMode = "fps";
  orbitControls.enabled = false;
  // 把相机放到门口
  camera.position.set(0, 1.6, 5);
  pointerLockControls.lock();
  ui.controlMode = "第一人称";
};

// ============================================================================
//  18. setupInteraction —— 键盘交互
// ============================================================================
const setupInteraction = () => {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
};

const onKeyDown = (e) => {
  const key = e.key.toLowerCase();
  if (key === "o") {
    doorState = doorState === 0 ? 1 : 0;
    ui.doorState = doorState === 1 ? "开启" : "关闭";
  } else if (key === "l") {
    lampOn = !lampOn;
    ui.lampState = lampOn ? "开启" : "关闭";
  } else if (key === "f") {
    if (controlMode !== "fps") switchToFpsMode();
  } else if (key === "g") {
    if (controlMode !== "bird") switchToBirdMode();
  } else if (key === "w") {
    moveState.forward = true;
  } else if (key === "s") {
    moveState.backward = true;
  } else if (key === "a") {
    moveState.left = true;
  } else if (key === "d") {
    moveState.right = true;
  }
};

const onKeyUp = (e) => {
  const key = e.key.toLowerCase();
  if (key === "w") moveState.forward = false;
  else if (key === "s") moveState.backward = false;
  else if (key === "a") moveState.left = false;
  else if (key === "d") moveState.right = false;
};

// ============================================================================
//  19. 动画更新函数
// ============================================================================

/** 门动画：lerp 旋转 */
const updateDoor = (dt) => {
  if (!doorGroup) return;
  const targetAngle = doorState * (Math.PI / 2);
  const speed = 8;
  doorAngle += (targetAngle - doorAngle) * Math.min(1, speed * dt);
  doorGroup.rotation.y = doorAngle;
};

/** 灯动画：lerp 强度 */
const updateLamp = (dt) => {
  if (!indoorLamp) return;
  const target = lampOn ? 1.0 : 0.0;
  const speed = 5;
  lampIntensity += (target - lampIntensity) * Math.min(1, speed * dt);
  indoorLamp.intensity = lampIntensity * 1.5;
  wallLamps.forEach((spot) => {
    spot.intensity = lampIntensity * 1.2;
  });
};

/** 昼夜交替 */
const updateDayNight = (dt) => {
  cycleTime = (cycleTime + dt) % DAY_PERIOD;
  const t = cycleTime / DAY_PERIOD;
  const dayFactor = (Math.cos(t * Math.PI * 2) + 1) / 2;

  // 阳光颜色与强度
  _tmpSunColor.copy(NIGHT_SUN_COLOR).lerp(DAY_SUN_COLOR, dayFactor);
  sunLight.color.copy(_tmpSunColor);
  sunLight.intensity = NIGHT_SUN_INTENSITY + (DAY_SUN_INTENSITY - NIGHT_SUN_INTENSITY) * dayFactor;
  ambientLight.intensity = NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * dayFactor;

  // 天空颜色
  _tmpSkyTop.copy(NIGHT_SKY_TOP).lerp(DAY_SKY_TOP, dayFactor);
  _tmpSkyBottom.copy(NIGHT_SKY_BOTTOM).lerp(DAY_SKY_BOTTOM, dayFactor);
  scene.background.copy(_tmpSkyBottom);
  if (skyMaterial) {
    skyMaterial.uniforms.uTopColor.value.copy(_tmpSkyTop);
    skyMaterial.uniforms.uBottomColor.value.copy(_tmpSkyBottom);
  }
  if (scene.fog) scene.fog.color.copy(_tmpSkyBottom);

  // 阳光位置随时间划弧
  const angle = t * Math.PI * 2;
  sunLight.position.set(Math.cos(angle) * 12, Math.sin(angle) * 12 + 2, 8);

  // 玻璃反射色跟随天空
  if (glassMaterial) {
    glassMaterial.uniforms.uReflectionColor.value.copy(_tmpSkyTop);
  }

  // UI 时段
  if (dayFactor > 0.75) ui.phase = "白天";
  else if (dayFactor > 0.4) ui.phase = "黄昏/黎明";
  else ui.phase = "夜晚";
};

/** 粒子更新 */
const updateParticles = (dt) => {
  if (!smokeGeometry) return;
  const positions = smokeGeometry.attributes.position.array;
  const lifetimes = smokeGeometry.attributes.aLifetime.array;
  for (let i = 0; i < smokeCount; i++) {
    lifetimes[i] -= dt * 0.35;
    if (lifetimes[i] <= 0) {
      resetSmokeParticle(i, positions, lifetimes, smokeGeometry.attributes.aSize.array);
      continue;
    }
    positions[i * 3] += smokeVelocities[i].x;
    positions[i * 3 + 1] += smokeVelocities[i].y;
    positions[i * 3 + 2] += smokeVelocities[i].z;
    smokeVelocities[i].multiplyScalar(0.99);
    smokeVelocities[i].y += 0.0005;
  }
  smokeGeometry.attributes.position.needsUpdate = true;
  smokeGeometry.attributes.aLifetime.needsUpdate = true;
};

/** WASD 移动 */
const updateMovement = (dt) => {
  if (controlMode !== "fps" || !pointerLockControls.isLocked) return;
  const speed = 4 * dt;
  if (moveState.forward) pointerLockControls.moveForward(speed);
  if (moveState.backward) pointerLockControls.moveForward(-speed);
  if (moveState.left) pointerLockControls.moveRight(-speed);
  if (moveState.right) pointerLockControls.moveRight(speed);
};

/** FPS 计数 */
const updateFPS = () => {
  fpsFrames++;
  const now = performance.now();
  if (now >= fpsPrevTime + 500) {
    ui.fps = Math.round((fpsFrames * 1000) / (now - fpsPrevTime));
    fpsFrames = 0;
    fpsPrevTime = now;
  }
};

// ============================================================================
//  20. 渲染循环
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // 控制器更新
  if (controlMode === "bird") orbitControls.update();

  // 动画更新
  updateDoor(dt);
  updateLamp(dt);
  updateDayNight(dt);
  updateParticles(dt);
  updateMovement(dt);

  // 着色器 uniform 更新
  if (grassShaderRef) grassShaderRef.uniforms.uTime.value += dt;

  // FPS
  updateFPS();

  // 渲染（使用 EffectComposer 而非 renderer.render）
  composer.render();
};

// ============================================================================
//  21. 窗口大小自适应
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (composer) {
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  }
};

// ============================================================================
//  22. disposeScene —— 完整资源释放
// ============================================================================
const disposeScene = () => {
  // 停止渲染循环
  if (animationId) cancelAnimationFrame(animationId);
  // 移除事件
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);

  // 释放 doorGroup 子级
  if (doorGroup) {
    doorGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        else { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
      }
    });
    if (doorGroup.parent) doorGroup.parent.remove(doorGroup);
    doorGroup = null;
  }

  // 释放 disposables（geometry / material / texture）
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
    // LOD 子级处理
    if (obj.isLOD) {
      for (let i = 0; i < obj.levels.length; i++) {
        const level = obj.levels[i];
        if (level && level.object) {
          level.object.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        }
      }
    }
    if (obj.target && obj.target.parent) obj.target.parent.remove(obj.target);
    if (obj.parent) obj.parent.remove(obj);
  });
  disposables.length = 0;

  // 释放粒子系统
  if (smokeGeometry) { smokeGeometry.dispose(); smokeGeometry = null; }
  if (smokeMaterial) { smokeMaterial.dispose(); smokeMaterial = null; }
  smokePoints = null;

  // 释放着色器材质
  if (glassMaterial) { glassMaterial.dispose(); glassMaterial = null; }
  if (grassMaterial) { grassMaterial.dispose(); grassMaterial = null; }
  if (skyMaterial) { skyMaterial.dispose(); skyMaterial = null; }
  grassShaderRef = null;

  // 释放后期处理
  if (composer) { composer.dispose(); composer = null; }
  bloomPass = null;

  // 释放控制器
  if (orbitControls) { orbitControls.dispose(); orbitControls = null; }
  if (pointerLockControls) {
    if (pointerLockControls.isLocked) pointerLockControls.unlock();
    pointerLockControls = null;
  }

  // 释放渲染器
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer = null;
  }

  // 清空引用
  scene = null;
  camera = null;
  clock = null;
  sunLight = null;
  ambientLight = null;
  indoorLamp = null;
  wallLamps.length = 0;
};

// ============================================================================
//  23. 生命周期
// ============================================================================
onMounted(() => {
  // ---- 基础三件套 ----
  createScene();        // 1. 场景 + 天空盒
  createCamera();       // 2. 相机
  createRenderer();     // 3. 渲染器
  clock = new THREE.Clock();

  // ---- 着色器（在构件之前创建，供构件引用）----
  createShaders();      // 4. 玻璃 + 草叶着色器

  // ---- 灯光与阴影 ----
  createLights();       // 5. 全部灯光
  createShadows();      // 6. 阴影配置

  // ---- 场景内容 ----
  createGround();       // 7. 草地 + InstancedMesh 草叶
  createFoundation();   // 8. 地基 + 台阶

  // ---- 房子组装 ----
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";
  createWalls(houseGroup);     // 9. 墙体(含洞) + 窗框
  createRoof(houseGroup);      // 10. 尖屋顶 + 山墙
  createDoor(houseGroup);      // 11. 木门(带门轴)
  createWindows(houseGroup);   // 12. 4 扇玻璃窗(反射着色器)
  createChimney(houseGroup);   // 13. 烟囱 + 室内地板
  createFurniture(houseGroup); // 14. 家具 + 装饰树(LOD)
  scene.add(houseGroup);

  // ---- 粒子 ----
  createParticles();    // 15. 烟囱冒烟粒子

  // ---- 后期处理 ----
  createPostprocessing(); // 16. Bloom + 色调映射

  // ---- 控制器与交互 ----
  createControls();     // 17. 鸟瞰 + 第一人称
  setupInteraction();   // 18. 键盘事件

  // ---- 启动 ----
  fpsPrevTime = performance.now();
  window.addEventListener("resize", handleResize);
  animate();            // 19. 渲染循环
});

onUnmounted(() => {
  disposeScene();
});
</script>

<template>
  <!-- 容器：相对定位，便于内部 UI 卡片绝对定位 -->
  <div style="position: relative; width: 100%; height: 100%">
    <!-- Three.js 渲染画布 -->
    <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%" />

    <!-- 左上角：操作提示卡片（Element Plus 配色） -->
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
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        backdrop-filter: blur(6px);
        user-select: none;
        z-index: 10;
      "
    >
      <div style="font-weight: 700; color: #409eff; margin-bottom: 6px">
        🏠 完工交付 · 欧式乡村小屋
      </div>
      <div>
        <span style="display: inline-block; min-width: 22px; padding: 1px 6px; margin-right: 6px; background: #409eff; color: #fff; border-radius: 4px; text-align: center; font-weight: 600;">O</span>
        开门 / 关门
      </div>
      <div>
        <span style="display: inline-block; min-width: 22px; padding: 1px 6px; margin-right: 6px; background: #67c23a; color: #fff; border-radius: 4px; text-align: center; font-weight: 600;">L</span>
        开灯 / 关灯
      </div>
      <div>
        <span style="display: inline-block; min-width: 22px; padding: 1px 6px; margin-right: 6px; background: #e6a23c; color: #fff; border-radius: 4px; text-align: center; font-weight: 600;">F</span>
        第一人称漫游
      </div>
      <div>
        <span style="display: inline-block; min-width: 22px; padding: 1px 6px; margin-right: 6px; background: #f56c6c; color: #fff; border-radius: 4px; text-align: center; font-weight: 600;">G</span>
        鸟瞰模式
      </div>
      <div>
        <span style="display: inline-block; min-width: 50px; padding: 1px 6px; margin-right: 6px; background: #909399; color: #fff; border-radius: 4px; text-align: center; font-weight: 600; font-size: 12px;">WASD</span>
        移动（第一人称）
      </div>
      <div style="color: #909399; font-size: 12px; margin-top: 4px">
        昼夜自动循环 · 每 30 秒一天
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
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        backdrop-filter: blur(6px);
        min-width: 150px;
        z-index: 10;
      "
    >
      <div style="font-weight: 700; color: #e6a23c; margin-bottom: 6px">
        📊 实时状态
      </div>
      <div>
        FPS：<span :style="{ color: ui.fps >= 50 ? '#67c23a' : ui.fps >= 30 ? '#e6a23c' : '#f56c6c', fontWeight: 600 }">{{ ui.fps }}</span>
      </div>
      <div>
        阶段：<span style="color: #409eff; font-weight: 600">{{ ui.stage }}</span>
      </div>
      <div>
        门：<span :style="{ color: ui.doorState === '开启' ? '#67c23a' : '#909399', fontWeight: 600 }">{{ ui.doorState }}</span>
      </div>
      <div>
        室内灯：<span :style="{ color: ui.lampState === '开启' ? '#e6a23c' : '#909399', fontWeight: 600 }">{{ ui.lampState }}</span>
      </div>
      <div>
        时段：<span :style="{ color: ui.phase === '白天' ? '#409eff' : ui.phase === '夜晚' ? '#6f8fff' : '#e6a23c', fontWeight: 600 }">{{ ui.phase }}</span>
      </div>
      <div>
        视角：<span :style="{ color: ui.controlMode === '第一人称' ? '#f56c6c' : '#409eff', fontWeight: 600 }">{{ ui.controlMode }}</span>
      </div>
    </div>

    <!-- 底部居中：技术栈说明 -->
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
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        backdrop-filter: blur(4px);
        white-space: nowrap;
        user-select: none;
        z-index: 10;
      "
    >
      🎉 stage-14 完工交付 · 草地着色器 · 玻璃反射 · Bloom 辉光 · 烟囱粒子 · 昼夜交替 · 第一人称漫游 · LOD + InstancedMesh
    </div>
  </div>
</template>
