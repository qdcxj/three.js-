---
title: 氛围营造
date: 2026-08-01
article: true
---

# 氛围营造

到这里，我们的小屋已经"形神兼备"——有了结构、贴图、灯光、阴影，甚至还用着色器让玻璃边缘泛起 Fresnel 高光、让草地随风波动。但你有没有觉得画面还是"工程感"重了一些，少了一点**电影感**？

问题出在最后一步渲染：`renderer.render(scene, camera)` 是把场景"啪"地一下直接拍到底片上，没有任何后期加工。真实电影从来不是这样——拍完素材后，调色师会调色、加滤镜、加辉光、做景深虚化，把"素材"变成"画面"。

这一章我们就要把这套"后期加工流水线"搬到 Three.js 里。它有个专门的名字：**后期处理（Post-Processing）**。完成后，室内点亮的暖灯会向四周晕开温暖的辉光，玻璃边缘的高光会"溢出"成光晕，远处景物因景深而柔和虚化，整张画面被 ACES 色调映射染上一层电影质感——小屋终于从"3D 模型"升级为"夜景大片"。

## 建造目标

在 [stage-10 着色器](../10.着色器/) 的基础上，把直接渲染替换为 **EffectComposer 后期管线**：

```
RenderPass → UnrealBloomPass → BokehPass → OutputPass
```

- **UnrealBloomPass**（辉光）：让室内灯泡、壁灯、玻璃边缘高光产生电影级光晕
- **BokehPass**（景深）：焦点对准小屋，远近虚化，强化主体
- **OutputPass + ACESFilmicToneMapping**（色调映射）：把 HDR 线性数据压回显示范围，染上电影色调

## 学习目标

完成本章后，你将能够：

- 理解后期处理的"先渲染到纹理，再流水线加工"工作原理
- 掌握 `EffectComposer` 的串联机制与 `RenderPass` 的角色
- 使用 `UnrealBloomPass` 实现可控辉光，并理解 strength / radius / threshold 三个参数
- 使用 `BokehPass` 实现景深虚化，理解焦点与光圈的关系
- 理解 ACESFilmic 色调映射 + `OutputPass` 在管线末端的职责
- 把 `renderer.render()` 改写为 `composer.render()`，并在 resize / dispose 中正确处理 composer

## 知识地图

本章共 3 节，按"先搭管线 → 加辉光 → 加景深与色调"的顺序学习：

| 序号 | 标题 | 难度 | 核心知识点 |
|------|------|------|-----------|
| 01 | [EffectComposer 基础](./01.EffectComposer基础) | 🟡 进阶 | EffectComposer · RenderPass · Pass 串联 · composer.render |
| 02 | [Bloom 辉光](./02.Bloom辉光) | 🟡 进阶 | UnrealBloomPass · strength/radius/threshold · HDR 与阈值 |
| 03 | [景深与色调映射](./03.景深与色调映射) | 🔴 高级 | BokehPass · ACESFilmicToneMapping · OutputPass |

::: tip 类比理解
- **EffectComposer** 像一条"照片加工流水线"，场景是原料，每道工序是一个 Pass
- **RenderPass** 是流水线第一站，把场景"拍成照片"存进离屏纹理
- **UnrealBloomPass** 是"加光晕"工位，亮的地方向四周晕开
- **BokehPass** 是"调焦距"工位，焦点外的东西变模糊
- **OutputPass** 是最后一站"洗照片"，把线性 HDR 数据洗成屏幕能显示的 sRGB 画面
:::

## 前置知识

学习本章前，请确保你已经掌握：

- [10.着色器](../10.着色器/) —— 尤其是玻璃 Fresnel 着色器与 uniforms 的更新方式（本章会让玻璃在 Bloom 下发光）
- [06.阳光与室内灯](../06.阳光与室内灯/) —— 灯光、阴影、MeshBasicMaterial 的自发光特性
- [08.开关门与昼夜](../08.开关门与昼夜/) —— 渲染循环、Clock、lerp 动画（本章的灯泡颜色随 lampIntensity 变化继承自这里）

::: warning 学习心法
后期处理最让人迷惑的是"颜色空间"：RenderPass 输出的是**线性 HDR**数据（亮度可以大于 1），而屏幕只能显示 0~1 的 sRGB。整条管线的末端 `OutputPass` 就是干"压回 + 转码"这件事的。理解了这一点，bloom 的 threshold 为什么是 0.85、为什么灯泡颜色要写到 1.6 就都通了。
:::

## 源码快照

本章对应可运行项目快照位于：

```
lession/stage-11-氛围营造/
├── package.json              # name: stage-11-氛围营造
├── vite.config.js
├── index.html
├── README.md
└── src/
    ├── main.js
    ├── App.vue
    └── components/
        └── HouseScene.vue    # 累积 stage-01 ~ stage-11 全部内容
```

运行方式：

```bash
cd lession/stage-11-氛围营造
pnpm install
pnpm dev      # 开发模式，浏览器打开看效果
pnpm build    # 生产构建
```

::: tip 体验建议
启动后**先按 L 开灯**，再观察室内灯泡、壁灯、玻璃边缘的辉光。然后按 **B 关闭 Bloom** 对比，你会立刻明白后期处理的"氛围"价值。按 **D 关闭景深** 对比远近虚化。
:::

`HouseScene.vue` 累积了从 stage-01（草地）到 stage-11（后期处理）的全部构件，是一个完整可运行的小屋场景。本章后续每节会从中抽取关键代码片段进行讲解。

## 关键改动一览

相比 stage-10，stage-11 的核心改动集中在三处：

1. **导入后期模块**：从 `three/examples/jsm/postprocessing/` 引入 `EffectComposer` / `RenderPass` / `UnrealBloomPass` / `BokehPass` / `OutputPass`
2. **新增 `initPostProcessing()`**：构建 Pass 链，串联到 composer
3. **渲染循环改写**：`renderer.render(scene, camera)` → `composer.render()`，并在 `handleResize` 与 `disposeScene` 中同步处理 composer

下面让我们从 [EffectComposer 基础](./01.EffectComposer基础) 开始，搭起这条流水线。
