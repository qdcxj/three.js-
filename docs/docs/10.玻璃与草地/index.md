---
title: 玻璃与草地
date: 2026-08-01
article: true
---

# ✨ 第 10 阶段：玻璃与草地

> 走到第 10 阶段，我们的乡村小屋已经"五脏俱全"——草地、地基、墙体、屋顶、烟囱、地板、贴图、玻璃、灯光、阴影、开关门、昼夜循环、室内家具全部就位。但仔细看一眼：玻璃是死的、草地是死的，无论昼夜如何变化，它们都纹丝不动。本阶段正式踏入 Three.js 最强大也最"底层"的能力——**着色器（Shader）**：把玻璃换成有菲涅尔反射的"真玻璃"，把草地换成会随风起伏的"真草地"。

## 🎯 建造目标

| # | 构件 | 关键参数 | 实现方式 |
|---|------|----------|----------|
| 1 | 玻璃反射着色器 | uniforms: uTime/uColorA/uColorB | ShaderMaterial 替换 MeshPhysicalMaterial，菲涅尔反射 + 时间闪烁 |
| 2 | 草地波动着色器 | PlaneGeometry(40,40,100,100) + uTime | 顶点着色器多频正弦波动 + 片段着色器绿色 Lambert |
| 3 | uTime 驱动 | Clock.getElapsedTime() 每帧更新 uniform.value | 渲染循环中调用 updateShaders(elapsed) |
| 4 | uBrightness 联动昼夜 | 白天 1.0 / 夜晚 0.25 | updateDayNight 中同步写入 grassMaterial.uniforms |
| 5 | 累积构件 | stage-01~09 全部 | 草地+地基+台阶+四面墙含洞+木门+尖屋顶+山墙+烟囱+室内地板+玻璃+贴图+灯光阴影+开关门+昼夜+家具 |

到本阶段末，运行项目应能看到：暖米色砖墙小屋立在一片**会随风起伏的草地**上，4 块玻璃窗在阳光下泛着**菲涅尔反光**——正视时透出浅蓝室内色，斜看时边缘反着天光白，并随时间有微微闪烁。昼夜循环时，草地的亮度也会跟着白天/夜晚同步变化。按 **O** 开门、按 **L** 开灯的交互依旧可用。

## 📚 学习目标

完成本阶段后，你应当能够：

- **理解 ShaderMaterial 的结构**：知道 uniforms / vertexShader / fragmentShader 三件套各自的作用，以及与 Three.js 内置材质的本质区别
- **掌握 uniforms / attribute / varying 三种变量**：清楚谁是"JS → GPU"、谁是"GPU 内置输入"、谁是"顶点 → 片段"
- **记住 Three.js 自动注入的内置矩阵与变量**：`projectionMatrix` / `modelViewMatrix` / `modelMatrix` / `viewMatrix` / `normalMatrix` / `cameraPosition` / `position` / `normal` / `uv`
- **手写菲涅尔反射着色器**：用 `1 - dot(视线, 法线)` 计算边缘反光强度，混合两种颜色模拟玻璃质感
- **手写顶点波动着色器**：用 `sin(position.x + uTime)` 让顶点 y 产生正弦位移，配合高细分网格实现"风吹草动"
- **在渲染循环中更新 uniform**：用 `clock.getElapsedTime()` 取得累计时间，每帧写入 `material.uniforms.uTime.value`
- **正确 dispose ShaderMaterial**：理解它与普通材质走相同的 `dispose()` 路径，会释放 GPU 程序

## 🗺️ 知识地图（3 节）

