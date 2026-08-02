<script setup>
// ============================================================================
// HouseScene.vue · stage-02 地基与台阶
// ----------------------------------------------------------------------------
// 累积内容：stage-01 草地 + 本阶段新增（地基平台 + 入口台阶 + 几何体预览）
// 技术栈：Vite + Vue 3.5 <script setup> + three@0.169.0
// 坐标系：原点 = 房子中心地面点，+Y 向上，+Z 向前（门朝向），+X 向右
// 单位：1 单位 = 1 米
// ============================================================================
import { ref, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// canvas DOM 引用
const canvasRef = ref(null);

// ====== Three.js 对象（组件内部使用，无需响应式包裹）======
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationId = null;

// stage-01 遗留构件
let grass = null; // 草地
let axesHelper = null;
let gridHelper = null;
let ambientLight = null;
let dirLight = null;

// stage-02 新增构件
let foundation = null; // 地基平台
let step1 = null; // 入口台阶第一级（低、远）
let step2 = null; // 入口台阶第二级（高、近）

// 几何体预览（5 件教具）
const previewMeshes = [];

// 收集所有需要 dispose 的几何体与材质，统一清理
const disposableGeometries = [];
const disposableMaterials = [];

// 工具：创建 mesh 并登记 geometry/material 以便后续统一 dispose
const createMesh = (geometry, material) => {
  disposableGeometries.push(geometry);
  disposableMaterials.push(material);
  return new THREE.Mesh(geometry, material);
};

// ============================================================================
// 1. 初始化场景 / 相机 / 渲染器（复用 stage-01 配置）
// ============================================================================
const initScene = () => {
  // 场景：舞台
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f7); // 浅灰蓝背景，避免纯黑显得压抑

  // 透视相机：FOV 50°，近裁面 0.1，远裁面 200（足够容纳 40m 草地）
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  // 初始位置 (12, 8, 12)：从右前上方俯瞰房子，能同时看到草地、地基、台阶
  camera.position.set(12, 8, 12);
  camera.lookAt(0, 0, 0);

  // 渲染器：开启抗锯齿
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
// 2. 初始化灯光（环境光补光 + 平行光主光，复用 stage-01）
// ============================================================================
const initLights = () => {
  // 环境光：均匀补光，避免暗部死黑；强度 0.6 让阴影区也能看清
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // 平行光：模拟阳光，从右前上方照向原点
  dirLight = new THREE.DirectionalLight(0xfffaf0, 1.0); // 暖白光
  dirLight.position.set(10, 15, 8);
  scene.add(dirLight);
};

// ============================================================================
// 3. 初始化构件（草地 + 地基 + 台阶 + 几何体预览）
// ============================================================================
const initObjects = () => {
  // --------------------------------------------------------------------------
  // 3.1 草地（继承自 stage-01）
  // PlaneGeometry(40, 40)：40m × 40m 的矩形平面
  // 颜色 #67c23a Element Plus 成功绿
  // 平面默认在 XY 平面、朝 +Z，需绕 X 轴旋转 -90° 躺平成 XZ 地面
  // --------------------------------------------------------------------------
  const grassGeo = new THREE.PlaneGeometry(40, 40);
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x67c23a, // 成功绿
    roughness: 0.95, // 草地粗糙
    metalness: 0.0,
  });
  grass = createMesh(grassGeo, grassMat);
  grass.rotation.x = -Math.PI / 2; // 躺平
  grass.position.set(0, 0, 0);
  scene.add(grass);

  // --------------------------------------------------------------------------
  // 3.2 地基平台（本阶段新增）
  // BoxGeometry(8, 0.3, 6)：8m 宽(X) × 0.3m 高(Y) × 6m 深(Z)
  // position(0, 0.15, 0)：底面贴地（y=0），顶面在 y=0.3
  // 颜色 #909399 Element Plus 信息灰
  // --------------------------------------------------------------------------
  const foundationGeo = new THREE.BoxGeometry(8, 0.3, 6);
  const foundationMat = new THREE.MeshStandardMaterial({
    color: 0x909399, // 信息灰
    roughness: 0.8,
    metalness: 0.0,
  });
  foundation = createMesh(foundationGeo, foundationMat);
  foundation.position.set(0, 0.15, 0);
  scene.add(foundation);

  // --------------------------------------------------------------------------
  // 3.3 入口台阶（本阶段新增，2 级）
  // 每级 BoxGeometry(1.5, 0.15, 0.4)：1.5m 宽 × 0.15m 高 × 0.4m 深
  // 第一级（低、远）：position(0, 0.075, 3.2) —— 顶面 y=0.15
  // 第二级（高、近）：position(0, 0.225, 3.0) —— 顶面 y=0.30，与地基顶面齐平
  // +Z 为「前方」（门朝向），台阶向 +Z 探出地基外
  // 地基前缘在 z=3，第二级 z=3.0 正好对齐前缘，第一级 z=3.2 探出 0.2m
  // --------------------------------------------------------------------------
  const stepGeo = new THREE.BoxGeometry(1.5, 0.15, 0.4);
  const stepMat = new THREE.MeshStandardMaterial({
    color: 0x909399, // 与地基同灰
    roughness: 0.8,
    metalness: 0.0,
  });
  // 注意：两块台阶共享同一份 geometry 与 material，dispose 时只需释放一次
  // 因此先登记一次，再用同一对象创建两个 Mesh
  disposableGeometries.push(stepGeo);
  disposableMaterials.push(stepMat);

  step1 = new THREE.Mesh(stepGeo, stepMat);
  step1.position.set(0, 0.075, 3.2); // 低阶、远（向外探出）
  scene.add(step1);

  step2 = new THREE.Mesh(stepGeo, stepMat);
  step2.position.set(0, 0.225, 3.0); // 高阶、近（紧贴地基前缘）
  scene.add(step2);

  // --------------------------------------------------------------------------
  // 3.4 几何体预览（本阶段新增 · 教学用）
  // 在远处 z = -8 排成一行，展示 5 种内置几何体的代表形态
  // 颜色用 Element Plus 五色调色：主色蓝 / 成功绿 / 警告黄 / 危险红 / 信息灰
  // X 坐标：-6, -3, 0, 3, 6（间距 3m，避免重叠）
  // Y 坐标：统一 0.5，让物体「坐」在草地上（半径约 0.5~0.6）
  // --------------------------------------------------------------------------
  const previewY = 0.5;
  const previewZ = -8;

  // (1) BoxGeometry 立方体 —— 主色蓝
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x409eff, // 主色
    roughness: 0.5,
    metalness: 0.1,
  });
  const boxMesh = createMesh(boxGeo, boxMat);
  boxMesh.position.set(-6, previewY, previewZ);
  scene.add(boxMesh);
  previewMeshes.push(boxMesh);

  // (2) SphereGeometry 球体 —— 成功绿
  // SphereGeometry(0.6, 32, 16)：半径 0.6，经线 32 段，纬线 16 段，足够平滑
  const sphereGeo = new THREE.SphereGeometry(0.6, 32, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x67c23a, // 成功色
    roughness: 0.4,
    metalness: 0.1,
  });
  const sphereMesh = createMesh(sphereGeo, sphereMat);
  sphereMesh.position.set(-3, previewY, previewZ);
  scene.add(sphereMesh);
  previewMeshes.push(sphereMesh);

  // (3) ConeGeometry 圆锥 —— 警告黄
  // ConeGeometry(0.6, 1.2, 32)：底半径 0.6，高 1.2，圆周 32 段
  const coneGeo = new THREE.ConeGeometry(0.6, 1.2, 32);
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0xe6a23c, // 警告色
    roughness: 0.5,
    metalness: 0.1,
  });
  const coneMesh = createMesh(coneGeo, coneMat);
  coneMesh.position.set(0, previewY, previewZ);
  scene.add(coneMesh);
  previewMeshes.push(coneMesh);

  // (4) CylinderGeometry 圆柱 —— 危险红
  // CylinderGeometry(0.5, 0.5, 1.2, 32)：顶/底半径均 0.5，高 1.2，圆周 32 段
  const cylinderGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32);
  const cylinderMat = new THREE.MeshStandardMaterial({
    color: 0xf56c6c, // 危险色
    roughness: 0.5,
    metalness: 0.1,
  });
  const cylinderMesh = createMesh(cylinderGeo, cylinderMat);
  cylinderMesh.position.set(3, previewY, previewZ);
  scene.add(cylinderMesh);
  previewMeshes.push(cylinderMesh);

  // (5) TorusGeometry 圆环 —— 信息灰
  // TorusGeometry(0.5, 0.2, 16, 64)：环中心到管中心 0.5，管半径 0.2
  // 默认在 XY 平面，绕 X 轴旋转 90° 让它「立」起来更像甜甜圈
  const torusGeo = new THREE.TorusGeometry(0.5, 0.2, 16, 64);
  const torusMat = new THREE.MeshStandardMaterial({
    color: 0x909399, // 信息色
    roughness: 0.4,
    metalness: 0.1,
  });
  const torusMesh = createMesh(torusGeo, torusMat);
  torusMesh.position.set(6, previewY, previewZ);
  torusMesh.rotation.x = Math.PI / 2; // 立起来
  scene.add(torusMesh);
  previewMeshes.push(torusMesh);

  // --------------------------------------------------------------------------
  // 3.5 辅助工具（复用 stage-01）
  // AxesHelper：红 X / 绿 Y / 蓝 Z 三轴，长度 5m
  // GridHelper：XZ 平面网格，大小 40m × 40 等分，主色蓝、次色灰
  // --------------------------------------------------------------------------
  axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  gridHelper = new THREE.GridHelper(40, 40, 0x409eff, 0xc0c4cc);
  scene.add(gridHelper);
};

