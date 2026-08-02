<script setup>
/**
 * ============================================================================
 *  HouseScene.vue —— 阶段 04：尖屋顶与外墙
 * ----------------------------------------------------------------------------
 *  累积内容（从 stage-01 到 stage-04）：
 *    [stage-01] 草地
 *    [stage-02] 地基平台 + 入口台阶
 *    [stage-03] 四面墙(含门洞/窗洞) + 木门板
 *    [stage-04] 尖屋顶(双坡顶) + 前后山墙 + 烟囱 + 室内地板 + 材质对比球
 *
 *  本阶段新增教学：
 *    1) 搭建人字形双坡顶（2 块倾斜 BoxGeometry 拼接 + 山墙三角形 Shape/ExtrudeGeometry）
 *    2) 给外墙 / 屋顶 / 门 / 室内地板 / 烟囱上 MeshStandardMaterial（PBR）
 *    3) 在草地远处放一组材质对比球，直观对比 5 种材质对光照的响应
 *
 *  屋顶几何精确推导（详见 docs/04.尖屋顶与外墙/02.搭建尖屋顶.md）：
 *    - 屋脊沿 Z 方向（正面山墙朝前），屋脊点 (0, 5.0, 0)
 *    - 墙顶 y = 3.3（墙高 3m，中心 y=1.8）→ 屋檐高度 y = 3.3
 *    - 半跨度 X = 4m（墙宽 8m 的一半）
 *    - 高度差 = 5.0 - 3.3 = 1.7m
 *    - 坡度角 θ = arctan(1.7 / 4) ≈ 23.04°
 *    - 单坡斜长 = sqrt(4² + 1.7²) = sqrt(18.89) ≈ 4.347m
 *    - 屋顶整体中心 (0, 4.15, 0) —— 与 HOUSE_SPEC 完全吻合
 *    - 单坡板中心 (±2, 4.15, 0)
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

// 收集所有需要 dispose 的 geometry / material，便于统一释放
const disposables = [];

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
  // 背景设为天空蓝（Element Plus 主色 #409eff 淡化），方便观察材质
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

  // OrbitControls：拖拽旋转、滚轮缩放
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 启用阻尼，旋转更顺滑
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.5, 0); // 视线中心略抬到房子中部
  controls.update();
};

// ============================================================================
//  2. 灯光（让材质可见的最简配置）
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

  // ---- 木门板：1.0(X) × 2.0(Y) × 0.05(Z)，中心 (0, 1.3, 3.05) ----
  // 略凸出墙面 0.05（墙厚 0.2，门板贴在墙外表面 z=3.1 处，门中心 z=3.125）
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.05), doorMat);
  door.position.set(0, 1.3, 3.125);
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
  houseGroup.add(track(frontGable));

  // 后山墙：z=-3.2（让 extrude 方向沿 +Z，三角形在 z∈[-3.2,-3.0]）
  const backGable = new THREE.Mesh(gableGeo, gableMat);
  backGable.position.set(0, 3.3, -3.2);
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
  houseGroup.add(track(floor));
};

// ============================================================================
//  8. [stage-04] 材质对比球（5 种材质直观对比）
// ============================================================================
const addMaterialSpheres = () => {
  // 共用几何体：半径 0.5 球体
  const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32);

  // 统一颜色：Element Plus 主色 #409eff
  const COLOR = 0x409eff;

  // 5 种材质定义
  const materials = [
    // 1. MeshBasicMaterial：不受光照，恒亮（最适合 UI/线框）
    new THREE.MeshBasicMaterial({ color: COLOR }),
    // 2. MeshLambertMaterial：漫反射，无高光（适合纸张/木材/布料）
    new THREE.MeshLambertMaterial({ color: COLOR }),
    // 3. MeshPhongMaterial：镜面高光，有光泽（适合塑料/陶瓷）
    new THREE.MeshPhongMaterial({
      color: COLOR,
      shininess: 100,
      specular: 0x333333,
    }),
    // 4. MeshStandardMaterial：PBR 金属度+粗糙度（现代主流）
    new THREE.MeshStandardMaterial({
      color: COLOR,
      metalness: 0.5,
      roughness: 0.4,
    }),
    // 5. MeshPhysicalMaterial：PBR 扩展（车漆/玻璃/虹彩）
    new THREE.MeshPhysicalMaterial({
      color: COLOR,
      metalness: 0.5,
      roughness: 0.3,
      clearcoat: 1.0, // 清漆层
      clearcoatRoughness: 0.1,
    }),
  ];

  // 排成一排放在草地远处（x 从 7 到 13，z=-6，y=0.5 球心）
  const startX = 7;
  const gap = 1.5;
  materials.forEach((mat, i) => {
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.set(startX + i * gap, 0.5, -6);
    scene.add(track(sphere));
  });
};

// ============================================================================
//  9. 组装整个房子（House Group）
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
//  10. 渲染循环
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  controls.update(); // OrbitControls 阻尼更新
  renderer.render(scene, camera);
};

// ============================================================================
//  11. resize 处理
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
//  12. 资源释放（dispose）
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
//  13. 生命周期
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景/相机/渲染器/控制器
  addLights(); // 2. 灯光
  addGround(); // 3. [stage-01] 草地
  addFoundation(); // 4. [stage-02] 地基 + 台阶
  addHouse(); // 5~7. [stage-03~04] 房子（墙+门+屋顶+烟囱+地板）
  addMaterialSpheres(); // 8. 材质对比球
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
