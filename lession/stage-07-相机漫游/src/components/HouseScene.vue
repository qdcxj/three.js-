<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 07：相机漫游
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-07）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板
 *    [stage-05] 砖墙/木门/玻璃贴图 + 天空盒（本阶段保留天空背景，简贴图）
 *    [stage-06] 阳光(平行光) + 环境光 + 室内点光源 + 壁灯聚光灯 + 阴影
 *    [stage-07] ★ 第一人称漫游(PointerLockControls + WASD) + 鸟瞰切换(OrthographicCamera + OrbitControls)
 *
 *  本阶段新增教学（相机全知识）：
 *    1) 同时维护两台相机：
 *       - PerspectiveCamera(50, aspect, 0.1, 200)  → 漫游相机（第一人称用）
 *       - OrthographicCamera(left,right,top,bottom,near,far) → 鸟瞰相机（俯视整栋房子）
 *    2) 同时维护两套控制器：
 *       - OrbitControls     → 鸟瞰模式（默认）：拖拽旋转、滚轮缩放
 *       - PointerLockControls → 第一人称模式：鼠标转头 + WASD 移动
 *    3) 模式切换：按 G 切鸟瞰、按 F 切第一人称、ESC 自动退出指针锁
 *    4) WASD 移动：keydown/keyup 监听按键状态，在渲染循环里更新相机位置
 *    5) 完整 dispose：释放两台 controls、移除键盘监听、释放几何/材质/渲染器
 *
 *  相机方案速览：
 *    - 默认进入「鸟瞰模式」：用 OrthographicCamera + OrbitControls，俯视整栋小屋
 *    - 按 F → 切到「第一人称模式」：请求 PointerLock，相机落到门口前 (0, 1.6, 5)
 *      鼠标移动控制视角，WASD 控制前后左右移动
 *    - 按 G 或 ESC → 切回「鸟瞰模式」
 * ============================================================================
 */
