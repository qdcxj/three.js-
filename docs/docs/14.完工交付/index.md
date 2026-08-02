---
title: 完工交付
date: 2026-08-01
article: true
---

# 完工交付

经过前面十三个阶段的施工，从一片空草地开始，我们依次打地基、砌墙、上屋顶、贴砖瓦、装门窗、布灯光、配相机、做动画、搬家具、写着色器、加后期、冒粒子、优化性能——现在，是时候把所有零件组装在一起，交付一栋**完整、精致、可交互**的欧式乡村小屋了。

本阶段是整个教程的**终章**，也是**最终交付**。你将不再学习新的 Three.js API，而是聚焦于三个工程化主题：**项目架构设计**、**模块整合方法**、**部署与发布**。这些是从「能跑的 demo」走向「可交付的产品」的最后一公里。

## 建造目标

本阶段交付的最终小屋包含以下完整功能：

| 系统 | 功能描述 | 对应阶段 |
|------|----------|----------|
| 地形系统 | 草地平面 + 1500 片 InstancedMesh 草叶（波动着色器） | 01 / 10 / 13 |
| 建筑结构 | 地基平台 + 入口台阶 + 四面墙(含门窗洞) + 尖屋顶 + 山墙 + 烟囱 | 02 / 03 / 04 |
| 门窗系统 | 木门（开关动画）+ 4 扇玻璃窗（Fresnel 反射着色器）+ 蓝色窗框 | 03 / 05 / 08 / 10 |
| 材质贴图 | 程序化砖墙 / 木纹 / 草地纹理（CanvasTexture） | 05 |
| 灯光系统 | 阳光平行光 + 环境光 + 室内点光源 + 壁灯聚光灯 + PCF 软阴影 | 06 |
| 相机系统 | 鸟瞰（OrbitControls）+ 第一人称漫游（PointerLockControls）+ WASD 移动 | 07 |
| 动画系统 | 帧率无关动画（Clock.getDelta）+ 门开关 lerp + 灯光渐变 + 昼夜交替循环 | 08 |
| 室内家具 | 桌子 + 椅子×2 + 床 + 沙发 + 地毯（程序化几何体） | 09 |
| 自定义着色器 | 玻璃 Fresnel 反射 + 草叶波动(onBeforeCompile) + 天空渐变球 | 10 |
| 后期处理 | UnrealBloomPass 辉光 + ACES 色调映射（EffectComposer） | 11 |
| 粒子系统 | 烟囱冒烟 150 粒子（Points + 自定义着色器） | 12 |
| 性能优化 | FPS 面板 + LOD 装饰树 + InstancedMesh 草叶 | 13 |
| 交互控制 | O 开关门 / L 开关灯 / F 第一人称 / G 鸟瞰 / WASD 移动 / 昼夜自动循环 | 07 / 08 |

::: tip 交付级代码
本阶段的 `HouseScene.vue` 是整个教程的**最终交付源码**，约 950 行，整合了全部 14 个阶段的成果。代码按功能分区（createScene / createCamera / createRenderer / createGround / createFoundation / createWalls / createRoof / createDoor / createWindows / createChimney / createFurniture / createLights / createShadows / createShaders / createPostprocessing / createParticles / createControls / setupInteraction / disposeScene），结构清晰，完整可运行，完整 dispose。
:::

## 学习目标

完成本章节后，你将能够：

- 设计合理的 Three.js 项目架构，区分场景搭建、灯光、着色器、后期处理等模块职责
- 掌握将多个功能模块整合成完整应用的方法，解决模块间的冲突（如 ShaderMaterial 与 EffectComposer 的兼容性）
- 使用 `pnpm build` 打包 Three.js 项目，并部署到 Vercel / Netlify / GitHub Pages 等静态托管平台
- 建立性能预算意识，知道「交付级」3D 应该达到什么样的性能标准
- 从全局视角回顾 Three.js 的完整知识体系，将 14 个阶段的碎片知识连点成线

## 知识地图

本章节共包含 **3 节**内容，建议按顺序学习：

