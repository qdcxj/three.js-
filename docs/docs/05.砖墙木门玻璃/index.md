---
title: 砖墙木门玻璃
date: 2026-08-01
article: true
---

# 🏠 第 05 阶段：砖墙木门玻璃

> 走到第 05 阶段，我们的乡村小屋终于脱下了"纯色外衣"。本阶段在 stage-04 的几何骨架上，给外墙贴上砖墙纹理、给门板贴上木纹、给屋顶贴上鱼鳞瓦片，再装上 4 扇会折射光线的真实玻璃窗，最后用程序化渐变天空盒把整个场景包起来——一栋有材质、有玻璃、有天空的欧式小屋就此成型。

## 🎯 建造目标

| # | 构件 | 关键参数 | 实现方式 |
|---|------|----------|----------|
| 1 | 砖墙纹理 | 暖米色 #e6d5b8 底 + 砖缝网格线，repeat(4,2) | CanvasTexture + Canvas 2D 程序化绘制 |
| 2 | 木门纹理 | 棕色 #8b5a2b + 垂直纹理条纹 + 木节 | CanvasTexture，ClampToEdge 不重复 |
| 3 | 屋顶瓦片纹理 | 砖红 #a0522d + 鱼鳞半圆瓦片，repeat(6,4) | CanvasTexture + 径向渐变 |
| 4 | 玻璃窗×4 | transmission:1, roughness:0, ior:1.5, thickness:0.1 | MeshPhysicalMaterial 透射 |
| 5 | 窗框×4 | 0.04 边框 + 十字窗棂，#409eff 主色蓝 | BoxGeometry 拼框 |
| 6 | 天空盒 | 上蓝下白垂直渐变 | Canvas 渐变贴图作 scene.background |

到本阶段末，相机视角里应能看到：米色砖墙的小屋正面，两扇蓝色窗框的玻璃窗折射着天空与室内的光线，木纹门板立在正中，砖红鱼鳞瓦片覆盖人字屋顶，远处是一片从天蓝渐变到近白的天空——所有纹理都由代码实时生成，没有依赖任何外部图片。

## 📚 学习目标

完成本阶段后，你应当能够：

- **理解纹理贴图全链路**：从 TextureLoader / CanvasTexture 创建，到 UV 映射、wrapS/wrapT、repeat/offset、filter、anisotropy、colorSpace，再到 dispose 释放
- **用 Canvas 2D 程序化生成纹理**：手写砖墙、木纹、鱼鳞瓦片三种纹理，不依赖任何外部图片资源，让快照自包含可运行
- **掌握 RepeatWrapping 与 ClampToEdge 的区别**：知道什么时候该让纹理重复平铺（墙面、屋顶），什么时候该让边缘拉伸（门板）
- **用 MeshPhysicalMaterial 做真实玻璃**：理解 transmission（透射）、ior（折射率）、thickness（厚度）、roughness（光滑度）四个核心参数
- **实现程序化天空盒**：用一张 Canvas 渐变贴图作 scene.background，并理解 CubeTexture 立方纹理天空盒的原理与适用场景

## 🗺️ 知识地图（4 节）

| 序号 | 标题 | 难度 | 核心知识点 |
|------|------|------|-----------|
| 01 | [纹理贴图基础](./01.纹理贴图基础) | 🟢 入门 | TextureLoader/CanvasTexture · UV 映射 · wrapS/wrapT · repeat/offset · filter · anisotropy · colorSpace · dispose |
| 02 | [砖墙木门贴图](./02.砖墙木门贴图) | 🟡 进阶 | Canvas 2D 画砖纹/木纹 · running bond 错缝 · CanvasTexture 应用到 map |
| 03 | [玻璃窗与透射](./03.玻璃窗与透射) | 🟡 进阶 | MeshPhysicalMaterial · transmission/ior/thickness · 窗框拼接 · 透射渲染通道 |
| 04 | [天空盒与立方纹理](./04.天空盒与立方纹理) | 🟡 进阶 | CubeTextureLoader 原理 · 程序化天空盒 · scene.background · 6 面 CubeTexture |

## 🔗 前置与源码

- **前置章节**：[04. 尖屋顶与外墙](../04.尖屋顶与外墙/) —— 本阶段在 stage-04 的屋顶 + 山墙 + 烟囱 + 室内地板基础上，把纯色材质替换为程序化纹理，并补上玻璃窗与天空盒
- **本阶段源码快照**：`lession/stage-05-砖墙木门玻璃/`
  - 完整 Vite + Vue 3 + Three.js 项目，复制即可运行
  - 核心 `src/components/HouseScene.vue` 累积包含：草地 + 地基 + 台阶 + 四面墙(含洞) + 门板 + 尖屋顶 + 烟囱 + 室内地板 + 砖墙/木纹/瓦片纹理 + 4 扇玻璃窗 + 天空盒
  - **所有纹理用 CanvasTexture 程序化生成，不依赖任何外部图片文件**
- **整体规格**：[`HOUSE_SPEC.md`](../../lession/HOUSE_SPEC.md) —— 14 阶段统一房屋基准，所有并行 Agent 共用

## 🧭 阶段衔接

```
stage-04 尖屋顶与外墙      stage-05 砖墙木门玻璃        stage-06 阳光与室内灯
  屋顶+烟囱+地板      →    贴图纹理+玻璃+天空盒   →    阳光/环境光/室内灯+阴影
  8 种材质教学              程序化砖墙/木纹/瓦片         阴影映射
```

::: tip 前置知识
学习本章前请确保已掌握 [04. 尖屋顶与外墙](../04.尖屋顶与外墙/) 的 MeshStandardMaterial（PBR 材质）用法——本阶段会在那些材质上叠加 `map` 贴图属性，让纯色表面变成有纹理的真实表面。如果你还不熟悉材质的 `color` / `roughness` / `metalness` 三个核心属性，建议先回顾第 04 阶段的 03 节。
:::

::: tip 学习路径建议
建议按 01 → 02 → 03 → 04 顺序学习：先建立纹理贴图的全链路概念（UV/wrap/repeat/filter/colorSpace），再动手用 Canvas 2D 画砖墙和木纹并应用到墙面门板，然后给窗户装上透射玻璃，最后用程序化天空盒把整个场景包起来。每节都配有源码片段，可直接对照 `HouseScene.vue` 阅读运行。
:::

::: tip 为什么强调"程序化生成"
本阶段所有纹理都用 Canvas 2D 实时绘制，再用 `THREE.CanvasTexture` 包装成 Three.js 纹理。这样做的最大好处是**快照自包含**——不需要准备任何 .jpg/.png 图片文件，复制项目即可运行。这也是游戏开发和原型设计中常用的技巧：用代码生成可参数化的纹理，而非依赖美术资源。
:::

::: tip 进入下一节
准备好了吗？让我们从 [01. 纹理贴图基础](./01.纹理贴图基础) 开始，先把 TextureLoader、CanvasTexture、UV 映射、wrapS/wrapT、repeat/offset、filter、anisotropy、colorSpace 这一整套纹理知识一次性理清——这是后续砖墙、木纹、瓦片贴图的底层依据。
:::
