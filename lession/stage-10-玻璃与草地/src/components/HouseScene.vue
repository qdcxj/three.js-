<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 10：玻璃与草地（着色器全知识）
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-10）：
 *    [stage-01] 草地（本阶段升级为高细分 + 波动着色器）
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 砖墙/木门/玻璃贴图（程序化 CanvasTexture）+ 天空盒色
 *    [stage-06] 阳光/环境光/室内点光源/壁灯聚光灯 + 阴影
 *    [stage-07] 相机漫游（本快照简化为 OrbitControls，保留 target 与阻尼）
 *    [stage-08] 开关门动画（O 键）+ 开关灯（L 键）+ 昼夜自动循环
 *    [stage-09] 室内简单家具（程序化几何体：床/桌子/椅子/书架）
 *    [stage-10] 玻璃反射着色器（Fresnel）+ 草地波动着色器（风吹草动）
 *
 *  本阶段新增教学：
 *    1) ShaderMaterial 结构：uniforms / vertexShader / fragmentShader
 *    2) uniforms 用 { value: ... } 包装，渲染循环中更新 .value 即可传到 GPU
 *    3) GLSL 内置变量：position/normal/uv（attribute）、modelMatrix/modelViewMatrix/
 *       projectionMatrix/normalMatrix/viewMatrix/cameraPosition（uniform）
 *    4) 顶点着色器透传 uv+normal、片段着色器实现菲涅尔反射（玻璃）与正弦波动（草地）
 *    5) ShaderMaterial 的 transparent、side、dispose 完整释放
 * ============================================================================
 */
import { ref, reactive, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ----------------------------- Vue 引用 / 响应式 UI -----------------------------
const canvasRef = ref(null);

// UI 文案状态（驱动 template 中的提示卡片）
const ui = reactive({
  doorState: "关闭", // 显示当前门状态：关闭 / 开启
  lampState: "关闭", // 显示当前室内灯状态
  phase: "白天", // 显示当前昼夜阶段：白天 / 黄昏 / 夜晚 / 黎明
});

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let clock = null; // 帧率无关动画的核心时钟 + 着色器 uTime 来源
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

// [stage-10] 着色器材质引用（渲染循环中需要更新 uTime / uBrightness）
let grassMaterial = null; // 草地波动着色器
let glassMaterial = null; // 玻璃反射着色器（4 块玻璃共享）

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

  // [stage-08] 创建全局时钟（用于帧率无关动画 + 着色器 uTime）
  clock = new THREE.Clock();
};

// ============================================================================
//  2. [stage-05] 程序化贴图（Canvas 生成砖墙 / 木纹 / 草地纹理）
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
//  4. [stage-10] 草地波动着色器（高细分 PlaneGeometry + 自定义 ShaderMaterial）
// ============================================================================
/**
 * 草地：把原本的 MeshStandardMaterial + 低细分 PlaneGeometry 升级为
 *   - PlaneGeometry(40, 40, 100, 100)：100×100 细分，共 10201 个顶点
 *   - geo.rotateX(-π/2)：把平面从 XY 旋转到 XZ（水平铺开），法线 (0,1,0)
 *   - ShaderMaterial：顶点着色器按 uTime + position.x/z 让 y 产生多频正弦波动
 *     片段着色器按波动高度混合两种绿色 + 简单 Lambert 明暗
 *
 * 注意：ShaderMaterial 不自动接收场景灯光与阴影，所有光照需在着色器里手写。
 *      这里通过 uBrightness uniform 接入昼夜循环（白天 1.0 / 夜晚 0.25）。
 */
