---
title: Three.js 案例合集
date: 2026-07-31
article: true
---

<div style="
  width: 100%;
  height: 300px;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: -16px -24px 24px -24px;
  position: relative;
  overflow: hidden;
">
  <div style="
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url(/vite-three-banner.svg) center/cover no-repeat;
    opacity: 0.4;
  "></div>
  <div style="
    position: absolute;
    width: 120px;
    height: 120px;
    border: 2px solid rgba(129, 140, 248, 0.3);
    top: 30px;
    right: 80px;
    transform: rotate(45deg);
  "></div>
  <div style="
    position: absolute;
    width: 80px;
    height: 80px;
    border: 2px solid rgba(129, 140, 248, 0.2);
    top: 100px;
    right: 180px;
    transform: rotate(30deg);
  "></div>
  <div style="
    position: relative;
    text-align: center;
    z-index: 10;
  ">
    <div style="
      font-size: 64px;
      font-weight: 700;
      background: linear-gradient(135deg, #60a5fa 0%, #34d399 50%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: 0.05em;
    ">案例合集</div>
    <div style="
      font-size: 16px;
      color: #94a3b8;
      margin-top: 8px;
      opacity: 0.8;
    ">
      现代 Web 3D 开发指南
    </div>
  </div>
</div>

# 🏆 Three.js 案例合集

学完了基础概念、几何体、材质、贴图、灯光、相机，是时候把它们组合起来，做出真实可运行的项目了！本章精选 6 个由浅入深的实战案例，覆盖 Three.js 最常见的应用场景。

## 案例列表

| 序号 | 案例 | 核心知识点 | 难度 |
|------|------|-----------|------|
| 01 | 旋转立方体 | Scene + Camera + Renderer + 几何体 + 光照 | 🟢 入门 |
| 02 | 太阳系动画 | Group 分组 + 父子关系 + 多层旋转 | 🟢 入门 |
| 03 | 粒子星空 | Points + BufferGeometry + 顶点颜色 | 🟡 进阶 |
| 04 | 3D 产品展示 | GLTFLoader + OrbitControls + 自动旋转 | 🟡 进阶 |
| 05 | 交互式 3D 柱状图 | Raycaster + 数据驱动 + 悬停高亮 | 🔴 高级 |
| 06 | 着色器波纹效果 | ShaderMaterial + GLSL + Uniform | 🔴 高级 |

::: tip 学习建议
建议按顺序完成案例 1-3，它们是基础巩固。案例 4-6 涉及更复杂的交互与着色器，可根据兴趣选学。每个案例都提供完整可运行代码，复制到项目中即可运行。
:::

---

## 01. 旋转立方体（Hello Cube）

这是 Three.js 的「Hello World」--一个旋转的彩色立方体。它串起了三大核心：场景（Scene）、相机（Camera）、渲染器（Renderer），并加入了光照和渲染循环。

**核心知识点**：Scene + Camera + Renderer + BoxGeometry + 光照 + 渲染循环

```js
import * as THREE from 'three';

// ===== 1. 创建场景 =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e); // 深色背景

// ===== 2. 创建透视相机 =====
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(3, 3, 5);
camera.lookAt(0, 0, 0);

// ===== 3. 创建渲染器 =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// ===== 4. 创建立方体 =====
const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const material = new THREE.MeshStandardMaterial({
  color: 0x409eff,   // Element 蓝
  roughness: 0.4,
  metalness: 0.3,
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// ===== 5. 添加灯光 =====
// 环境光补光
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);
// 平行光（主光）
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// ===== 6. 渲染循环（旋转立方体）=====
function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01; // 绕 x 轴旋转
  cube.rotation.y += 0.01; // 绕 y 轴旋转
  renderer.render(scene, camera);
}
animate();

// ===== 7. 窗口适配 =====
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
```

---

## 02. 太阳系动画

通过 `Group`（分组）的父子关系，实现太阳、地球、月亮的多层旋转。这是理解 3D 层级变换的经典案例。

**核心知识点**：Group 分组 + 父子关系 + 多层旋转 + PointLight

```js
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 15, 25);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// ===== 太阳 =====
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(2, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffaa33 }) // 太阳自发光，不受光照影响
);
scene.add(sun);

// 太阳发出的点光源
const sunLight = new THREE.PointLight(0xffcc66, 200, 100, 2);
sun.add(sunLight); // 光源跟随太阳

// 环境光微弱补光
scene.add(new THREE.AmbientLight(0xffffff, 0.05));

// ===== 地球轨道组（旋转此组 = 地球公转）=====
const earthOrbit = new THREE.Group();
scene.add(earthOrbit);

// ===== 地球 =====
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x409eff, roughness: 0.7 })
);
earth.position.x = 8; // 地球离太阳 8 个单位
earthOrbit.add(earth);

// ===== 月亮轨道组（挂在地球下，跟随地球移动）=====
const moonOrbit = new THREE.Group();
earth.add(moonOrbit); // ★ 月亮轨道是地球的子级，会跟随地球公转

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9 })
);
moon.position.x = 1.8; // 月亮离地球 1.8 个单位
moonOrbit.add(moon);

// ===== 渲染循环：多层旋转 =====
function animate() {
  requestAnimationFrame(animate);
  sun.rotation.y += 0.002;       // 太阳自转
  earthOrbit.rotation.y += 0.01; // 地球公转（轨道组旋转）
  earth.rotation.y += 0.02;      // 地球自转
  moonOrbit.rotation.y += 0.05;  // 月亮公转（相对地球）
  renderer.render(scene, camera);
}
animate();
```

::: tip 父子关系的精髓
`moonOrbit` 是 `earth` 的子级，`earth` 又是 `earthOrbit` 的子级。当 `earthOrbit` 旋转时，地球和月亮一起公转；当 `moonOrbit` 旋转时，只有月亮绕地球转。这就是 3D 层级变换的核心--子级继承父级的变换。
:::

---

## 03. 粒子星空

使用 `Points` + `BufferGeometry` 创建 3000 个随机分布的粒子，配合顶点颜色实现璀璨星空。粒子系统是性能优化的重要工具。

**核心知识点**：Points + BufferGeometry + 顶点颜色 + 自定义着色器属性

```js
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 0, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// ===== 生成 3000 个随机粒子 =====
const particleCount = 3000;
const positions = new Float32Array(particleCount * 3); // 每个粒子 xyz 三个坐标
const colors = new Float32Array(particleCount * 3);    // 每个粒子 rgb 三个颜色分量

for (let i = 0; i < particleCount; i++) {
  // 在球形空间内随机分布
  const radius = Math.random() * 200 + 50;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);

  positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);     // x
  positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta); // y
  positions[i * 3 + 2] = radius * Math.cos(phi);                   // z

  // 随机颜色（偏蓝白色调）
  const color = new THREE.Color();
  color.setHSL(0.55 + Math.random() * 0.15, 0.5, 0.5 + Math.random() * 0.5);
  colors[i * 3] = color.r;
  colors[i * 3 + 1] = color.g;
  colors[i * 3 + 2] = color.b;
}

// ===== 创建 BufferGeometry =====
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// ===== 创建 Points 材质 =====
const material = new THREE.PointsMaterial({
  size: 0.8,
  vertexColors: true,   // 启用顶点颜色
  transparent: true,
  opacity: 0.9,
  sizeAttenuation: true, // 粒子随距离变小
});

// ===== 创建粒子系统 =====
const stars = new THREE.Points(geometry, material);
scene.add(stars);

// ===== 渲染循环：缓慢旋转星空 =====
function animate() {
  requestAnimationFrame(animate);
  stars.rotation.y += 0.0005;
  stars.rotation.x += 0.0002;
  renderer.render(scene, camera);
}
animate();
```

::: tip 为什么用 Points 而非 Mesh
`Points` 一次绘制几千个粒子只需一次 draw call，性能远优于创建几千个小球 Mesh。这是 Three.js 处理大量小元素的标准方式。
:::

---

## 04. 3D 产品展示

使用 `GLTFLoader` 加载 glTF 模型，配合 `OrbitControls` 实现可拖拽查看、自动旋转与阴影。这是电商、博物馆等场景的典型应用。

**核心知识点**：GLTFLoader + OrbitControls + autoRotate + 阴影

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ===== 场景、相机、渲染器 =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f2f5);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(3, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // 色调映射
document.body.appendChild(renderer.domElement);

// ===== 展台地面（接收阴影）=====
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(3, 64),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ===== 灯光（三点布光）=====
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
// 主光
const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);
// 补光
const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
fillLight.position.set(-5, 3, -3);
scene.add(fillLight);