import { ref, reactive, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

// ----------------------------- Vue 引用 -----------------------------
const canvasRef = ref(null);
// 当前模式：'bird' 鸟瞰 / 'roam' 第一人称漫游；初始为鸟瞰
const mode = ref("bird");

// ----------------------------- Three.js 全局对象 -----------------------------
let scene = null;
// 两台相机
let roamCamera = null; // 透视相机：第一人称漫游用
let birdCamera = null; // 正交相机：鸟瞰用
let activeCamera = null; // 当前激活的相机（指向上面两者之一）

let renderer = null;
// 两套控制器
let orbitControls = null; // 鸟瞰模式用
let pointerLockControls = null; // 第一人称模式用

let animationId = null;

// 收集所有需要 dispose 的 geometry / material，便于统一释放
const disposables = [];

// WASD 按键状态：true 表示按下，渲染循环里据此更新相机位置
const keys = { w: false, a: false, s: false, d: false };

// 漫游移动参数
const ROAM_SPEED = 5.0; // 移动速度：5 米/秒（用 clock.delta 平滑）
// 漫游模式起始位置：门口前略高处（人眼高度 1.6m）
const ROAM_START_POS = new THREE.Vector3(0, 1.6, 6);

/**
 * 注册一个 mesh（或 group）到 disposables，组件卸载时统一释放。
 * @param {THREE.Mesh|THREE.Group} obj
 */
const track = (obj) => {
  disposables.push(obj);
  return obj;
};

// ============================================================================
//  1. 场景 / 渲染器 / 两台相机 / 两套控制器
// ============================================================================
const initScene = () => {
  scene = new THREE.Scene();
  // 天空背景：浅蓝（Element Plus 主色 #409eff 淡化），既当 skybox 又提示室外
  scene.background = new THREE.Color(0x87ceeb);

  // ---------- 渲染器 ----------
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // [stage-06] 开启阴影贴图：PCF 软阴影
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---------- 透视相机（漫游用）----------
  // PerspectiveCamera(fov, aspect, near, far)
  //   fov    — 视野范围（垂直方向），单位度；50° 接近人眼略收窄，避免边缘畸变
  //   aspect — 宽高比 = 渲染宽 / 渲染高，控制投影不变形
  //   near   — 近裁剪面：比这更近的物体被裁掉（避免被相机内的物体挡住视线）
  //   far    — 远裁剪面：比这更远的物体被裁掉（控制渲染距离，过大降低深度精度）
  roamCamera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  // 漫游相机起始位置：门口正前方 6m 处，人眼高度 1.6m
  roamCamera.position.copy(ROAM_START_POS);
  roamCamera.lookAt(0, 1.6, 0);

  // ---------- 正交相机（鸟瞰用）----------
  // OrthographicCamera(left, right, top, bottom, near, far)
  //   left/right/top/bottom — 正交投影盒的四个边界（世界单位：米）
  //   near/far              — 近/远裁剪面（与透视相同含义）
  // 鸟瞰相机从 (0,30,0) 正下方俯视，需要让视景体覆盖整栋房子（8m × 6m + 边距）
  // 取半边长 15m，配合 aspect 调整 top/bottom，避免拉伸变形
  const aspect = window.innerWidth / window.innerHeight;
  const orthoHalf = 15; // 半边长（米）：能完整看到 8×6 的房子并留余量
  birdCamera = new THREE.OrthographicCamera(
    -orthoHalf * aspect, // left
    orthoHalf * aspect, // right
    orthoHalf, // top
    -orthoHalf, // bottom
    0.1, // near
    200 // far
  );
  // 鸟瞰相机位置：房子正上方 30m 高
  birdCamera.position.set(0, 30, 0);
  // 关键：相机朝下看时，默认 up=(0,1,0) 会与视线方向共线（退化），导致姿态无法确定。
  // 把 up 改成 (0,0,-1)，让屏幕"上"对应世界 -Z 方向（房子正面朝 +Z，所以正面在下，符合俯视图习惯）。
  birdCamera.up.set(0, 0, -1);
  birdCamera.lookAt(0, 0, 0);
  birdCamera.updateProjectionMatrix();

  // 默认激活鸟瞰相机
  activeCamera = birdCamera;

  // ---------- 控制器 1：OrbitControls（鸟瞰模式用）----------
  // 绑定到鸟瞰相机；默认启用，可拖拽旋转、滚轮缩放
  orbitControls = new OrbitControls(birdCamera, renderer.domElement);
  orbitControls.enableDamping = true; // 阻尼，旋转更顺滑
  orbitControls.dampingFactor = 0.05;
  orbitControls.target.set(0, 1.5, 0); // 视线中心略抬到房子中部
  // 鸟瞰模式下限制缩放范围，避免太近穿模或太远看不到
  orbitControls.minDistance = 5;
  orbitControls.maxDistance = 60;
  orbitControls.update();

  // ---------- 控制器 2：PointerLockControls（第一人称漫游用）----------
  // 绑定到漫游相机；默认不启用，按 F 请求 pointer lock 后才生效
  // 注意：r169 起 getObject() 已废弃，controls 直接操作 camera（controls.object === roamCamera）
  //       且 controls 不是 3D 对象，无需加入场景图（渲染时直接用 camera 即可）
  pointerLockControls = new PointerLockControls(roamCamera, renderer.domElement);
  // 默认不启用（onMouseMove / moveForward / moveRight 都会检查 enabled）
  pointerLockControls.enabled = false;
};

// ============================================================================
//  2. [stage-06] 灯光（阳光 + 环境光 + 室内点光源 + 壁灯聚光灯 + 阴影）
// ============================================================================
const addLights = () => {
  // ---------- 环境光：弱环境光 #404040，提供基础亮度，避免阴影面纯黑 ----------
  const ambient = new THREE.AmbientLight(0x404040, 1.0);
  scene.add(ambient);

  // ---------- 阳光（平行光）：暖白 #fffaf0，从 (10,15,8) 照向原点 ----------
  // DirectionalLight 是平行光，所有光线方向一致，最适合模拟太阳，且阴影最锐利
  const sun = new THREE.DirectionalLight(0xfffaf0, 1.2);
  sun.position.set(10, 15, 8);
  sun.target.position.set(0, 0, 0);
  // [stage-06] 开启阳光阴影
  sun.castShadow = true;
  // 阴影相机：正交视景体，覆盖房子及周边（左/右/上/下/近/远）
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 50;
  // 阴影贴图分辨率：1024×1024，质量与性能平衡
  sun.shadow.mapSize.set(1024, 1024);
  // 阴影偏移：避免阴影痤疮（self-shadowing acne）
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- 室内点光源：暖黄 #ffd27a，位于 (0, 2.8, 0) 房子内部正中 ----------
  // PointLight 从一点向四周发散，模拟吊灯；distance 控制影响范围，decay 物理衰减
  const indoorLight = new THREE.PointLight(0xffd27a, 30, 12, 2);
  indoorLight.position.set(0, 2.8, 0);
  indoorLight.castShadow = true; // 室内灯也投射阴影（家具/壁灯会有影子）
  indoorLight.shadow.mapSize.set(512, 512);
  scene.add(indoorLight);

  // ---------- 壁灯聚光灯×2：暖白 #ffe4b5，位于 (±2, 2.5, -2.8) 朝前下 ----------
  // SpotLight 有方向和角度，模拟壁灯锥形光照
  const wallLightLeft = new THREE.SpotLight(
    0xffe4b5, // 颜色
    20, // 强度
    8, // 距离
    Math.PI / 5, // 半锥角 36°
    0.4, // penumbra 半影软化
    2 // decay 衰减
  );
  wallLightLeft.position.set(-2, 2.5, -2.8);
  wallLightLeft.target.position.set(-2, 0.5, 1);
  wallLightLeft.castShadow = true;
  wallLightLeft.shadow.mapSize.set(512, 512);
  scene.add(wallLightLeft);
  scene.add(wallLightLeft.target);

  const wallLightRight = new THREE.SpotLight(
    0xffe4b5,
    20,
    8,
    Math.PI / 5,
    0.4,
    2
  );
  wallLightRight.position.set(2, 2.5, -2.8);
  wallLightRight.target.position.set(2, 0.5, 1);
  wallLightRight.castShadow = true;
  wallLightRight.shadow.mapSize.set(512, 512);
  scene.add(wallLightRight);
  scene.add(wallLightRight.target);
};

// ============================================================================
//  3. [stage-01] 草地（接收阴影）
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
  ground.receiveShadow = true; // [stage-06] 草地接收阴影
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
  platform.castShadow = true; // [stage-06] 投射阴影
  platform.receiveShadow = true; // 也接收阴影（自阴影）
  scene.add(track(platform));

  // 入口台阶：两级，1.5(X) × 0.4(Z) × 0.15(Y)
  // 第一级 y=0.075（半高），第二级 y=0.225（1.5 倍高）
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
  step2.position.set(0, 0.225, 3.0); // 第二级略往里收
  step2.castShadow = true;
  step2.receiveShadow = true;
  scene.add(track(step2));
};