const addGround = () => {
  // 高细分平面：100×100 段，确保波形足够平滑
  const groundGeo = new THREE.PlaneGeometry(40, 40, 100, 100);
  // 把平面"烤"成水平方向（XZ 平面），避免在 mesh 上做旋转导致着色器里坐标混乱
  groundGeo.rotateX(-Math.PI / 2);

  grassMaterial = new THREE.ShaderMaterial({
    uniforms: {
      // 时间：渲染循环里每帧用 clock.getElapsedTime() 更新
      uTime: { value: 0 },
      // 两种绿色：深绿（低洼处）↔ 浅绿（隆起处）
      uColorA: { value: new THREE.Color(0x4a7c2a) }, // 深草绿 #4a7c2a
      uColorB: { value: new THREE.Color(0x8bc34a) }, // 浅草绿 #8bc34a
      // 整体亮度：受昼夜循环驱动，白天 1.0 / 夜晚 0.25
      uBrightness: { value: 1.0 },
    },
    // 顶点着色器：根据 uTime 和 position.x/z 让顶点 y 产生正弦波动（风吹草动）
    vertexShader: /* glsl */ `
      // Three.js 自动注入的 uniform：
      //   projectionMatrix / modelViewMatrix / normalMatrix
      // Three.js 自动注入的 attribute：
      //   position / normal / uv
      uniform float uTime;

      // varying：把顶点数据传给片段着色器
      varying vec2 vUv;       // 纹理坐标
      varying float vWave;    // 当前顶点的波动高度（用于片段着色器配色）
      varying vec3 vNormalW;  // 世界空间法线（用于片段着色器简单光照）

      void main() {
        vec3 pos = position;

        // 多频率叠加正弦波，模拟风吹草动的不规则起伏
        // 三个频率叠加：长波 + 中波 + 短波，幅度逐级减小
        float wave1 = sin(pos.x * 0.4 + uTime * 1.5) * 0.15;
        float wave2 = cos(pos.z * 0.5 + uTime * 1.2) * 0.12;
        float wave3 = sin((pos.x + pos.z) * 0.3 + uTime * 2.0) * 0.08;
        float wave = wave1 + wave2 + wave3;

        // 把波动加到顶点 y 上（geo 已 rotateX，所以 y 就是世界竖直方向）
        pos.y += wave;

        // 用波动对法线做轻微扰动，让光照跟随起伏变化
        // 计算波动在 x/z 方向的数值梯度，反推近似法线
        float eps = 0.5;
        float wx = sin((pos.x + eps) * 0.4 + uTime * 1.5) * 0.15
                 + cos(pos.z * 0.5 + uTime * 1.2) * 0.12
                 + sin((pos.x + eps + pos.z) * 0.3 + uTime * 2.0) * 0.08;
        float wz = sin(pos.x * 0.4 + uTime * 1.5) * 0.15
                 + cos((pos.z + eps) * 0.5 + uTime * 1.2) * 0.12
                 + sin((pos.x + pos.z + eps) * 0.3 + uTime * 2.0) * 0.08;
        // 法线 = (-dy/dx, 1, -dy/dz) 归一化
        vec3 nrm = normalize(vec3(-(wx - wave) / eps, 1.0, -(wz - wave) / eps));
        vNormalW = nrm;

        vUv = uv;
        vWave = wave;

        // 标准变换：局部 → 视图 → 裁剪空间
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    // 片段着色器：按波动高度混色 + 简单 Lambert 明暗 + 昼夜亮度
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uBrightness;

      varying vec2 vUv;
      varying float vWave;
      varying vec3 vNormalW;

      void main() {
        // 1) 按波动高度在两种绿色间平滑过渡：高处更亮、低处更暗
        float mixFactor = smoothstep(-0.2, 0.3, vWave);
        vec3 baseColor = mix(uColorA, uColorB, mixFactor);

        // 2) 简单 Lambert 明暗：法线 · 光源方向
        //    光源方向略偏上方 + 偏右前，模拟阳光斜照
        vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
        float diff = max(dot(normalize(vNormalW), lightDir), 0.0);
        float ambient = 0.45;
        float lighting = ambient + diff * 0.55;

        // 3) 乘上昼夜亮度（白天 1.0 / 夜晚 0.25）
        vec3 finalColor = baseColor * lighting * uBrightness;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });

  const ground = new THREE.Mesh(groundGeo, grassMaterial);
  ground.position.y = 0;
  // 注：ShaderMaterial 不自动处理 receiveShadow，但保留属性不会报错
  ground.receiveShadow = true;
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
//  6. [stage-03 + stage-08 + stage-10] 四面墙(含门洞/窗洞) + 木门 + 玻璃(着色器)
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
  //  [stage-10] 玻璃 ×4：自定义菲涅尔反射 ShaderMaterial
  // ------------------------------------------------------------
  //  把原本的 MeshPhysicalMaterial 换成 ShaderMaterial：
  //    - uniforms：uTime / uColorA（中心透射色）/ uColorB（边缘反射色）
  //    - 顶点着色器：透传 uv + 把法线变换到世界空间 + 输出世界坐标
  //    - 片段着色器：菲涅尔系数 = 1 - dot(视线, 法线)，边缘反射更强
  //    - transparent: true，便于看到室内
  //  4 块玻璃共享同一个 glassMaterial（共享 GPU 程序，省显存）
  // ============================================================
  glassMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0xa8d0ff) }, // 中心透射色：浅蓝
      uColorB: { value: new THREE.Color(0xffffff) }, // 边缘反射色：天光白
    },
    // 顶点着色器：透传 uv + normal，输出世界坐标用于计算视线方向
    vertexShader: /* glsl */ `
      // Three.js 自动注入：modelMatrix / viewMatrix / projectionMatrix /
      //                    normalMatrix / cameraPosition / position / normal / uv
      varying vec2 vUv;
      varying vec3 vNormalW;   // 世界空间法线
      varying vec3 vWorldPos;  // 世界空间顶点坐标

      void main() {
        vUv = uv;
        // normalMatrix 把法线从局部变换到视图空间，再乘 viewMatrix 的逆转置
        // 简化处理：直接用 modelMatrix 的旋转部分变换法线到世界空间
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    // 片段着色器：菲涅尔反射（边缘反光更强）+ 时间相关微光闪烁
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;

      void main() {
        // 1) 视线方向：从顶点指向相机（cameraPosition 由 Three.js 自动注入）
        vec3 viewDir = normalize(cameraPosition - vWorldPos);

        // 2) 菲涅尔系数：视线越平行于表面（边缘），1 - dot 越接近 1
        //    Schlick 近似的简化版：用 pow 控制边缘锐度
        float fresnel = 1.0 - max(dot(viewDir, normalize(vNormalW)), 0.0);
        fresnel = pow(fresnel, 2.5);

        // 3) 时间相关微光闪烁，模拟玻璃反光的动态变化
        float shimmer = sin(uTime * 2.0 + vUv.x * 10.0 + vUv.y * 6.0) * 0.05 + 0.95;

        // 4) 颜色混合：中心透射色 ↔ 边缘反射色
        vec3 color = mix(uColorA, uColorB, fresnel) * shimmer;

        // 5) 透明度也随菲涅尔变化：边缘更不透明（反光强），中心更透明
        float alpha = mix(0.35, 0.85, fresnel);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false, // 透明物体不写深度，避免遮挡室内家具
  });

  // 前墙 2 窗：尺寸 0.72 × 1.12 × 0.02，位置 (±2, 1.5, 3.0)
  const frontGlass1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.12, 0.02),
    glassMaterial
  );
  frontGlass1.position.set(-2, 1.5, 3.0);
  houseGroup.add(track(frontGlass1));
  const frontGlass2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.12, 0.02),
    glassMaterial
  );
  frontGlass2.position.set(2, 1.5, 3.0);
  houseGroup.add(track(frontGlass2));
  // 侧墙 2 窗：尺寸 1.12(Z) × 1.12(Y) × 0.02(X)，位置 (±4, 1.5, 0)
  const sideGlass1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 1.12, 1.12),
    glassMaterial
  );
  sideGlass1.position.set(-4, 1.5, 0);
  houseGroup.add(track(sideGlass1));
  const sideGlass2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 1.12, 1.12),
    glassMaterial
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
//  9. [stage-09] 室内简单家具（程序化几何体）
// ============================================================================
/**
 * 用 BoxGeometry 程序化搭建简单家具：床 / 桌子 / 椅子 ×2 / 书架
 * 室内可用范围：x ∈ [-3.6, 3.6]，z ∈ [-2.6, 2.6]，地板顶 y = 0.35
 */