// ===== 加载 glTF 模型 =====
const loader = new GLTFLoader();
loader.load(
  '/models/duck.gltf',
  (gltf) => {
    const model = gltf.scene;
    // 调整模型大小和位置
    model.scale.set(1, 1, 1);
    model.position.y = 0.5;
    // 遍历所有 Mesh 开启阴影
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    scene.add(model);
  },
  undefined,
  (error) => console.error('模型加载失败', error)
);

// ===== 轨道控制器 + 自动旋转 =====
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;   // 限制最近距离
controls.maxDistance = 10;  // 限制最远距离
controls.autoRotate = true;       // ★ 自动旋转
controls.autoRotateSpeed = 1.0;

// 点击停止自动旋转
renderer.domElement.addEventListener('pointerdown', () => {
  controls.autoRotate = false;
});

// ===== 渲染循环 =====
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
```

::: tip 模型资源
示例使用 duck.gltf 模型，你可以从 [Three.js 官方示例](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) 下载模型文件，放在 `public/models/` 目录下。也可以替换为自己的 glTF/glb 模型。
:::

---

## 05. 交互式 3D 柱状图

使用 `Raycaster`（射线检测）实现鼠标悬停高亮，数据驱动的 3D 柱状图。这是数据可视化与 3D 交互结合的典型。

**核心知识点**：Raycaster + 数据驱动 + 鼠标悬停高亮

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f2f5);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(8, 8, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// ===== 灯光 =====
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 15, 10);
scene.add(dirLight);

// ===== 数据 =====
const data = [
  { label: '一月', value: 30 },
  { label: '二月', value: 50 },
  { label: '三月', value: 80 },
  { label: '四月', value: 45 },
  { label: '五月', value: 65 },
  { label: '六月', value: 90 },
];

// ===== 根据数据创建柱子 =====
const bars = [];
const barWidth = 1;
const spacing = 1.5;

data.forEach((item, i) => {
  const height = item.value / 10; // 数值缩放
  const geometry = new THREE.BoxGeometry(barWidth, height, barWidth);
  const material = new THREE.MeshStandardMaterial({
    color: 0x409eff,
    roughness: 0.4,
    metalness: 0.2,
  });
  const bar = new THREE.Mesh(geometry, material);
  // 柱子底部对齐地面
  bar.position.set(
    (i - data.length / 2) * spacing,
    height / 2,
    0
  );
  bar.userData = { originalColor: 0x409eff, value: item.value, label: item.label };
  bars.push(bar);
  scene.add(bar);
});

// ===== 地面 =====
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ===== Raycaster 射线检测 =====
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredBar = null;

window.addEventListener('mousemove', (event) => {
  // 将鼠标坐标转换为标准化设备坐标（-1 ~ 1）
  mouse.x = (event.clientX / innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / innerHeight) * 2 + 1;
});

// ===== 控制器 =====
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1; // 限制不能看到地面下方

// ===== 渲染循环 =====
function animate() {
  requestAnimationFrame(animate);

  // 射线检测：从相机发射穿过鼠标位置的射线
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(bars);

  // 恢复上一个悬停柱子的颜色
  if (hoveredBar) {
    hoveredBar.material.color.setHex(hoveredBar.userData.originalColor);
    hoveredBar.scale.set(1, 1, 1);
  }

  // 高亮当前悬停的柱子
  if (intersects.length > 0) {
    hoveredBar = intersects[0].object;
    hoveredBar.material.color.setHex(0xe6a23c); // 悬停变橙色
    hoveredBar.scale.set(1.1, 1, 1.1);          // 略微放大
    document.body.style.cursor = 'pointer';
  } else {
    hoveredBar = null;
    document.body.style.cursor = 'default';
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
```

