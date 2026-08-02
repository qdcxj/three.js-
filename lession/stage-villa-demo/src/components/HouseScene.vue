<template>
  <div ref="container" class="scene-container">
    <div class="ui-overlay">
      <div class="info-card">
        <h3>现代别墅 · 写实风格</h3>
        <p>平顶 · 落地窗 · 悬挑体块 · PBR 渲染</p>
        <p class="hint">鼠标拖拽旋转 · 滚轮缩放 · 右键平移</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { onMounted, onUnmounted, ref } from "vue";

const container = ref(null);
let renderer, scene, camera, controls, animationId;
const disposables = [];

// ============================================================
//  PBR 贴图生成
// ============================================================

function heightToNormalCanvas(heightCanvas, strength = 2.0) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const nc = document.createElement("canvas");
  nc.width = w; nc.height = h;
  const hCtx = heightCanvas.getContext("2d");
  const nCtx = nc.getContext("2d");
  const hd = hCtx.getImageData(0, 0, w, h).data;
  const ni = nCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const xL = x > 0 ? hd[(y * w + (x - 1)) * 4] : hd[i];
      const xR = x < w - 1 ? hd[(y * w + (x + 1)) * 4] : hd[i];
      const yU = y > 0 ? hd[((y - 1) * w + x) * 4] : hd[i];
      const yD = y < h - 1 ? hd[((y + 1) * w + x) * 4] : hd[i];
      const dx = ((xR - xL) / 255) * strength;
      const dy = ((yD - yU) / 255) * strength;
      const nx = -dx, ny = -dy, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      ni.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      ni.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      ni.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(ni, 0, 0);
  return nc;
}

function tex(canvas, repeat = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  disposables.push(t);
  return t;
}