const addFurniture = (houseGroup) => {
  // 通用木材质
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.7,
    metalness: 0.0,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5d3a1a,
    roughness: 0.7,
    metalness: 0.0,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xe6e0d4,
    roughness: 0.9,
    metalness: 0.0,
  });

  // 辅助：创建一块家具零件，统一开阴影
  const part = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    houseGroup.add(track(m));
    return m;
  };

  // ---- 床：靠后墙左侧，床面 1.5(X) × 0.4(Y) × 2.0(Z) ----
  // 床框（不含腿）：中心 y = 0.35 + 0.2 = 0.55
  part(1.5, 0.4, 2.0, -2.5, 0.55, -1.8, darkWoodMat);
  // 床垫：略小一圈，叠在床框上
  part(1.4, 0.2, 1.9, -2.5, 0.75, -1.8, clothMat);
  // 枕头
  part(0.6, 0.1, 0.4, -2.5, 0.9, -2.55, clothMat);
  // 4 条床腿
  part(0.1, 0.35, 0.1, -3.15, 0.175, -2.7, darkWoodMat);
  part(0.1, 0.35, 0.1, -1.85, 0.175, -2.7, darkWoodMat);
  part(0.1, 0.35, 0.1, -3.15, 0.175, -0.9, darkWoodMat);
  part(0.1, 0.35, 0.1, -1.85, 0.175, -0.9, darkWoodMat);

  // ---- 桌子：室内中央偏右，桌面 1.2(X) × 0.08(Y) × 0.8(Z) ----
  // 桌面顶 y = 0.35 + 0.7 + 0.08 = 1.13 → 桌面中心 y = 1.09
  part(1.2, 0.08, 0.8, 1.5, 1.09, 0.8, woodMat);
  // 4 条桌腿
  part(0.08, 0.7, 0.08, 1.05, 0.7, 0.5, woodMat);
  part(0.08, 0.7, 0.08, 1.95, 0.7, 0.5, woodMat);
  part(0.08, 0.7, 0.08, 1.05, 0.7, 1.1, woodMat);
  part(0.08, 0.7, 0.08, 1.95, 0.7, 1.1, woodMat);

  // ---- 椅子 ×2：座位 0.4 × 0.05 × 0.4，靠背高 0.5 ----
  const makeChair = (x, z, facingZ) => {
    // facingZ = +1 椅子朝 +Z（背朝 -Z）；-1 反之
    // 座位顶 y = 0.35 + 0.45 = 0.8 → 座位中心 y = 0.775
    part(0.4, 0.05, 0.4, x, 0.775, z, woodMat);
    // 靠背：贴在座位朝向的反方向一侧
    part(0.4, 0.5, 0.05, x, 1.05, z - facingZ * 0.175, woodMat);
    // 4 条椅腿
    part(0.05, 0.45, 0.05, x - 0.175, 0.575, z - 0.175, woodMat);
    part(0.05, 0.45, 0.05, x + 0.175, 0.575, z - 0.175, woodMat);
    part(0.05, 0.45, 0.05, x - 0.175, 0.575, z + 0.175, woodMat);
    part(0.05, 0.45, 0.05, x + 0.175, 0.575, z + 0.175, woodMat);
  };
  // 椅子 1：在桌子 +Z 一侧，朝 -Z 坐下（背朝 +Z）
  makeChair(1.5, 1.6, -1);
  // 椅子 2：在桌子 -Z 一侧，朝 +Z 坐下（背朝 -Z）
  makeChair(1.5, 0.0, 1);

  // ---- 书架：靠左墙中部，0.3(X) × 1.8(Y) × 1.5(Z) ----
  // 中心 y = 0.35 + 0.9 = 1.25
  part(0.3, 1.8, 1.5, -3.6, 1.25, 1.0, darkWoodMat);
  // 隔板（3 层）：在书架正面（+X 侧）凸出一点，做出层次
  part(0.05, 1.6, 1.4, -3.42, 1.25, 1.0, woodMat);
  // 几本"书"：薄长方体立在隔板上
  const bookColors = [0xf56c6c, 0x409eff, 0x67c23a, 0xe6a23c, 0x909399];
  for (let i = 0; i < 5; i++) {
    const bookMat = new THREE.MeshStandardMaterial({
      color: bookColors[i],
      roughness: 0.8,
      metalness: 0.0,
    });
    part(0.08, 0.45, 0.18, -3.42, 0.85 + (i % 2) * 0.5, 0.55 + i * 0.18, bookMat);
  }
};