// ============================================================================
//  5. [stage-03] 四面墙（含门洞/窗洞）+ 木门板
// ============================================================================
const addWallsAndDoor = (houseGroup) => {
  // 外墙材质：暖米色 #e6d5b8，粗糙墙面（PBR）
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    roughness: 0.9,
    metalness: 0.0,
  });

  // 木门材质：木色 #8b5a2b，半光泽
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.6,
    metalness: 0.0,
  });

  // 墙体尺寸常量（来自 HOUSE_SPEC）
  // 墙厚 0.2，墙高 3.0，墙中心 y=1.8（即墙顶 y=3.3，墙底 y=0.3 与地基顶齐平）
  const WT = 0.2; // 墙厚

  // 辅助函数：创建墙块并加到 houseGroup，自动开启阴影
  const block = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true; // [stage-06] 墙体投射阴影
    m.receiveShadow = true; // 也接收阴影
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

  // ---- 木门板：1.0(X) × 2.0(Y) × 0.05(Z)，中心 (0, 1.3, 3.05) ----
  // 略凸出墙面 0.05（墙厚 0.2，门板贴在墙外表面 z=3.1 处，门中心 z=3.125）
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.05), doorMat);
  door.position.set(0, 1.3, 3.125);
  door.castShadow = true;
  door.receiveShadow = true;
  houseGroup.add(track(door));
};