// ============================================================================
// 4. 初始化轨道控制器（复用 stage-01）
// ============================================================================
const initControls = () => {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 阻尼惯性，拖拽更顺滑
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0.3, 0); // 注视地基顶面高度，方便观察台阶
  controls.minDistance = 3; // 限制最近缩放，避免穿入地基
  controls.maxDistance = 60; // 限制最远缩放，避免飞出草地
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // 不让相机翻到地下
};

// ============================================================================
// 5. 渲染循环
// ============================================================================
const animate = () => {
  animationId = requestAnimationFrame(animate);

  // 让远处几何体预览缓慢自转，方便从任意角度观察形状
  previewMeshes.forEach((mesh, i) => {
    mesh.rotation.y += 0.005 + i * 0.001; // 每个略不同速度，避免整齐划一
  });

  controls.update();
  renderer.render(scene, camera);
};

// ============================================================================
// 6. 窗口大小适配
// ============================================================================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ============================================================================
// 7. 资源清理（dispose 全套，防止显存泄漏）
// ============================================================================
const disposeScene = () => {
  // 7.1 停止渲染循环
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // 7.2 移除事件监听
  window.removeEventListener("resize", handleResize);

  // 7.3 释放轨道控制器
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // 7.4 释放辅助工具
  if (axesHelper) {
    axesHelper.dispose();
    axesHelper = null;
  }
  if (gridHelper) {
    gridHelper.geometry.dispose();
    gridHelper.material.dispose();
    gridHelper = null;
  }

  // 7.5 释放所有几何体与材质（草地 / 地基 / 台阶 / 5 件预览）
  // 注意：两块台阶共享同一份 geometry 与 material，登记时只 push 一次，所以这里释放安全
  disposableGeometries.forEach((g) => g.dispose());
  disposableMaterials.forEach((m) => m.dispose());
  disposableGeometries.length = 0;
  disposableMaterials.length = 0;

  // 清空 mesh 引用
  grass = null;
  foundation = null;
  step1 = null;
  step2 = null;
  previewMeshes.length = 0;

  // 7.6 移除并释放灯光（DirectionalLight / AmbientLight 本身无 geometry/material，但可移除 target）
  if (scene) {
    scene.remove(ambientLight);
    scene.remove(dirLight);
  }
  ambientLight = null;
  dirLight = null;

  // 7.7 释放渲染器
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  // 7.8 清空场景与相机引用
  scene = null;
  camera = null;
};

// ============================================================================
// 8. 生命周期：挂载时按依赖顺序初始化，卸载时清理
// ============================================================================
onMounted(() => {
  initScene(); // 1. 场景 / 相机 / 渲染器
  initLights(); // 2. 灯光
  initObjects(); // 3. 构件（草地 + 地基 + 台阶 + 几何体预览 + 辅助工具）
  initControls(); // 4. 轨道控制器（依赖 renderer.domElement）
  animate(); // 5. 启动渲染循环

  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  disposeScene();
});
</script>

<template>
  <!-- Three.js 渲染画布，全屏铺满 -->
  <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%"></canvas>
</template>