function makeConcrete(lightness = "medium", repeat = [4, 4]) {
  const size = 512;
  const aC = document.createElement("canvas"); aC.width = aC.height = size;
  const aCtx = aC.getContext("2d");
  const hC = document.createElement("canvas"); hC.width = hC.height = size;
  const hCtx = hC.getContext("2d");
  const colors = { dark: [72, 69, 64], medium: [98, 95, 88], light: [195, 190, 180] };
  const [r, g, b] = colors[lightness] || colors.medium;
  aCtx.fillStyle = `rgb(${r},${g},${b})`; aCtx.fillRect(0, 0, size, size);
  hCtx.fillStyle = "#808080"; hCtx.fillRect(0, 0, size, size);
  // 大尺度斑块
  for (let i = 0; i < 15; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const pr = 30 + Math.random() * 90;
    const grad = aCtx.createRadialGradient(px, py, 0, px, py, pr);
    const delta = (Math.random() - 0.5) * 25;
    grad.addColorStop(0, `rgba(${r + delta},${g + delta},${b + delta},0.5)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    aCtx.fillStyle = grad; aCtx.fillRect(0, 0, size, size);
  }
  const ad = aCtx.getImageData(0, 0, size, size);
  const hd = hCtx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    const n = (Math.random() - 0.5) * 12;
    ad.data[idx] = Math.max(0, Math.min(255, ad.data[idx] + n));
    ad.data[idx + 1] = Math.max(0, Math.min(255, ad.data[idx + 1] + n));
    ad.data[idx + 2] = Math.max(0, Math.min(255, ad.data[idx + 2] + n));
    hd.data[idx] = hd.data[idx + 1] = hd.data[idx + 2] = 128 + n * 0.7;
  }
  // 微裂纹
  aCtx.strokeStyle = `rgba(${r - 25},${g - 25},${b - 25},0.12)`;
  aCtx.lineWidth = 0.4;
  for (let i = 0; i < 6; i++) {
    aCtx.beginPath();
    let cx = Math.random() * size, cy = Math.random() * size;
    aCtx.moveTo(cx, cy);
    for (let j = 0; j < 5; j++) {
      cx += (Math.random() - 0.5) * 70; cy += (Math.random() - 0.5) * 70;
      aCtx.lineTo(cx, cy);
    }
    aCtx.stroke();
  }
  aCtx.putImageData(ad, 0, 0); hCtx.putImageData(hd, 0, 0);
  return { map: tex(aC, repeat, true), normalMap: tex(heightToNormalCanvas(hC, 1.3), repeat, false), roughness: 0.88 };
}

function makeWood(repeat = [2, 3]) {
  const w = 256, h = 512;
  const aC = document.createElement("canvas"); aC.width = w; aC.height = h;
  const aCtx = aC.getContext("2d");
  const hC = document.createElement("canvas"); hC.width = w; hC.height = h;
  const hCtx = hC.getContext("2d");
  aCtx.fillStyle = "#7a5638"; aCtx.fillRect(0, 0, w, h);
  hCtx.fillStyle = "#808080"; hCtx.fillRect(0, 0, w, h);
  const ad = aCtx.getImageData(0, 0, w, h);
  const hd = hCtx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const grain = Math.sin(y * 0.06 + Math.sin(x * 0.02) * 7) * 0.5 + 0.5;
      const fine = Math.sin(y * 0.5) * 0.08;
      const noise = (Math.random() - 0.5) * 6;
      ad.data[idx] = Math.max(0, Math.min(255, 122 + grain * 40 + fine * 25 + noise));
      ad.data[idx + 1] = Math.max(0, Math.min(255, 86 + grain * 30 + fine * 18 + noise));
      ad.data[idx + 2] = Math.max(0, Math.min(255, 56 + grain * 20 + fine * 12 + noise));
      hd.data[idx] = hd.data[idx + 1] = hd.data[idx + 2] = 128 + grain * 30 - 15 + noise;
    }
  }
  aCtx.putImageData(ad, 0, 0); hCtx.putImageData(hd, 0, 0);
  return { map: tex(aC, repeat, true), normalMap: tex(heightToNormalCanvas(hC, 1.5), repeat, false), roughness: 0.5 };
}

// ============================================================
//  材质工厂
// ============================================================

function createMaterials() {
  const m = {};
  m.darkConcrete = new THREE.MeshStandardMaterial({
    ...makeConcrete("dark", [5, 4]), metalness: 0.1, color: 0xffffff,
    normalScale: new THREE.Vector2(1.3, 1.3),
  });
  m.medConcrete = new THREE.MeshStandardMaterial({
    ...makeConcrete("medium", [5, 4]), metalness: 0.05, color: 0xffffff,
    normalScale: new THREE.Vector2(1.1, 1.1),
  });
  m.wood = new THREE.MeshStandardMaterial({
    ...makeWood([2, 3]), metalness: 0.0, color: 0xffffff,
    normalScale: new THREE.Vector2(1.0, 1.0),
  });
  m.white = new THREE.MeshStandardMaterial({
    color: 0xeae8e2, roughness: 0.82, metalness: 0.0,
  });
  // 落地窗玻璃：高透射、无色
  m.glass = new THREE.MeshPhysicalMaterial({
    color: 0xdde8f0,
    roughness: 0.03,
    metalness: 0.0,
    transmission: 0.96,
    thickness: 0.008,
    ior: 1.52,
    transparent: true,
    envMapIntensity: 2.5,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  // 栏杆玻璃：简单半透明（不用 transmission，性能好）
  m.railingGlass = new THREE.MeshPhysicalMaterial({
    color: 0xb0c8d8,
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.7,
    thickness: 0.005,
    ior: 1.45,
    transparent: true,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
  });
  m.frame = new THREE.MeshStandardMaterial({
    color: 0x151515, roughness: 0.25, metalness: 0.8,
  });
  m.floor = new THREE.MeshStandardMaterial({
    color: 0x6a5a48, roughness: 0.3, metalness: 0.1,
  });
  m.grass = new THREE.MeshStandardMaterial({
    color: 0x7a9e58, roughness: 1.0, metalness: 0.0,
  });
  m.gravel = new THREE.MeshStandardMaterial({
    color: 0x9a9688, roughness: 0.95, metalness: 0.0,
  });
  m.paving = new THREE.MeshStandardMaterial({
    color: 0xc0bcb0, roughness: 0.65, metalness: 0.05,
  });
  Object.values(m).forEach((mat) => disposables.push(mat));
  return m;
}

// ============================================================
//  建筑辅助
// ============================================================

function addWall(group, mat, w, h, t, x, y, z, ry = 0) {
  const geo = new THREE.BoxGeometry(w, h, t);
  const wall = new THREE.Mesh(geo, mat);
  wall.position.set(x, y, z);
  if (ry) wall.rotation.y = ry;
  wall.castShadow = true; wall.receiveShadow = true;
  group.add(wall); disposables.push(geo);
  return wall;
}

function addSlab(group, mat, w, d, t, x, y, z) {
  const geo = new THREE.BoxGeometry(w, t, d);
  const slab = new THREE.Mesh(geo, mat);
  slab.position.set(x, y, z);
  slab.castShadow = true; slab.receiveShadow = true;
  group.add(slab); disposables.push(geo);
  return slab;
}

function addGlass(group, glassMat, frameMat, w, h, x, y, z, ry = 0) {
  const g = new THREE.Group();
  const glassGeo = new THREE.BoxGeometry(w - 0.02, h - 0.02, 0.02);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  g.add(glass); disposables.push(glassGeo);
  const fT = 0.05, fD = 0.06;
  const topGeo = new THREE.BoxGeometry(w + fT, fT, fD);
  const top = new THREE.Mesh(topGeo, frameMat); top.position.y = h / 2;
  g.add(top); disposables.push(topGeo);
  const botGeo = new THREE.BoxGeometry(w + fT, fT, fD);
  const bot = new THREE.Mesh(botGeo, frameMat); bot.position.y = -h / 2;
  g.add(bot); disposables.push(botGeo);
  const leftGeo = new THREE.BoxGeometry(fT, h, fD);
  const left = new THREE.Mesh(leftGeo, frameMat); left.position.x = -w / 2 - fT / 2;
  g.add(left); disposables.push(leftGeo);
  const rightGeo = new THREE.BoxGeometry(fT, h, fD);
  const right = new THREE.Mesh(rightGeo, frameMat); right.position.x = w / 2 + fT / 2;
  g.add(right); disposables.push(rightGeo);
  g.position.set(x, y, z);
  if (ry) g.rotation.y = ry;
  group.add(g);
  return g;
}

// ============================================================
//  场景
// ============================================================

function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ab4c8);
  scene.fog = new THREE.Fog(0x8ab4c8, 60, 180);
  return scene;
}

function createCamera() {
  const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 500);
  cam.position.set(15, 5.5, 13);
  return cam;
}

function createRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setSize(window.innerWidth, window.innerHeight);
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

function createLights(scene) {
  // 半球光：天空蓝 -> 地面暖色
  const hemi = new THREE.HemisphereLight(0xc8e0ff, 0xc8b898, 0.45);
  scene.add(hemi);

  // 阳光
  const sun = new THREE.DirectionalLight(0xfff4dc, 2.5);
  sun.position.set(12, 18, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // 冷色补光
  const fill = new THREE.DirectionalLight(0xa0bcd8, 0.25);
  fill.position.set(-10, 8, -6);
  scene.add(fill);

  // 室内暖光（一层天花板下方）
  const int1 = new THREE.PointLight(0xffd8a0, 5, 10, 1.2);
  int1.position.set(3, 3.4, 0); scene.add(int1);
  const int2 = new THREE.PointLight(0xffe0b0, 4, 8, 1.2);
  int2.position.set(-2, 3.4, -1); scene.add(int2);

  // 二层暖光
  const int3 = new THREE.PointLight(0xffe0b0, 3, 7, 1.2);
  int3.position.set(2, 6.5, 0); scene.add(int3);
}

// ============================================================
//  现代别墅建模
// ============================================================

function createVilla(m) {
  const villa = new THREE.Group();

  // === 尺寸 ===
  const W = 14, D = 8, gH = 3.5, uH = 3.0, t = 0.25;
  const oS = 0.6, oF = 1.2, oB = 0.8, rO = 0.4;
  const uW = W + oS * 2;   // 15.2
  const uD = D + oF + oB;  // 10
  const uCenterZ = (oF - oB) / 2;  // 0.2
  const uFrontZ = uCenterZ + uD / 2;  // 5.2
  const uBackZ = uCenterZ - uD / 2;   // -4.8
  const upperFloorY = gH + 0.3;  // 3.8（二层楼板顶面）
  const ceilingY = gH + 0.3 + uH;  // 6.8（二层天花板底面）

  // 一层分段
  const garageW = 5.0, entryW = 2.0;
  const livingW = W - garageW - entryW; // 7m
  const frontZ = D / 2;  // 4

  // =====================================================
  //  一层（薄墙板围合）
  // =====================================================

  // 地板
  addSlab(villa, m.floor, W - 0.3, D - 0.3, 0.1, 0, 0.05, 0);
  // 天花板/楼板
  addSlab(villa, m.medConcrete, W - 0.3, D - 0.3, 0.3, 0, gH + 0.15, 0);

  // --- 后墙（分段留窗洞）---
  const bWinW = 1.5, bWinH = 1.2;
  const bWinX = -2, bWinY = 1.8;
  const bLeftW = (W / 2) + bWinX - bWinW / 2;  // 窗左侧墙宽
  const bRightW = (W / 2) - bWinX - bWinW / 2;  // 窗右侧墙宽
  addWall(villa, m.medConcrete, bLeftW, gH, t, -W / 2 + bLeftW / 2, gH / 2, -D / 2);
  addWall(villa, m.medConcrete, bRightW, gH, t, W / 2 - bRightW / 2, gH / 2, -D / 2);
  const bTopH = gH - (bWinY + bWinH / 2);
  addWall(villa, m.medConcrete, bWinW, bTopH, t, bWinX, bWinY + bWinH / 2 + bTopH / 2, -D / 2);
  const bBotH = bWinY - bWinH / 2;
  addWall(villa, m.medConcrete, bWinW, bBotH, t, bWinX, bBotH / 2, -D / 2);

  // --- 左墙 ---
  addWall(villa, m.medConcrete, t, gH, D, -W / 2, gH / 2, 0);

  // --- 右墙（分段留窗洞）---
  const rWinW = 1.5, rWinH = 1.8;
  const rWinY = 1.7, rWinZ = 1.5;
  const rFrontD = rWinZ - rWinW / 2;  // 窗前段深
  const rBackD = D - rWinZ - rWinW / 2; // 窗后段深
  addWall(villa, m.medConcrete, t, gH, rFrontD, W / 2, gH / 2, frontZ - rFrontD / 2);
  addWall(villa, m.medConcrete, t, gH, rBackD, W / 2, gH / 2, -D / 2 + rBackD / 2);
  const rTopH = gH - (rWinY + rWinH / 2);
  addWall(villa, m.medConcrete, t, rTopH, rWinW, W / 2, rWinY + rWinH / 2 + rTopH / 2, rWinZ);
  const rBotH = rWinY - rWinH / 2;
  addWall(villa, m.medConcrete, t, rBotH, rWinW, W / 2, rBotH / 2, rWinZ);

  // --- 前墙（分段留车库门/入口门/落地窗洞口）---
  // 车库段
  const garageDoorW = 2.6, garageDoorH = 2.2;
  const garageLeftW = 0.8;
  const garageRightW = garageW - garageLeftW - garageDoorW;
  addWall(villa, m.medConcrete, garageLeftW, gH, t, -W / 2 + garageLeftW / 2, gH / 2, frontZ);
  addWall(villa, m.medConcrete, garageDoorW, gH - garageDoorH, t,
    -W / 2 + garageLeftW + garageDoorW / 2, garageDoorH + (gH - garageDoorH) / 2, frontZ);
  addWall(villa, m.medConcrete, garageRightW, gH, t,
    -W / 2 + garageLeftW + garageDoorW + garageRightW / 2, gH / 2, frontZ);

  // 入口段
  const entryDoorW = 1.0, entryDoorH = 2.2;
  const entrySideW = (entryW - entryDoorW) / 2;
  addWall(villa, m.wood, entrySideW, gH, t, -W / 2 + garageW + entrySideW / 2, gH / 2, frontZ);
  addWall(villa, m.wood, entryDoorW, gH - entryDoorH, t,
    -W / 2 + garageW + entrySideW + entryDoorW / 2, entryDoorH + (gH - entryDoorH) / 2, frontZ);
  addWall(villa, m.wood, entrySideW, gH, t,
    -W / 2 + garageW + entrySideW + entryDoorW + entrySideW / 2, gH / 2, frontZ);

  // 起居室段
  const livingGlassW = 5.0, glassH = 2.6;
  const livingSideW = (livingW - livingGlassW) / 2;
  addWall(villa, m.medConcrete, livingSideW, gH, t,
    -W / 2 + garageW + entryW + livingSideW / 2, gH / 2, frontZ);
  addWall(villa, m.medConcrete, livingGlassW, gH - glassH, t,
    -W / 2 + garageW + entryW + livingSideW + livingGlassW / 2, glassH + (gH - glassH) / 2, frontZ);
  addWall(villa, m.medConcrete, livingSideW, gH, t,
    -W / 2 + garageW + entryW + livingSideW + livingGlassW + livingSideW / 2, gH / 2, frontZ);

  // --- 内墙 ---
  addWall(villa, m.medConcrete, t, gH, D, -W / 2 + garageW, gH / 2, 0);
  addWall(villa, m.medConcrete, t, gH, D, -W / 2 + garageW + entryW, gH / 2, 0);

  // =====================================================
  //  二层（深灰悬挑，左侧露台开放）
  // =====================================================

  // 楼板
  addSlab(villa, m.darkConcrete, uW, uD, 0.3, 0, upperFloorY - 0.15, uCenterZ);
  // 天花板
  addSlab(villa, m.darkConcrete, uW, uD, 0.3, 0, ceilingY + 0.15, uCenterZ);

  // 后墙（整面）
  addWall(villa, m.darkConcrete, uW, uH, t, 0, upperFloorY + uH / 2, uBackZ);

  // 右墙（分段留窗洞）
  const sWinW = 1.2, sWinH = 1.4;
  const sWinZ = uCenterZ + 0.5;
  const sFrontD = uFrontZ - sWinZ - sWinW / 2;
  const sBackD = (sWinZ - sWinW / 2) - uBackZ;
  addWall(villa, m.darkConcrete, t, uH, sFrontD, uW / 2, upperFloorY + uH / 2, uFrontZ - sFrontD / 2);
  addWall(villa, m.darkConcrete, t, uH, sBackD, uW / 2, upperFloorY + uH / 2, uBackZ + sBackD / 2);
  const sTopH = uH - (upperFloorY + uH / 2 + sWinH / 2 - upperFloorY);
  const sWinY = upperFloorY + uH / 2;
  const sWinTopH = (upperFloorY + uH) - (sWinY + sWinH / 2);
  addWall(villa, m.darkConcrete, t, sWinTopH, sWinW, uW / 2, sWinY + sWinH / 2 + sWinTopH / 2, sWinZ);
  const sWinBotH = sWinY - sWinH / 2 - upperFloorY;
  addWall(villa, m.darkConcrete, t, sWinBotH, sWinW, uW / 2, upperFloorY + sWinBotH / 2, sWinZ);

  // --- 露台区域 ---
  const terraceW = 4.5;  // 露台宽
  const terraceD = 2.5;  // 露台深
  const terraceLeftX = -uW / 2;
  const terraceRightX = -uW / 2 + terraceW;
  const terraceFrontZ = uFrontZ;
  const terraceBackZ = uFrontZ - terraceD;

  // 左墙：只在露台后方（z < terraceBackZ）
  const leftWallD = terraceBackZ - uBackZ;
  addWall(villa, m.darkConcrete, t, uH, leftWallD,
    -uW / 2, upperFloorY + uH / 2, uBackZ + leftWallD / 2);

  // 前墙：露台右侧部分
  const frontSolidW = uW - terraceW;
  addWall(villa, m.darkConcrete, frontSolidW, uH, t,
    terraceRightX + frontSolidW / 2, upperFloorY + uH / 2, uFrontZ);

  // 露台右墙（分隔露台和室内）
  addWall(villa, m.wood, t, uH, terraceD,
    terraceRightX, upperFloorY + uH / 2, uFrontZ - terraceD / 2);

  // 露台后墙（分隔露台和室内）
  addWall(villa, m.darkConcrete, terraceW, uH, t,
    terraceLeftX + terraceW / 2, upperFloorY + uH / 2, terraceBackZ);

  // 露台木地板
  addSlab(villa, m.wood, terraceW, terraceD, 0.04,
    terraceLeftX + terraceW / 2, upperFloorY + 0.02, uFrontZ - terraceD / 2);

  // --- 二层卧室前窗 ---
  const bedWinW = 2.5, bedWinH = 1.6;
  const bedWinX = terraceRightX + frontSolidW / 2;
  const bedWinY = upperFloorY + uH / 2;
  const bedTopH = (upperFloorY + uH) - (bedWinY + bedWinH / 2);
  addWall(villa, m.darkConcrete, frontSolidW, bedTopH, t,
    bedWinX, bedWinY + bedWinH / 2 + bedTopH / 2, uFrontZ);
  const bedBotH = bedWinY - bedWinH / 2 - upperFloorY;
  addWall(villa, m.darkConcrete, frontSolidW, bedBotH, t,
    bedWinX, upperFloorY + bedBotH / 2, uFrontZ);

  // =====================================================
  //  屋顶
  // =====================================================
  const roofY = ceilingY + 0.3 + 0.2;
  addSlab(villa, m.darkConcrete, uW + rO * 2, uD + rO * 2, 0.35, 0, roofY, uCenterZ);
  // 屋顶设备块
  addSlab(villa, m.wood, 2.5, 1.8, 0.8, 1.5, roofY + 0.4 + 0.4, uCenterZ - 0.5);

  // =====================================================
  //  一层门窗
  // =====================================================

  // 车库门
  addWall(villa, m.white, garageDoorW, garageDoorH, 0.08,
    -W / 2 + garageLeftW + garageDoorW / 2, garageDoorH / 2, frontZ - 0.06);
  // 车库门上方小窗
  for (let i = 0; i < 4; i++) {
    addGlass(villa, m.glass, m.frame, 0.25, 0.5,
      -W / 2 + garageLeftW + 0.4 + i * 0.55, garageDoorH + 0.35, frontZ - 0.06);
  }

  // 入口门
  addWall(villa, m.wood, entryDoorW, entryDoorH, 0.08,
    -W / 2 + garageW + entrySideW + entryDoorW / 2, entryDoorH / 2, frontZ - 0.06);

  // 落地窗
  const livingGlassX = -W / 2 + garageW + entryW + livingSideW + livingGlassW / 2;
  addGlass(villa, m.glass, m.frame, livingGlassW, glassH, livingGlassX, glassH / 2, frontZ - 0.06);
  const mullionGeo = new THREE.BoxGeometry(0.04, glassH, 0.06);
  for (let i = 1; i <= 3; i++) {
    const mul = new THREE.Mesh(mullionGeo, m.frame);
    mul.position.set(livingGlassX - livingGlassW / 2 + (livingGlassW / 4) * i, glassH / 2, frontZ - 0.06);
    villa.add(mul);
  }
  disposables.push(mullionGeo);
  const transomGeo = new THREE.BoxGeometry(livingGlassW, 0.04, 0.06);
  const transom = new THREE.Mesh(transomGeo, m.frame);
  transom.position.set(livingGlassX, glassH / 2, frontZ - 0.06);
  villa.add(transom); disposables.push(transomGeo);

  // 右墙窗
  addGlass(villa, m.glass, m.frame, rWinW, rWinH, W / 2 - 0.06, rWinY, rWinZ, Math.PI / 2);
  // 后墙窗
  addGlass(villa, m.glass, m.frame, bWinW, bWinH, bWinX, bWinY, -D / 2 + 0.06);

  // =====================================================
  //  二层窗
  // =====================================================

  // 卧室前窗
  addGlass(villa, m.glass, m.frame, bedWinW, bedWinH, bedWinX, bedWinY, uFrontZ - 0.06);
  // 侧面窗
  addGlass(villa, m.glass, m.frame, sWinW, sWinH, uW / 2 - 0.06, sWinY, sWinZ, Math.PI / 2);

  // =====================================================
  //  露台栏杆
  // =====================================================
  const railH = 1.05;
  const railY = upperFloorY + 0.04 + railH / 2;
  // 前方栏杆
  addWall(villa, m.railingGlass, terraceW, railH, 0.02,
    terraceLeftX + terraceW / 2, railY, terraceFrontZ);
  // 左侧栏杆
  addWall(villa, m.railingGlass, 0.02, railH, terraceD,
    terraceLeftX, railY, uFrontZ - terraceD / 2);
  // 扶手
  addWall(villa, m.frame, terraceW + 0.06, 0.06, 0.06,
    terraceLeftX + terraceW / 2, railY + railH / 2 + 0.03, terraceFrontZ);
  addWall(villa, m.frame, 0.06, 0.06, terraceD + 0.06,
    terraceLeftX, railY + railH / 2 + 0.03, uFrontZ - terraceD / 2);
  // 立柱
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, railH, 8);
  [terraceLeftX, terraceRightX].forEach((px) => {
    const post = new THREE.Mesh(postGeo, m.frame);
    post.position.set(px, railY, terraceFrontZ);
    post.castShadow = true; villa.add(post);
  });
  const postBack = new THREE.Mesh(postGeo, m.frame);
  postBack.position.set(terraceLeftX, railY, terraceBackZ);
  postBack.castShadow = true; villa.add(postBack);
  disposables.push(postGeo);

  // =====================================================
  //  入口雨棚 + 花池 + 台阶
  // =====================================================

  // 雨棚（在门上方，悬挑）
  const canopyY = entryDoorH + 0.15;
  addSlab(villa, m.darkConcrete, 3.5, 1.5, 0.1,
    -W / 2 + garageW + entryW / 2, canopyY, frontZ + 0.65);
  // 雨棚支撑（两侧细柱）
  const colGeo = new THREE.CylinderGeometry(0.04, 0.04, canopyY, 8);
  [-1.2, 1.2].forEach((dx) => {
    const col = new THREE.Mesh(colGeo, m.frame);
    col.position.set(-W / 2 + garageW + entryW / 2 + dx, canopyY / 2, frontZ + 1.2);
    col.castShadow = true; villa.add(col);
  });
  disposables.push(colGeo);

  // 花池
  addSlab(villa, m.darkConcrete, 2.2, 0.8, 0.35,
    -W / 2 + garageW + entryW / 2, 0.175, frontZ + 1.0);

  // 台阶
  for (let i = 0; i < 3; i++) {
    addSlab(villa, m.darkConcrete, 1.4, 0.35, 0.13,
      -W / 2 + garageW + entryW / 2, 0.065 + i * 0.13, frontZ + 1.5 + i * 0.35);
  }

  // =====================================================
  //  前院
  // =====================================================
  addSlab(villa, m.paving, W + 4, 4, 0.08, 0, 0.04, frontZ + 2.5);
  addSlab(villa, m.gravel, 4, 7, 0.05, -4.5, 0.025, frontZ + 6.5);

  // 草坪
  const grassGeo = new THREE.PlaneGeometry(200, 200);
  const grass = new THREE.Mesh(grassGeo, m.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.001;
  grass.receiveShadow = true;
  villa.add(grass); disposables.push(grassGeo);

  // =====================================================
  //  真实草地（InstancedMesh 草叶，别墅周围密集铺设）
  // =====================================================

  // 草叶几何（细长三角形面片，两片交叉形成立体草叶）
  const bladeGeo = new THREE.PlaneGeometry(0.04, 0.35);
  bladeGeo.translate(0, 0.175, 0); // 底部对齐原点
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x5a8a38,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });
  // 避开别墅占地范围（别墅 x: -7~7, z: -4~5），只在周围草地铺草叶
  const bladeCount = 4000;
  const bladeMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let bladeIdx = 0;
  for (let i = 0; i < bladeCount; i++) {
    // 随机分布在整个 100x100 区域，但避开别墅区域
    const px = (Math.random() - 0.5) * 60;
    const pz = (Math.random() - 0.5) * 60;
    // 避开别墅占地（含前院平台）
    if (Math.abs(px) < 10 && pz > -5 && pz < 9) continue;
    const ry = Math.random() * Math.PI;
    const scale = 0.6 + Math.random() * 0.8;
    dummy.position.set(px, 0, pz);
    dummy.rotation.y = ry;
    dummy.scale.set(1, scale, 1);
    dummy.updateMatrix();
    bladeMesh.setMatrixAt(bladeIdx, dummy.matrix);
    // 草叶颜色随机变化（深绿到浅绿）
    const h = 0.25 + Math.random() * 0.08; // 色相
    const s = 0.5 + Math.random() * 0.3;
    const l = 0.3 + Math.random() * 0.2;
    color.setHSL(h, s, l);
    bladeMesh.setColorAt(bladeIdx, color);
    bladeIdx++;
  }
  bladeMesh.count = bladeIdx;
  bladeMesh.castShadow = true;
  bladeMesh.receiveShadow = true;
  villa.add(bladeMesh);
  disposables.push(bladeGeo, bladeMat);

  // =====================================================
  //  真实灌木（多球叠加，不规则形状）
  // =====================================================

  function addShrub(x, z, s = 0.45) {
    const shrubGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a7c34, roughness: 0.95 });
    // 3-4 个变形球体叠加
    const lumps = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < lumps; i++) {
      const r = s * (0.6 + Math.random() * 0.4);
      const geo = new THREE.SphereGeometry(r, 10, 7);
      // 随机变形
      geo.scale(
        0.8 + Math.random() * 0.4,
        0.7 + Math.random() * 0.3,
        0.8 + Math.random() * 0.4
      );
      const lump = new THREE.Mesh(geo, mat);
      lump.position.set(
        (Math.random() - 0.5) * s * 0.8,
        r * 0.3 + Math.random() * s * 0.3,
        (Math.random() - 0.5) * s * 0.8
      );
      lump.castShadow = true; lump.receiveShadow = true;
      shrubGroup.add(lump); disposables.push(geo);
    }
    shrubGroup.position.set(x, s * 0.3, z);
    villa.add(shrubGroup); disposables.push(mat);
  }
  const entryCx = -W / 2 + garageW + entryW / 2;
  addShrub(entryCx - 0.6, frontZ + 1.2, 0.4);
  addShrub(entryCx + 0.6, frontZ + 1.2, 0.35);
  addShrub(W / 2 - 1, frontZ + 2.5, 0.5);
  addShrub(-W / 2 + 1, frontZ + 2.5, 0.45);
  addShrub(W / 2 + 2, frontZ + 3, 0.55);
  addShrub(-W / 2 - 1.5, frontZ + 1, 0.4);
  addShrub(W / 2 + 4, frontZ + 1, 0.5);

  // 露台盆栽（更精细）
  const potGeo = new THREE.CylinderGeometry(0.22, 0.18, 0.55, 16);
  const potMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.85 });
  const pot = new THREE.Mesh(potGeo, potMat);
  pot.position.set(terraceLeftX + 0.5, upperFloorY + 0.04 + 0.275, uFrontZ - 1.0);
  pot.castShadow = true; villa.add(pot); disposables.push(potGeo, potMat);
  // 盆栽用多个小球叠加
  const potPlantMat = new THREE.MeshStandardMaterial({ color: 0x3a6a24, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const r = 0.2 + Math.random() * 0.15;
    const pGeo = new THREE.SphereGeometry(r, 8, 6);
    const p = new THREE.Mesh(pGeo, potPlantMat);
    p.position.set(
      terraceLeftX + 0.5 + (Math.random() - 0.5) * 0.3,
      upperFloorY + 0.04 + 0.55 + Math.random() * 0.25,
      uFrontZ - 1.0 + (Math.random() - 0.5) * 0.3
    );
    p.castShadow = true; villa.add(p); disposables.push(pGeo);
  }
  disposables.push(potPlantMat);

  // =====================================================
  //  真实树（分形递归分支 + 多球树冠）
  // =====================================================

  function addTree(x, z, scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, 0, z);
    treeGroup.scale.setScalar(scale);

    // 树干材质
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.95 });
    // 叶子材质（带颜色变化）
    const leafColors = [0x3a5a28, 0x4a6a30, 0x5a7a38, 0x3a6a24];
    const leafMats = leafColors.map((c) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
      disposables.push(m);
      return m;
    });

    // 递归生成分支
    function makeBranch(startY, length, radius, angle, depth) {
      if (depth <= 0 || length < 0.15) return;
      // 树干段
      const segGeo = new THREE.CylinderGeometry(radius * 0.7, radius, length, 6);
      const seg = new THREE.Mesh(segGeo, trunkMat);
      seg.position.y = startY + length / 2;
      seg.castShadow = true;
      treeGroup.add(seg); disposables.push(segGeo);

      // 在分支末端生成叶冠球
      if (depth <= 2) {
        const crownR = 0.6 + Math.random() * 0.4;
        const crownGeo = new THREE.SphereGeometry(crownR, 8, 6);
        // 变形
        crownGeo.scale(0.9, 0.8 + Math.random() * 0.3, 0.9);
        const crownMat = leafMats[Math.floor(Math.random() * leafMats.length)];
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.y = startY + length + crownR * 0.3;
        crown.position.x = (Math.random() - 0.5) * 0.3;
        crown.position.z = (Math.random() - 0.5) * 0.3;
        crown.castShadow = true;
        treeGroup.add(crown); disposables.push(crownGeo);
      }

      // 递归子分支
      const branchCount = depth > 2 ? 2 : 0;
      for (let i = 0; i < branchCount; i++) {
        const newAngle = angle + (Math.random() - 0.5) * 0.8;
        const yOffset = Math.cos(newAngle) * length * 0.8;
        const xOffset = Math.sin(newAngle) * length * 0.6 * (i === 0 ? 1 : -1);
        // 简化：在顶部两侧递归
        makeBranch(
          startY + length * 0.7,
          length * 0.65,
          radius * 0.6,
          newAngle,
          depth - 1
        );
      }
    }

    // 主干
    makeBranch(0, 1.8 + Math.random() * 0.4, 0.15, 0, 4);

    // 额外的叶冠球（让树冠更饱满）
    const topY = 1.8;
    for (let i = 0; i < 5; i++) {
      const r = 0.5 + Math.random() * 0.5;
      const geo = new THREE.SphereGeometry(r, 8, 6);
      geo.scale(0.9, 0.8, 0.9);
      const mat = leafMats[Math.floor(Math.random() * leafMats.length)];
      const crown = new THREE.Mesh(geo, mat);
      crown.position.set(
        (Math.random() - 0.5) * 1.2,
        topY + Math.random() * 1.0,
        (Math.random() - 0.5) * 1.2
      );
      crown.castShadow = true;
      treeGroup.add(crown); disposables.push(geo);
    }

    disposables.push(trunkMat);
    villa.add(treeGroup);
  }

  // 放置树
  addTree(-10, 4, 1.0);
  addTree(10, -3, 0.9);
  addTree(-8, -8, 1.1);
  addTree(12, 6, 0.85);
  addTree(-12, -2, 0.95);

  return villa;
}

// ============================================================
//  Vue 生命周期
// ============================================================

onMounted(() => {
  scene = createScene();
  renderer = createRenderer();
  container.value.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envMap = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envMap;
  disposables.push(envMap);
  pmrem.dispose();

  camera = createCamera();
  createLights(scene);
  scene.add(createVilla(createMaterials()));

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 3, 2);
  controls.minDistance = 8;
  controls.maxDistance = 55;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);
});

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId);
  disposables.forEach((d) => { if (d && d.dispose) d.dispose(); });
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode)
      renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
});
</script>

<style scoped>
.scene-container { width: 100%; height: 100%; position: relative; }
.ui-overlay { position: absolute; top: 16px; left: 16px; z-index: 10; pointer-events: none; }
.info-card {
  background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(8px);
  border-radius: 8px; padding: 16px 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
}
.info-card h3 {
  margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #303133;
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.info-card p {
  margin: 0 0 4px 0; font-size: 13px; color: #606266;
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.info-card .hint { color: #909399; font-size: 12px; }
</style>