// ============================================================================
//  6. [stage-04] 尖屋顶（双坡顶 + 山墙）
// ============================================================================
const addRoof = (houseGroup) => {
  // 屋顶材质：砖红瓦 #a0522d，粗糙瓦面
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

  // ---- 屋顶几何参数（精确推导）----
  const ridgeY = 5.0; // 屋脊高度
  const eaveY = 3.3; // 屋檐高度（= 墙顶）
  const halfSpan = 4.0; // 半跨度 X
  const ridgeLen = 6.6; // 屋脊长度 Z（墙深 6m + 出挑 0.3m×2）
  const slopeLen = Math.sqrt(halfSpan * halfSpan + (ridgeY - eaveY) ** 2); // 斜坡长 ≈ 4.347
  const slopeAngle = Math.atan((ridgeY - eaveY) / halfSpan); // 坡度角 ≈ 0.4014 rad ≈ 23.04°

  // ---- 左坡板：BoxGeometry(宽X, 厚Y, 长Z) ----
  // 宽 4.347（沿斜坡方向），厚 0.2，长 6.6（沿屋脊 Z 方向）
  // position：屋脊 (0,5,0) 与左屋檐 (-4,3.3,0) 的中点 = (-2, 4.15, 0)
  // rotateZ(+slopeAngle)：让 +X 边（屋脊边）上升、-X 边（屋檐边）下降
  const leftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  leftRoof.position.set(-2, 4.15, 0);
  leftRoof.rotation.z = slopeAngle; // 绕 Z 轴正方向旋转
  leftRoof.castShadow = true; // [stage-06] 屋顶投射阴影
  leftRoof.receiveShadow = true;
  houseGroup.add(track(leftRoof));

  // ---- 右坡板：对称 ----
  const rightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeLen, 0.2, ridgeLen),
    roofMat
  );
  rightRoof.position.set(2, 4.15, 0);
  rightRoof.rotation.z = -slopeAngle; // 反向倾斜
  rightRoof.castShadow = true;
  rightRoof.receiveShadow = true;
  houseGroup.add(track(rightRoof));

  // ---- 前山墙：三角形封堵（Shape + ExtrudeGeometry）----
  // 三角形顶点：(-4, 0), (4, 0), (0, 1.7)（底 8m，高 1.7m）
  // extrude 沿 +Z 方向 depth=0.2，position 让底边对齐墙顶 y=3.3
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-4, 0);
  gableShape.lineTo(4, 0);
  gableShape.lineTo(0, 1.7);
  gableShape.lineTo(-4, 0); // 闭合
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 0.2,
    bevelEnabled: false, // 不做倒角，保持简单
  });

  // 前山墙：z=3.0（与墙外表面齐平，墙厚 0.2 在 z∈[2.9,3.1]）
  const frontGable = new THREE.Mesh(gableGeo, gableMat);
  frontGable.position.set(0, 3.3, 3.0);
  frontGable.castShadow = true;
  frontGable.receiveShadow = true;
  houseGroup.add(track(frontGable));

  // 后山墙：z=-3.2（让 extrude 方向沿 +Z，三角形在 z∈[-3.2,-3.0]）
  const backGable = new THREE.Mesh(gableGeo, gableMat);
  backGable.position.set(0, 3.3, -3.2);
  backGable.castShadow = true;
  backGable.receiveShadow = true;
  houseGroup.add(track(backGable));
};

