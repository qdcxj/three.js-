<script setup>
/**
 * HouseScene.vue —— stage-03 墙体与门窗洞
 * ----------------------------------------------------------------
 * 累积内容：草地 + 地基 + 入口台阶 + 四面墙（含门窗洞）+ 门板
 *
 * 学习重点：
 *   1. Object3D 基类与 position / rotation / scale 三大变换
 *   2. Group 场景图父子层级、traverse、getObjectByName
 *   3. 用「多块 Box 拼接」实现墙体留洞（不用 CSG）
 *   4. 命名 door 节点，为 stage-08 开关门动画预留接口
 *
 * 坐标系（HOUSE_SPEC.md）：
 *   原点 (0,0,0) = 房子中心地面点
 *   +Y 向上、+Z 向前（门朝向）、+X 向右；单位：米
 *
 * 注：本阶段灯光为「预览灯光」，正式灯光（阳光/环境光/室内灯/壁灯）
 *     在 stage-06 引入。这里加一束平行光 + 弱环境光，仅为了让
 *     MeshStandardMaterial 墙体能被看见。
 */
import { ref, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// canvas DOM 引用
const canvasRef = ref(null);

// Three.js 对象（组件内部使用，无需响应式）
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationId = null;

// 用一个数组收集所有「需要 dispose 的根节点」，便于统一释放
// 每个根节点用 traverse 释放其下所有 geometry / material
const disposableRoots = [];

// ===================== 1. 草地 =====================
function createGround() {
  // PlaneGeometry 默认在 XY 平面，需要绕 X 轴旋转 -90° 躺平到 XZ 平面
  const geometry = new THREE.PlaneGeometry(40, 40);
  const material = new THREE.MeshStandardMaterial({
    color: 0x67c23a, // Element Plus 成功绿
    roughness: 1.0,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2; // 躺平
  ground.position.set(0, 0, 0);
  ground.name = "ground";
  return ground;
}

// ===================== 2. 地基平台 =====================
function createFoundation() {
  // 8(X) × 6(Z) × 0.3(Y)，中心 (0, 0.15, 0)
  // 顶面 y=0.3 是墙体底部，所以墙体中心 y=1.8 时墙体上下范围 0.3~3.3
  const geometry = new THREE.BoxGeometry(8, 0.3, 6);
  const material = new THREE.MeshStandardMaterial({
    color: 0x909399, // Element Plus 信息灰
    roughness: 0.9,
    metalness: 0.0,
  });
  const foundation = new THREE.Mesh(geometry, material);
  foundation.position.set(0, 0.15, 0);
  foundation.name = "foundation";
  return foundation;
}

// ===================== 3. 入口台阶（2 级）=====================
function createSteps() {
  // 每级 1.5(X) × 0.4(Z) × 0.15(Y)
  // 下级（远）：中心 (0, 0.075, 3.6)，顶面 y=0.15
  // 上级（近）：中心 (0, 0.225, 3.2)，顶面 y=0.30 = 地基顶面
  // 两级在 z 方向相邻不重叠（上级 z 范围 3.0~3.4，下级 z 范围 3.4~3.8）
  const stepsGroup = new THREE.Group();
  stepsGroup.name = "steps";

  const geometry = new THREE.BoxGeometry(1.5, 0.15, 0.4);
  const material = new THREE.MeshStandardMaterial({
    color: 0x909399,
    roughness: 0.9,
    metalness: 0.0,
  });

  // 下级台阶（离房子较远）
  const stepLower = new THREE.Mesh(geometry, material);
  stepLower.position.set(0, 0.075, 3.6);
  stepLower.name = "step-lower";

  // 上级台阶（紧贴地基前缘）
  const stepUpper = new THREE.Mesh(geometry, material);
  stepUpper.position.set(0, 0.225, 3.2);
  stepUpper.name = "step-upper";

  stepsGroup.add(stepLower, stepUpper);
  return stepsGroup;
}

// ===================== 4. 墙体材质工厂 =====================
function createWallMaterial() {
  // 暖米色 #e6d5b8，所有墙体共享同一个材质实例以节省显存
  return new THREE.MeshStandardMaterial({
    color: 0xe6d5b8,
    roughness: 0.85,
    metalness: 0.0,
  });
}

// 小工具：根据尺寸 + 中心位置创建一块墙体 Mesh
function makeWallBox(width, height, depth, x, y, z, material, name) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  return mesh;
}

// ===================== 5. 后墙（整块无洞）=====================
function createBackWall(material) {
  // 8(X) × 3(Y) × 0.2(Z)，中心 (0, 1.8, -3)
  // 墙体范围：x[-4,4] y[0.3,3.3] z[-3.1,-2.9]
  return makeWallBox(8, 3, 0.2, 0, 1.8, -3, material, "back-wall");
}

// ===================== 6. 左墙（带侧窗洞）=====================
function createLeftWall(material) {
  // 整体 0.2(X) × 3(Y) × 6(Z)，中心 (-4, 1.8, 0)
  // 范围：x[-4.1,-3.9] y[0.3,3.3] z[-3,3]
  // 窗洞 1.2(Z) × 1.2(Y)，中心 (-4, 1.5, 0)
  //   窗洞范围：z[-0.6,0.6] y[0.9,2.1]
  // 拼成 4 块：前段、后段、下沿（窗台）、上沿（窗顶）
  const group = new THREE.Group();
  group.name = "left-wall";

  // 前段（z=0.6~3.0），整高 3.0，中心 z=1.8
  group.add(makeWallBox(0.2, 3.0, 2.4, -4, 1.8, 1.8, material, "left-wall-front"));
  // 后段（z=-3.0~-0.6），整高 3.0，中心 z=-1.8
  group.add(makeWallBox(0.2, 3.0, 2.4, -4, 1.8, -1.8, material, "left-wall-back"));
  // 窗台（z=-0.6~0.6, y=0.3~0.9），中心 (−4, 0.6, 0)
  group.add(makeWallBox(0.2, 0.6, 1.2, -4, 0.6, 0, material, "left-wall-sill"));
  // 窗顶（z=-0.6~0.6, y=2.1~3.3），中心 (−4, 2.7, 0)
  group.add(makeWallBox(0.2, 1.2, 1.2, -4, 2.7, 0, material, "left-wall-header"));

  return group;
}

// ===================== 7. 右墙（带侧窗洞，与左墙对称）=====================
function createRightWall(material) {
  const group = new THREE.Group();
  group.name = "right-wall";

  group.add(makeWallBox(0.2, 3.0, 2.4, 4, 1.8, 1.8, material, "right-wall-front"));
  group.add(makeWallBox(0.2, 3.0, 2.4, 4, 1.8, -1.8, material, "right-wall-back"));
  group.add(makeWallBox(0.2, 0.6, 1.2, 4, 0.6, 0, material, "right-wall-sill"));
  group.add(makeWallBox(0.2, 1.2, 1.2, 4, 2.7, 0, material, "right-wall-header"));

  return group;
}

// ===================== 8. 前墙（带门洞 + 2 个窗洞）=====================
function createFrontWall(material) {
  // 整体 8(X) × 3(Y) × 0.2(Z)，中心 (0, 1.8, 3)
  // 范围：x[-4,4] y[0.3,3.3] z[2.9,3.1]
  // 门洞：1.0(X) × 2.0(Y)，中心 (0, 1.3, 3) → x[-0.5,0.5] y[0.3,2.3]
  // 左窗洞：0.8(X) × 1.2(Y)，中心 (-2, 1.5, 3) → x[-2.4,-1.6] y[0.9,2.1]
  // 右窗洞：0.8(X) × 1.2(Y)，中心 (2, 1.5, 3) → x[1.6,2.4] y[0.9,2.1]
  // 拼成 9 块（详见文档 03.砌四面墙.md 的尺寸推演）
  const group = new THREE.Group();
  group.name = "front-wall";

  // ① 左端块：x[-4,-2.4]，整高 3.0，中心 (-3.2, 1.8, 3)
  group.add(makeWallBox(1.6, 3.0, 0.2, -3.2, 1.8, 3, material, "front-wall-left-edge"));
  // ② 左窗台：x[-2.4,-1.6], y[0.3,0.9]，中心 (-2, 0.6, 3)
  group.add(makeWallBox(0.8, 0.6, 0.2, -2, 0.6, 3, material, "front-wall-left-sill"));
  // ③ 左窗顶：x[-2.4,-1.6], y[2.1,3.3]，中心 (-2, 2.7, 3)
  group.add(makeWallBox(0.8, 1.2, 0.2, -2, 2.7, 3, material, "front-wall-left-header"));
  // ④ 门洞左侧块：x[-1.6,-0.5]，整高 3.0，中心 (-1.05, 1.8, 3)
  group.add(makeWallBox(1.1, 3.0, 0.2, -1.05, 1.8, 3, material, "front-wall-left-of-door"));
  // ⑤ 门洞上方块：x[-0.5,0.5], y[2.3,3.3]，中心 (0, 2.8, 3)
  group.add(makeWallBox(1.0, 1.0, 0.2, 0, 2.8, 3, material, "front-wall-above-door"));
  // ⑥ 门洞右侧块：x[0.5,1.6]，整高 3.0，中心 (1.05, 1.8, 3)
  group.add(makeWallBox(1.1, 3.0, 0.2, 1.05, 1.8, 3, material, "front-wall-right-of-door"));
  // ⑦ 右窗台：x[1.6,2.4], y[0.3,0.9]，中心 (2, 0.6, 3)
  group.add(makeWallBox(0.8, 0.6, 0.2, 2, 0.6, 3, material, "front-wall-right-sill"));
  // ⑧ 右窗顶：x[1.6,2.4], y[2.1,3.3]，中心 (2, 2.7, 3)
  group.add(makeWallBox(0.8, 1.2, 0.2, 2, 2.7, 3, material, "front-wall-right-header"));
  // ⑨ 右端块：x[2.4,4]，整高 3.0，中心 (3.2, 1.8, 3)
  group.add(makeWallBox(1.6, 3.0, 0.2, 3.2, 1.8, 3, material, "front-wall-right-edge"));

  return group;
}

// ===================== 9. 门板 =====================
function createDoor() {
  // 1.0(X) × 2.0(Y) × 0.05(Z)，中心 (0, 1.3, 3.05)
  // 门板正好嵌入门洞（门洞 x[-0.5,0.5] y[0.3,2.3]）
  // z=3.05 略前于墙体中心 z=3.0，使门板贴在墙的前侧
  const geometry = new THREE.BoxGeometry(1.0, 2.0, 0.05);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b, // 木色
    roughness: 0.7,
    metalness: 0.0,
  });
  const door = new THREE.Mesh(geometry, material);
  door.position.set(0, 1.3, 3.05);
  door.name = "door"; // 关键：命名供 stage-08 动画 getObjectByName 查找
  return door;
}

