<script setup>
/**
 * HouseScene.vue
 * ─────────────────────────────────────────────────────────────
 * 欧式乡村小屋 · 阶段 01：项目启动
 *
 * 本阶段建造内容：
 *   1. 施工场地（Scene / Camera / Renderer 三件套）
 *   2. 草地地皮（PlaneGeometry 40×40，#67c23a 成功绿）
 *   3. 辅助工具（AxesHelper / GridHelper，便于观察坐标系）
 *   4. 临时光照（环境光 + 平行光，仅用于照亮草地，正式灯光在 stage-06）
 *   5. OrbitControls 鼠标轨道控制器，可自由浏览施工场地
 *
 * 坐标系约定（来自 HOUSE_SPEC）：
 *   - 原点 (0,0,0) = 房子中心地面点
 *   - +Y 向上，+Z 向前（门朝向），+X 向右
 *   - 右手坐标系，1 单位 = 1 米，地面 y=0
 *
 * 生命周期：
 *   - onMounted 初始化 Three.js 资源
 *   - onUnmounted 完整 dispose，防止内存泄漏
 */
import { onMounted, onUnmounted, ref } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// 用于挂载 canvas 的 DOM 容器引用
const containerRef = ref(null);

// 把所有需要 dispose 的资源挂在普通对象上，便于统一清理
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationId = null;
let resizeHandler = null;

// 草地相关资源（单独引用，便于 dispose）
let grassGeometry = null;
let grassMaterial = null;
let grassMesh = null;

// 辅助工具
let axesHelper = null;
let gridHelper = null;

// 临时灯光（stage-06 会替换为正式灯光方案）
let ambientLight = null;
let directionalLight = null;

/**
 * 初始化整个 3D 场景
 * 步骤：Scene → Camera → Renderer → Lights → Ground → Helpers → Controls → Loop
 */
function initScene() {
  const container = containerRef.value;
  const width = container.clientWidth;
  const height = container.clientHeight;

  // ─── 1. 场景 ─────────────────────────────────────────────
  // Scene 是所有 3D 物体、灯光、辅助工具的容器
  scene = new THREE.Scene();
  // 设置背景色为天空蓝灰，方便和草地形成对比
  scene.background = new THREE.Color(0xcfd8e3);

  // ─── 2. 透视相机 ─────────────────────────────────────────
  // PerspectiveCamera(fov, aspect, near, far)
  //   fov: 视野角度 50°，接近人眼舒适范围
  //   aspect: 宽高比 = 容器宽度 / 高度
  //   near/far: 0.1 ~ 200，覆盖整个 40×40 场地
  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
  // 初始位置 (12, 8, 12)：从右前上方俯瞰施工场地
  camera.position.set(12, 8, 12);
  // 看向 (0, 1, 0)：原点稍上方（未来房子中心）
  camera.lookAt(0, 1, 0);

  // ─── 3. WebGL 渲染器 ─────────────────────────────────────
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  // 限制像素比上限为 2，避免高分屏过度渲染拖慢性能
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // ─── 4. 临时光照（正式灯光在 stage-06）─────────────────
  // 环境光：整体均匀照亮，避免阴影区域全黑
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // 平行光：模拟太阳光，带方向性，让草地有明暗变化
  directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 15, 8);
  scene.add(directionalLight);

  // ─── 5. 草地地皮 ─────────────────────────────────────────
  // PlaneGeometry(40, 40)：40m × 40m 的平面
  grassGeometry = new THREE.PlaneGeometry(40, 40);
  // MeshStandardMaterial：PBR 标准材质，颜色 #67c23a（Element Plus 成功绿）
  grassMaterial = new THREE.MeshStandardMaterial({ color: 0x67c23a });
  grassMesh = new THREE.Mesh(grassGeometry, grassMaterial);
  // PlaneGeometry 默认在 XY 平面（垂直于屏幕），需要绕 X 轴旋转 -90° 才能平铺到地面
  grassMesh.rotation.x = -Math.PI / 2;
  // 草地表面正好在 y=0
  grassMesh.position.y = 0;
  scene.add(grassMesh);

  // ─── 6. 辅助工具 ─────────────────────────────────────────
  // AxesHelper(5)：三色坐标轴，红=X 绿=Y 蓝=Z，长度 5m
  axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  // GridHelper(40, 40)：40m × 40m 网格，每 1m 一格，便于目测尺寸
  gridHelper = new THREE.GridHelper(40, 40);
  scene.add(gridHelper);

  // ─── 7. OrbitControls 轨道控制器 ─────────────────────────
  // 允许鼠标左键旋转、右键平移、滚轮缩放
  controls = new OrbitControls(camera, renderer.domElement);
  // 控制器目标点设为房子中心地面附近
  controls.target.set(0, 1, 0);
  // 启用阻尼，让旋转/缩放有惯性，更顺滑
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // 限制缩放范围，避免拉太近穿模或拉太远看不见
  controls.minDistance = 3;
  controls.maxDistance = 60;
  // 限制俯仰角，禁止翻到地下
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();

  // ─── 8. 渲染循环 ─────────────────────────────────────────
  // 每帧重新渲染场景，并更新控制器阻尼
  const animate = () => {
    animationId = requestAnimationFrame(animate);
    // OrbitControls 阻尼模式必须在每帧调用 update()
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  // ─── 9. 自适应窗口大小 ───────────────────────────────────
  resizeHandler = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", resizeHandler);
}

/**
 * 销毁所有 Three.js 资源，防止组件卸载后内存泄漏
 * 释放顺序：停止循环 → 移除事件 → dispose 控制器 → dispose 几何/材质
 *         → 从场景移除 → dispose 渲染器 → 清空 canvas
 */
function disposeScene() {
  // 1. 停止渲染循环
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // 2. 移除 resize 监听
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  // 3. dispose 控制器
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // 4. dispose 草地
  if (grassMesh) {
    scene.remove(grassMesh);
    grassGeometry.dispose();
    grassMaterial.dispose();
    grassMesh = null;
    grassGeometry = null;
    grassMaterial = null;
  }

  // 5. 移除辅助工具（Helper 不需要显式 dispose 几何/材质，移除即可）
  if (axesHelper) {
    scene.remove(axesHelper);
    axesHelper = null;
  }
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper = null;
  }

  // 6. 移除灯光
  if (ambientLight) {
    scene.remove(ambientLight);
    ambientLight = null;
  }
  if (directionalLight) {
    scene.remove(directionalLight);
    directionalLight = null;
  }

  // 7. dispose 渲染器并移除 canvas
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;
  }

  // 8. 清空场景引用
  scene = null;
  camera = null;
}

// 组件挂载时初始化场景
onMounted(() => {
  initScene();
});

// 组件卸载时彻底清理资源
onUnmounted(() => {
  disposeScene();
});
</script>

<template>
  <!-- 3D 画布的挂载容器，全屏铺满 -->
  <div ref="containerRef" class="scene-container"></div>
</template>

<style scoped>
.scene-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  /* 深色背景，让 canvas 融合更自然 */
  background: #1f1f1f;
}
</style>