// ============================================================================
//  10. 组装整个房子
// ============================================================================
const addHouse = () => {
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";
  addWallsAndDoor(houseGroup); // [stage-03 + stage-08 + stage-10] 墙 + 门 + 玻璃(着色器)
  addRoof(houseGroup); // [stage-04] 屋顶 + 山墙
  addChimneyAndFloor(houseGroup); // [stage-04] 烟囱 + 室内地板
  addFurniture(houseGroup); // [stage-09] 室内家具
  scene.add(houseGroup);
  return houseGroup;
};

// ============================================================================
//  11. [stage-08] 键盘交互：O 开关门 / L 开关灯
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
//  12. [stage-08 + stage-10] 帧率无关动画核心：门 / 灯 / 昼夜 / 着色器 uTime
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
 * @returns {number} dayFactor 0~1，供着色器亮度 uniform 使用
 */
const updateDayNight = (dt) => {
  cycleTime = (cycleTime + dt) % DAY_PERIOD;
  const t = cycleTime / DAY_PERIOD; // 归一化时间 [0,1]
  // 余弦曲线：cos(2πt) 在 t=0 时为 1（正午），t=0.5 时为 -1（子夜）
  // 映射到 [0,1]：dayFactor = (cos(2πt) + 1) / 2
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

  // [stage-10] 同步驱动草地着色器的 uBrightness：白天 1.0 / 夜晚 0.25
  if (grassMaterial) {
    grassMaterial.uniforms.uBrightness.value =
      0.25 + 0.75 * dayFactor; // 夜晚 0.25 → 白天 1.0
  }

  // 更新 UI 阶段文案
  if (dayFactor > 0.75) ui.phase = "白天";
  else if (dayFactor > 0.4) ui.phase = "黄昏/黎明";
  else ui.phase = "夜晚";

  return dayFactor;
};

