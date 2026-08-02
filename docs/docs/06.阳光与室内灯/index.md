---
title: 阳光与室内灯
date: 2026-08-01
article: true
---

# 第 06 阶段：阳光与室内灯

> 走到第 06 阶段，我们的乡村小屋终于"亮"了起来。前五个阶段我们搭好了房子主体、贴上了砖墙木门玻璃、罩上了天空盒，但场景里只有一盏临时平行光——它不投阴影、不衰减，房子看起来像个"漂浮的塑料模型"。本阶段我们要正式引入完整灯光系统：环境光打底、阳光投射长影、室内点光源照亮房间、壁灯聚光灯打局部光斑，并配上 PCF 软阴影。当阳光斜斜地穿过窗户、在草地和地板上拉出房子的轮廓时，这栋小屋才第一次有了"真实存在感"。

## 建造目标

| # | 灯光/系统 | 关键参数 | 作用 |
|---|----------|----------|------|
| 1 | 环境光 AmbientLight | 0xffffff, 强度 0.3 | 打底亮度，避免背阴面纯黑 |
| 2 | 阳光 DirectionalLight | 0xfffaf0, 强度 1.2, position(10,15,8) | 户外主光，投射房子长影 |
| 3 | 室内点光源 PointLight | 0xffd27a, 强度 1.0, (0,2.8,0), distance=10, decay=1.5 | 天花板吊灯，照亮室内 |
| 4 | 壁灯聚光灯 SpotLight×2 | 0xffe4b5, 强度 0.8, (±2,2.5,-2.8), angle=30°, penumbra=0.4 | 后墙两盏壁灯，打光锥 |
| 5 | 阴影系统 | shadowMap.enabled + PCFSoftShadowMap | 全场景软阴影 |
| 6 | 投影标记 | 墙/屋顶/门/地基 castShadow+receiveShadow；草地 receiveShadow；玻璃不投影 | 控制谁投谁收 |

到本阶段末，相机视角里应能看到：阳光从右上方斜照下来，房子在左侧草地上投下长长的深色影子；屋顶把阴影压在墙面上，屋檐下有一道清晰的明暗分界；透过玻璃窗能看到室内被暖黄色点光源照亮，两盏壁灯的光锥斜斜地打在木地板上，门口台阶也投出小阴影。把 `SHOW_LIGHT_HELPERS` 设为 `true` 还能看到壁灯的线框光锥，直观理解聚光灯的角度与方向。

## 学习目标

完成本阶段后，你应当能够：

- **区分 Three.js 四类灯光**：环境光（无方向无位置）、平行光（有方向无衰减）、点光源（有位置有衰减）、聚光灯（有方向有角度），并知道何时用哪一种
- **配置阳光与阴影**：开启 `renderer.shadowMap`，给平行光设定 `castShadow`、`shadow.camera` 正交范围、`shadow.mapSize`、`shadow.bias`
- **用点光源和聚光灯营造室内氛围**：理解 `distance`/`decay` 的距离衰减、`angle`/`penumbra` 的光锥形状，会用 `SpotLightHelper` 调试
- **掌握阴影系统的全部开关**：渲染器层（enabled/type）、光源层（castShadow/camera/mapSize/bias）、物体层（castShadow/receiveShadow），并能独立排查"没有阴影/阴影痤疮/阴影断裂"三类常见问题
- **写出完整的 dispose**：灯光的 shadow map、helper 都要在组件卸载时释放，避免内存泄漏

## 知识地图（3 节）

| 序号 | 标题 | 难度 | 核心知识点 |
|------|------|------|-----------|
| 01 | [环境光与平行光](./01.环境光与平行光) | 🟢 入门 | AmbientLight · HemisphereLight · DirectionalLight 阳光 · target 方向 · 平行光阴影相机 |
| 02 | [点光源与聚光灯](./02.点光源与聚光灯) | 🟡 进阶 | PointLight 室内灯 · distance/decay 衰减 · SpotLight 壁灯 · angle/penumbra 光锥 · SpotLightHelper |
| 03 | [阴影系统](./03.阴影系统) | 🟡 进阶 | shadowMap.enabled/type · castShadow/receiveShadow · shadow.camera/mapSize/bias · 排查清单 |

## 前置与源码

- **前置章节**：[05. 砖墙木门玻璃](../05.砖墙木门玻璃/) —— 本阶段在 stage-05 的砖墙/木门/玻璃/天空盒基础上加灯光与阴影。请确保已理解 `MeshStandardMaterial` 的 PBR 属性，因为光照效果最终通过材质的 `roughness`/`metalness` 体现
- **本阶段源码快照**：`lession/stage-06-阳光与室内灯/`
  - 完整 Vite + Vue 3 + Three.js 项目，复制即可运行（`pnpm install && pnpm dev`）
  - 核心 `src/components/HouseScene.vue` 累积包含：草地 + 地基 + 台阶 + 四面墙(含洞) + 门板 + 尖屋顶 + 烟囱 + 室内地板 + 砖墙/木纹程序化贴图 + 玻璃窗 + 天空盒 + 环境光 + 阳光 + 室内点光源 + 壁灯聚光灯 + 阴影系统
- **整体规格**：[`HOUSE_SPEC.md`](../../lession/HOUSE_SPEC.md) —— 14 阶段统一房屋基准，灯光参数见第 33~36 行

## 阶段衔接

```
stage-05 砖墙木门玻璃      stage-06 阳光与室内灯        stage-07 相机漫游
  程序化贴图         →     灯光系统 + 阴影       →     第一人称漫游 + 鸟瞰
  天空盒                   阳光/点光/聚光灯           PointerLockControls
```

::: tip 前置知识
学习本章前请确保已掌握 [05. 砖墙木门玻璃](../05.砖墙木门玻璃/) 的 `CanvasTexture` 与 `MeshPhysicalMaterial`（玻璃要用到 transmission），以及 [04. 尖屋顶与外墙](../04.尖屋顶与外墙/) 的 `MeshStandardMaterial` PBR 概念。本章的灯光效果完全依赖材质的受光属性——`MeshBasicMaterial` 不受光，再亮的灯也照不亮它。
:::

::: tip 学习路径建议
建议按 01 → 02 → 03 顺序学习：先把"环境光 + 阳光"这对户外组合搞定，让房子有阳光长影；再加上"点光源 + 聚光灯"营造室内氛围；最后系统学阴影系统，把所有灯光的阴影参数调到正确。每节都配有源码片段，可直接对照 `HouseScene.vue` 的 `addLights()` 函数阅读运行。
:::

::: tip 进入下一节
准备好了吗？让我们从 [01. 环境光与平行光](./01.环境光与平行光) 开始，先给场景打底亮度，再让阳光从 (10,15,8) 斜照下来——这是户外光照的基石。
:::