// ============================================================================
//  7. [stage-04] 烟囱 + 室内地板
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
  chimney.position.set(2, 4.5, -1.5); // 立在屋顶上（屋顶在 y≈3.3~5.0）
  chimney.castShadow = true; // [stage-06] 烟囱投射阴影
  chimney.receiveShadow = true;
  houseGroup.add(track(chimney));

  // 室内地板：7.6(X) × 0.05(Y) × 5.6(Z)，中心 (0, 0.325, 0)，浅木色 #d2b48c
  // 铺在地基顶面（地基顶 y=0.3，地板厚 0.05 → 中心 y=0.325）
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
  floor.receiveShadow = true; // [stage-06] 室内地板接收阴影
  houseGroup.add(track(floor));
};

// ============================================================================
//  8. 组装整个房子（House Group）
// ============================================================================
const addHouse = () => {
  // 用 Group 把房子所有部件组织在一起，便于整体移动/旋转
  const houseGroup = new THREE.Group();
  houseGroup.name = "House";

  addWallsAndDoor(houseGroup); // [stage-03] 墙 + 门
  addRoof(houseGroup); // [stage-04] 屋顶 + 山墙
  addChimneyAndFloor(houseGroup); // [stage-04] 烟囱 + 室内地板

  scene.add(houseGroup);
  return houseGroup;
};

// ============================================================================
//  9. [stage-07] 模式切换：鸟瞰 ↔ 第一人称
// ============================================================================
/**
 * 切换相机/控制器模式。
 * @param {'bird'|'roam'} next 下一个模式
 */
const switchMode = (next) => {
  if (next === mode.value) return; // 已经在目标模式，无需切换

  if (next === "roam") {
    // ---- 鸟瞰 → 第一人称 ----
    // 1) 关闭 OrbitControls（避免两套控制器同时响应鼠标）
    orbitControls.enabled = false;
    // 2) 请求指针锁：浏览器会弹出"按 ESC 退出"提示，鼠标隐藏且锁定到画布中心
    //    PointerLockControls 会监听 pointerlockchange 事件，锁成功后才生效
    pointerLockControls.enabled = true;
    pointerLockControls.lock();
    // 3) 切换激活相机到漫游相机
    activeCamera = roamCamera;
    // 4) 重置漫游相机到门口前起始位置（每次进入漫游都从门口开始，便于教学）
    roamCamera.position.copy(ROAM_START_POS);
    roamCamera.lookAt(0, 1.6, 0);
  } else {
    // ---- 第一人称 → 鸟瞰 ----
    // 1) 退出指针锁（如果当前是锁定状态）
    if (pointerLockControls.isLocked) {
      pointerLockControls.unlock();
    }
    pointerLockControls.enabled = false;
    // 2) 重新启用 OrbitControls
    orbitControls.enabled = true;
    orbitControls.update();
    // 3) 切换激活相机到鸟瞰相机
    activeCamera = birdCamera;
  }

  mode.value = next;
};

// ============================================================================
//  10. [stage-07] 键盘事件处理（WASD 移动 + G/F 模式切换）
// ============================================================================
/**
 * keydown 处理：记录 WASD 按键状态 + 监听 G/F 模式切换。
 * 注意：G/F 切换只在 keydown 触发一次（不持续），WASD 用布尔状态在渲染循环里持续读。
 */
const onKeyDown = (e) => {
  // 模式切换键（大小写都支持）
  if (e.code === "KeyG") {
    switchMode("bird");
    return;
  }
  if (e.code === "KeyF") {
    switchMode("roam");
    return;
  }

  // WASD 按键状态：只在漫游模式下记录（鸟瞰模式下 WASD 不响应，避免误操作）
  if (mode.value !== "roam") return;
  switch (e.code) {
    case "KeyW":
    case "ArrowUp":
      keys.w = true;
      break;
    case "KeyA":
    case "ArrowLeft":
      keys.a = true;
      break;
    case "KeyS":
    case "ArrowDown":
      keys.s = true;
      break;
    case "KeyD":
    case "ArrowRight":
      keys.d = true;
      break;
  }
};