/**
 * [stage-10] 更新两个 ShaderMaterial 的 uTime
 * @param {number} elapsed 自渲染启动以来的累计秒数
 */
const updateShaders = (elapsed) => {
  if (glassMaterial) glassMaterial.uniforms.uTime.value = elapsed;
  if (grassMaterial) grassMaterial.uniforms.uTime.value = elapsed;
};

// ============================================================================
//  13. 渲染循环（帧率无关动画 + 着色器 uTime 更新）
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  // 关键：用 Clock.getDelta() 取得上一帧到本帧的真实时间间隔
  // 这样动画速度与帧率无关：60fps 每帧 dt≈0.0167s，30fps 每帧 dt≈0.0333s，
  // 但每秒累计的位移相同
  const dt = clock.getDelta();
  // getElapsedTime() 返回自 start() 起的累计秒数，用作着色器 uTime
  const elapsed = clock.getElapsedTime();

  controls.update();
  updateDoor(dt); // [stage-08] 门动画
  updateLamp(dt); // [stage-08] 灯动画
  updateDayNight(dt); // [stage-08] 昼夜循环 + [stage-10] 同步 uBrightness
  updateShaders(elapsed); // [stage-10] 玻璃 + 草地 uTime

  renderer.render(scene, camera);
};

// ============================================================================
//  14. resize 处理
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
//  15. 资源释放（dispose）—— 含 ShaderMaterial
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

  // 释放 disposables 中收集的 geometry / material / 纹理
  // 注意：ShaderMaterial 也走同样的 dispose 路径，会自动释放 GPU 程序
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

  // 显式清空着色器材质引用（已在 disposables 中 dispose 过，这里只是断引用）
  grassMaterial = null;
  glassMaterial = null;

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
//  16. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器/时钟
  addLights(); // 2. [stage-06] 灯光 + 阴影
  addGround(); // 3. [stage-10] 草地（波动着色器）
  addFoundation(); // 4. [stage-02] 地基 + 台阶
  addHouse(); // 5~9. [stage-03/04/05/08/09/10] 房子全部构件
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", onKeyDown); // [stage-08] 键盘交互
  animate(); // 启动渲染循环（含门/灯/昼夜动画 + 着色器 uTime）
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
        🏠 阶段 10 · 玻璃与草地（着色器）
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
      <div style="color: #909399; font-size: 12px; margin-top: 4px">
        鼠标拖拽旋转 · 滚轮缩放
      </div>
      <div style="color: #909399; font-size: 12px">
        玻璃菲涅尔反射 + 草地风吹波动
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
    </div>

    <!-- 底部居中：着色器系统说明 -->
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
      ✨ ShaderMaterial · 玻璃菲涅尔反射 · 草地顶点波动 · uTime 驱动动画
    </div>
  </div>
</template>