| 序号 | 标题 | 难度 | 简介 |
|------|------|------|------|
| 01 | [项目架构设计](./01.项目架构设计.md) | 🟡 进阶 | Three.js 项目架构原则、函数分区组织、资源管理、模块化与配置化 |
| 02 | [整合所有模块](./02.整合所有模块.md) | 🔴 高级 | 将 stage-01~13 整合成完整房子、代码组织实践、冲突解决（着色器与后期兼容等） |
| 03 | [部署与发布](./03.部署与发布.md) | 🟢 基础 | pnpm build 打包、Vercel/Netlify/GitHub Pages 部署、性能预算、全教程回顾 |

::: warning 学习前置
学习本章节前，请确保你已经掌握 [流畅运行](../13.流畅运行/) 的性能优化知识，并对前面所有章节的 Three.js 核心概念有基本认识。本阶段是全局整合，不再重复讲解单个知识点。
:::

## 源码快照位置

本阶段的完整可运行源码位于：

```
lession/stage-14-完工交付/
├── index.html
├── package.json          # name: "stage-14-完工交付"
├── vite.config.js
├── README.md
└── src/
    ├── main.js
    ├── App.vue
    └── components/
        └── HouseScene.vue   # ← 最终完整版小屋（~950 行）
```

运行方式：

```bash
cd lession/stage-14-完工交付
pnpm install
pnpm dev      # 开发预览 → http://localhost:5173
pnpm build    # 生产打包 → dist/
```

## 全 14 阶段回顾

从空地到完整小屋，我们走了 14 步：

| 阶段 | 章节 | 核心成果 | 关键 Three.js 知识点 |
|------|------|----------|---------------------|
| 01 | [项目启动](../01.项目启动/) | 草地 | Scene / Camera / Renderer 三件套 |
| 02 | [地基与台阶](../02.地基与台阶/) | 地基 + 台阶 | BoxGeometry / 坐标系 |
| 03 | [墙体与门窗洞](../03.墙体与门窗洞/) | 四面墙(含洞) + 门板 | 多块 Box 拼接留洞 |
| 04 | [尖屋顶与外墙](../04.尖屋顶与外墙/) | 双坡顶 + 山墙 + 烟囱 | ExtrudeGeometry / 旋转变换 |
| 05 | [砖墙木门玻璃](../05.砖墙木门玻璃/) | 程序化贴图 + 天空 | CanvasTexture / RepeatWrapping |
| 06 | [阳光与室内灯](../06.阳光与室内灯/) | 全套灯光 + 阴影 | DirectionalLight / PointLight / SpotLight / ShadowMap |
| 07 | [相机漫游](../07.相机漫游/) | 鸟瞰 + 第一人称 | OrbitControls / PointerLockControls |
| 08 | [开关门与昼夜](../08.开关门与昼夜/) | 门动画 + 昼夜循环 | Clock.getDelta / lerp / 余弦插值 |
| 09 | [家具进场](../09.家具进场/) | 桌椅床沙发 | GLTFLoader / 程序化几何体 |
| 10 | [玻璃与草地](../10.玻璃与草地/) | 反射 + 波动着色器 | ShaderMaterial / Fresnel / onBeforeCompile |
| 11 | [氛围营造](../11.氛围营造/) | Bloom + 色调映射 | EffectComposer / UnrealBloomPass / OutputPass |
| 12 | [烟囱冒烟](../12.烟囱冒烟/) | 粒子系统 | Points / BufferGeometry / 自定义着色器 |
| 13 | [流畅运行](../13.流畅运行/) | 性能优化 | FPS 面板 / LOD / InstancedMesh / dispose |
| **14** | **完工交付** | **最终完整小屋** | **项目架构 / 模块整合 / 部署发布** |

::: tip 教程设计理念
本教程采用「**项目驱动学习**」的方法论：不是孤立地讲解 API，而是以「建造一栋欧式乡村小屋」为目标，每个阶段都交付一个可运行的完整快照。14 个阶段从简到繁、层层递进，最终汇聚成一栋精致的可交互小屋。这种学法的好处是**每个知识点都有上下文**——你知道为什么要学它、它能用在哪里。
:::

## 准备好了吗

这是教程的最后一章。让我们从 [项目架构设计](./01.项目架构设计.md) 开始，给你的小屋画上最后的句号。

如果你是新读者，也可以从 [项目启动](../01.项目启动/) 从头开始，体验完整的建造旅程。