/**
 * keyup 处理：松开按键时清除状态。
 */
const onKeyUp = (e) => {
  switch (e.code) {
    case "KeyW":
    case "ArrowUp":
      keys.w = false;
      break;
    case "KeyA":
    case "ArrowLeft":
      keys.a = false;
      break;
    case "KeyS":
    case "ArrowDown":
      keys.s = false;
      break;
    case "KeyD":
    case "ArrowRight":
      keys.d = false;
      break;
  }
};

/**
 * PointerLockControls 的 unlock 事件：用户按 ESC 退出指针锁时触发，
 * 自动切回鸟瞰模式。
 */
const onPointerUnlock = () => {
  if (mode.value === "roam") {
    switchMode("bird");
  }
};

// ============================================================================
//  11. [stage-07] 渲染循环（含 WASD 移动更新）
// ============================================================================
// 用 Clock 计算 delta 时间，保证移动速度与帧率无关（60fps 和 30fps 移动距离一致）
const clock = new THREE.Clock();

const animate = () => {
  animationId = requestAnimationFrame(animate);
  const delta = clock.getDelta(); // 距上一帧的时间（秒）

  if (mode.value === "bird") {
    // 鸟瞰模式：更新 OrbitControls（阻尼需要每帧 update）
    orbitControls.update();
  } else if (mode.value === "roam" && pointerLockControls.isLocked) {
    // 第一人称模式：根据 WASD 按键状态更新相机位置
    // PointerLockControls 提供 moveForward / moveRight 方法，自动按相机朝向移动
    // moveForward(distance)：沿相机视线水平方向前进（保持 y 不变，避免飞行）
    // moveRight(distance)：沿相机右侧水平方向平移
    const distance = ROAM_SPEED * delta; // 这一帧移动距离 = 速度 × 时间
    if (keys.w) pointerLockControls.moveForward(distance);
    if (keys.s) pointerLockControls.moveForward(-distance);
    if (keys.d) pointerLockControls.moveRight(distance);
    if (keys.a) pointerLockControls.moveRight(-distance);

    // 简易边界约束：防止走出草地（±18m），并保持人眼高度 1.6m
    // moveForward/moveRight 直接修改 roamCamera.position，所以这里 clamp 相机位置即可
    roamCamera.position.x = THREE.MathUtils.clamp(roamCamera.position.x, -18, 18);
    roamCamera.position.z = THREE.MathUtils.clamp(roamCamera.position.z, -18, 18);
    roamCamera.position.y = 1.6; // 锁定高度，避免飞起来或掉下去
  }

  // 用激活的相机渲染场景
  renderer.render(scene, activeCamera);
};

// ============================================================================
//  12. resize 处理：两台相机都要更新宽高比/视景体
// ============================================================================
const handleResize = () => {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;

  // 透视相机：更新 aspect
  roamCamera.aspect = aspect;
  roamCamera.updateProjectionMatrix();

  // 正交相机：根据 aspect 更新 left/right（top/bottom 不变，避免拉伸）
  const orthoHalf = 15;
  birdCamera.left = -orthoHalf * aspect;
  birdCamera.right = orthoHalf * aspect;
  birdCamera.updateProjectionMatrix();

  // 渲染器尺寸
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
//  13. 资源释放（dispose）—— 完整释放两台 controls、键盘监听、几何/材质/渲染器
// ============================================================================
const disposeScene = () => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);

  // 释放两套控制器
  if (pointerLockControls) {
    // 解绑 pointerlockchange 事件
    pointerLockControls.removeEventListener("unlock", onPointerUnlock);
    if (pointerLockControls.isLocked) pointerLockControls.unlock();
    pointerLockControls.dispose?.();
    pointerLockControls = null;
  }
  if (orbitControls) {
    orbitControls.dispose();
    orbitControls = null;
  }

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

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  scene = null;
  roamCamera = null;
  birdCamera = null;
  activeCamera = null;
  renderer = null;
};