// ===================== 10. 整栋房子 Group =====================
function createHouse() {
  // 用 Group 把墙体 + 门组织成「一栋房子」整体
  // 好处：移动/旋转整栋房子只需改 house.position / house.rotation
  const house = new THREE.Group();
  house.name = "house";

  // 共享一份墙体材质（节省显存，dispose 时只释放一次）
  const wallMaterial = createWallMaterial();

  // wallsGroup 子层：把所有墙归到一起，方便整体隐藏/批量操作
  const wallsGroup = new THREE.Group();
  wallsGroup.name = "walls";
  wallsGroup.add(createBackWall(wallMaterial));
  wallsGroup.add(createLeftWall(wallMaterial));
  wallsGroup.add(createRightWall(wallMaterial));
  wallsGroup.add(createFrontWall(wallMaterial));
  house.add(wallsGroup);

  // 门板：直接挂到 house 下（不进 wallsGroup）
  // 因为门是「活动构件」，stage-08 会单独旋转
  const door = createDoor();
  house.add(door);

  return house;
}

// ===================== 11. 预览灯光 =====================
function createPreviewLights() {
  const group = new THREE.Group();
  group.name = "preview-lights";

  // 弱环境光：保证所有面都有基础亮度（防止纯黑）
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  ambient.name = "ambient";
  group.add(ambient);

  // 一束斜上方平行光，模拟阳光方向（正式阳光在 stage-06）
  const dir = new THREE.DirectionalLight(0xfffaf0, 0.85);
  dir.position.set(10, 15, 8);
  dir.target.position.set(0, 0, 0);
  dir.name = "preview-sun";
  group.add(dir);
  group.add(dir.target);

  return group;
}