| 序号 | 标题 | 难度 | 核心知识点 |
|------|------|------|-----------|
| 01 | [着色器基础](./01.着色器基础) | 🟡 进阶 | ShaderMaterial 结构 · uniforms/attribute/varying · 内置矩阵 · GLSL 速查 |
| 02 | [玻璃反射着色器](./02.玻璃反射着色器) | 🔴 高阶 | 菲涅尔反射原理 · 视线·法线夹角 · Schlick 近似 · uTime 闪烁 |
| 03 | [草地波动着色器](./03.草地波动着色器) | 🔴 高阶 | 高细分 PlaneGeometry · 顶点 y 正弦波动 · 法线数值梯度 · 风吹草动 |

## 🔗 前置与源码

- **前置章节**：[09. 家具进场](../09.家具进场/) —— 本阶段在 stage-09 完整小屋（含家具）基础上替换玻璃与草地的材质。如果跳着读，至少要理解 MeshPhysicalMaterial 的 transparent/transmission 用法（[05. 砖墙木门玻璃](../05.砖墙木门玻璃/)）和昼夜循环中 lerp 颜色的写法（[08. 开关门与昼夜](../08.开关门与昼夜/)）
- **本阶段源码快照**：`lession/stage-10-玻璃与草地/`
  - 完整 Vite + Vue 3 + Three.js 项目，复制即可运行
  - 核心 `src/components/HouseScene.vue` 累积包含：草地(着色器) + 地基 + 台阶 + 四面墙(含洞) + 木门(带门轴) + 尖屋顶 + 山墙 + 烟囱 + 室内地板 + 玻璃(着色器) + 程序化贴图 + 灯光阴影 + OrbitControls + 开关门动画 + 开关灯 + 昼夜循环 + 室内家具 + 两个 ShaderMaterial
- **整体规格**：[`HOUSE_SPEC.md`](../../lession/HOUSE_SPEC.md) —— 14 阶段统一房屋基准，所有并行 Agent 共用

## 🧭 阶段衔接

```
stage-09 家具进场            stage-10 玻璃与草地             stage-11 氛围营造
  glTF / 程序化家具    →     ShaderMaterial 全家桶     →     Bloom / 景深 后期
  室内陈设完整                 玻璃菲涅尔 + 草地波动           全屏泛光与景深
```

::: tip 前置知识
学习本章前请确保已掌握 [06. 阳光与室内灯](../06.阳光与室内灯/) 中灯光强度与颜色的概念（着色器里要手写 Lambert 光照），以及 [08. 开关门与昼夜](../08.开关门与昼夜/) 中 `clock.getDelta()` 与 `clock.getElapsedTime()` 的区别（前者用于帧率无关动画，后者用于驱动着色器 uTime）。如果你完全没接触过 GLSL，建议先读完 01 节再回来读 02/03。
:::

::: warning ShaderMaterial 不自动接收灯光
这是初学者最常踩的坑：`ShaderMaterial` 不会像 `MeshStandardMaterial` 那样自动响应场景里的 `DirectionalLight` / `PointLight`。所有光照计算（漫反射、高光、阴影）都要你在 GLSL 里**手写**。本阶段的草地着色器就用一个简单的 Lambert 公式模拟阳光斜照，并通过 `uBrightness` uniform 接入昼夜循环。
:::

::: tip 学习路径建议
建议按 01 → 02 → 03 顺序学习：先在 01 节把 ShaderMaterial 的"三件套"和 GLSL 内置变量彻底搞清楚（这是后续两节的地基），再用 02 节的玻璃着色器学习"片段着色器主导"的案例（菲涅尔反射主要在片段着色器算），最后用 03 节的草地着色器学习"顶点着色器主导"的案例（顶点位移是草地波动的核心）。两节对比着读，你会对顶点/片段着色器的分工有更直观的理解。
:::

::: tip 进入下一节
准备好了吗？让我们从 [01. 着色器基础](./01.着色器基础) 开始，先把 `ShaderMaterial` 的结构、`uniforms`/`attribute`/`varying` 三种变量的区别、以及 Three.js 自动注入的内置矩阵彻底搞清楚——这是玻璃与草地两个着色器案例的全部基石。
:::