::: tip Raycaster 的工作原理
`Raycaster` 从相机位置出发，穿过鼠标在屏幕上的位置，发射一条射线进入 3D 场景。`intersectObjects` 返回射线穿过的所有物体，按距离排序。这是 3D 中实现「点击/悬停物体」的标准方案。
:::

---

## 06. 着色器波纹效果

使用 `ShaderMaterial` 编写自定义 GLSL 着色器，实现动态波纹效果。这是 Three.js 高阶内容，需要一定的 GLSL 基础。

**核心知识点**：ShaderMaterial + GLSL + Uniform 动态波纹

```js
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 6);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// ===== 顶点着色器：根据波纹函数修改顶点高度 =====
const vertexShader = `
  // uniform：从 JS 传入的全局变量
  uniform float uTime;       // 时间
  uniform float uFrequency;  // 频率
  uniform float uAmplitude;  // 振幅

  varying vec2 vUv;          // 传递 UV 坐标给片元着色器
  varying float vElevation;  // 传递高度给片元着色器

  void main() {
    vUv = uv;
    
    // 计算波纹高度：基于 xz 坐标和时间
    float elevation = sin(position.x * uFrequency + uTime) * uAmplitude
                    * sin(position.z * uFrequency + uTime) * uAmplitude;
    
    vElevation = elevation;
    
    // 修改顶点位置（只改 y 轴高度）
    vec3 newPosition = position;
    newPosition.y += elevation;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

// ===== 片元着色器：根据高度混合颜色 =====
const fragmentShader = `
  uniform float uTime;
  
  varying vec2 vUv;
  varying float vElevation;

  void main() {
    // 基础颜色（蓝色）
    vec3 colorA = vec3(0.25, 0.62, 1.0);  // #409eff
    // 高亮颜色（青色）
    vec3 colorB = vec3(0.40, 0.76, 0.23); // #67c23a
    
    // 根据高度混合两种颜色
    float mixStrength = (vElevation + 0.2) * 2.0;
    vec3 color = mix(colorA, colorB, clamp(mixStrength, 0.0, 1.0));
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ===== 创建波纹平面 =====
const geometry = new THREE.PlaneGeometry(8, 8, 128, 128); // 高分段数保证平滑
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uFrequency: { value: 1.5 },
    uAmplitude: { value: 0.2 },
  },
  side: THREE.DoubleSide,
});

const plane = new THREE.Mesh(geometry, material);
plane.rotation.x = -Math.PI / 2; // 水平放置
scene.add(plane);

// ===== 渲染循环：更新时间 uniform =====
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  // 更新时间，驱动波纹动画
  material.uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
}
animate();
```

::: warning 着色器注意事项
1. GLSL 中变量名不能以 `three_` 开头（Three.js 内部保留）
2. `uniform` 是所有顶点/片元共享的全局变量，`varying` 用于顶点向片元传递数据
3. `ShaderMaterial` 不受 Three.js 灯光影响，需要自己在着色器中实现光照
4. 调试着色器时，浏览器控制台会输出 GLSL 编译错误
:::

---

## 案例总结

| 案例 | 核心技术 | 应用场景 |
|------|---------|---------|
| 旋转立方体 | Scene/Camera/Renderer/光照 | 入门、教学演示 |
| 太阳系动画 | Group 父子层级 | 动画系统、层级变换 |
| 粒子星空 | Points/BufferGeometry | 星空、雨雪、烟雾 |
| 3D 产品展示 | GLTFLoader/OrbitControls | 电商、博物馆、配置器 |
| 交互式柱状图 | Raycaster 射线检测 | 数据可视化、3D 交互 |
| 着色器波纹 | ShaderMaterial/GLSL | 特效、水面、自定义渲染 |

::: tip 进阶方向
完成这些案例后，你可以继续探索：
- **后期处理**（PostProcessing）：辉光、景深、色调映射
- **物理引擎**：Cannon.js / Rapide 物理模拟
- **骨骼动画**：角色动画、MMD
- **WebXR**：VR/AR 开发
- **性能优化**：实例化（InstancedMesh）、LOD、合并几何体

祝你在 Three.js 的学习之路上越走越远！🚀
:::