// ============================================================================
//  14. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/两台相机/两套控制器
  addLights(); // 2. [stage-06] 灯光（阳光+环境光+室内灯+壁灯）+ 阴影
  addGround(); // 3. [stage-01] 草地
  addFoundation(); // 4. [stage-02] 地基 + 台阶
  addHouse(); // 5~7. [stage-03~04] 房子（墙+门+屋顶+烟囱+地板）

  // [stage-07] 注册键盘事件
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  // [stage-07] 监听指针锁解锁（按 ESC 退出时自动切回鸟瞰）
  pointerLockControls.addEventListener("unlock", onPointerUnlock);

  window.addEventListener("resize", handleResize);
  animate(); // 启动渲染循环
});

onUnmounted(() => {
  disposeScene();
});
</script>

<template>
  <div class="house-scene-root">
    <!-- Three.js 渲染画布：铺满整个视口 -->
    <canvas ref="canvasRef" class="scene-canvas" />

    <!-- [stage-07] 操作提示 UI：绝对定位在画布左下角，Element Plus 配色 -->
    <div class="ui-hint">
      <div class="ui-hint__title">
        <span class="ui-hint__dot" :class="{ 'is-roam': mode === 'roam' }"></span>
        当前模式：{{ mode === "bird" ? "鸟瞰（正交相机）" : "第一人称（透视相机）" }}
      </div>
      <div class="ui-hint__row"><kbd>F</kbd> 切换到第一人称漫游</div>
      <div class="ui-hint__row"><kbd>G</kbd> 切换到鸟瞰模式</div>
      <div class="ui-hint__row"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 漫游时前后左右移动</div>
      <div class="ui-hint__row"><kbd>ESC</kbd> 退出指针锁（自动回鸟瞰）</div>
      <div class="ui-hint__tip">提示：第一人称下移动鼠标可转头，进入小屋参观！</div>
    </div>
  </div>
</template>

<style scoped>
.house-scene-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* 操作提示 UI：绝对定位左下角，Element Plus 配色 */
.ui-hint {
  position: absolute;
  left: 20px;
  bottom: 20px;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 8px; /* Element Plus 大圆角 */
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1); /* Element Plus 轻提示投影 */
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei",
    sans-serif;
  font-size: 13px; /* Element Plus small 字号 */
  color: #303133;
  line-height: 1.8;
  user-select: none;
  pointer-events: none; /* 不阻挡画布鼠标事件 */
  min-width: 260px;
  transition: all 0.3s ease-in-out; /* Element Plus 基础过渡 */
}

.ui-hint__title {
  font-size: 14px; /* Element Plus base 字号 */
  font-weight: 600;
  color: #409eff; /* Element Plus 主色 */
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
}

/* 模式指示圆点：鸟瞰=info灰，漫游=success绿 */
.ui-hint__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%; /* Element Plus 圆形 */
  background: #909399; /* info 信息灰 */
  margin-right: 8px;
  transition: background 0.3s ease-in-out;
}
.ui-hint__dot.is-roam {
  background: #67c23a; /* success 成功绿 */
}

.ui-hint__row {
  color: #606266;
  margin: 2px 0;
}

.ui-hint__tip {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
  font-size: 12px; /* Element Plus extra-small 字号 */
  color: #909399; /* info 信息灰 */
}

/* 键位徽章：Element Plus 主色边框 */
kbd {
  display: inline-block;
  min-width: 22px;
  padding: 1px 6px;
  margin: 0 2px;
  background: #ecf5ff; /* 主色浅底 */
  border: 1px solid #d9ecff; /* 主色浅边 */
  border-radius: 4px; /* Element Plus base 圆角 */
  color: #409eff; /* 主色 */
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.4;
}
</style>