// ===================== 主初始化 =====================
const initScene = () => {
  // 1. 场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd8e6); // 浅天空蓝，让墙体更突出

  // 2. 相机：PerspectiveCamera(50, aspect, 0.1, 200)，初始 (12, 8, 12) 看向 (0, 1, 0)
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(12, 8, 12);
  camera.lookAt(0, 1, 0);

  // 3. 渲染器
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 4. 预览灯光
  const lights = createPreviewLights();
  scene.add(lights);
  disposableRoots.push(lights); // 灯光本身无 geometry/material，但加入根列表方便统一管理

  // 5. 草地
  const ground = createGround();
  scene.add(ground);
  disposableRoots.push(ground);

  // 6. 地基
  const foundation = createFoundation();
  scene.add(foundation);
  disposableRoots.push(foundation);

  // 7. 台阶
  const steps = createSteps();
  scene.add(steps);
  disposableRoots.push(steps);

  // 8. 房子（含墙体 + 门）
  const house = createHouse();
  scene.add(house);
  disposableRoots.push(house);

  // 9. 演示 getObjectByName 查找：把门打印到控制台
  //    在 stage-08 中，开关门动画会通过这种方式拿到 door 引用
  const foundDoor = house.getObjectByName("door");
  console.log("[stage-03] 通过 getObjectByName 找到：", foundDoor?.name);

  // 10. 轨道控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1, 0); // 看向房子中部
  controls.minDistance = 4;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // 不让相机钻到地下

  // 11. 启动渲染循环
  animate();
};

// ===================== 渲染循环 =====================
const animate = () => {
  animationId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

// ===================== 窗口尺寸变化 =====================
const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// ===================== 资源释放 =====================
const disposeScene = () => {
  // 1. 停止动画
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // 2. 移除事件
  window.removeEventListener("resize", handleResize);

  // 3. 释放 geometry / material
  //    遍历每个根节点，对所有 Mesh 释放其 geometry 与 material
  //    注意：墙体材质是共享的，dispose 会被多次调用，Three.js 内部会做幂等处理
  disposableRoots.forEach((root) => {
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  });
  disposableRoots.length = 0;

  // 4. 释放控制器
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // 5. 释放渲染器
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  // 6. 清空场景（释放 scene 持有的引用）
  if (scene) {
    scene.clear();
  }
};

// ===================== 生命周期 =====================
onMounted(() => {
  initScene();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  disposeScene();
});
</script>

<template>
  <!-- Three.js 渲染画布：撑满整个视口 -->
  <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%"></canvas>
</template>
