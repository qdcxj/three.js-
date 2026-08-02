---
title: 流畅运行
date: 2026-08-01
article: true
---

# 第 13 阶段：流畅运行

> 走到第 13 阶段，我们的乡村小屋已经"形神兼备"：草地、地基、墙体、屋顶、烟囱、玻璃窗、室内家具、阳光阴影、昼夜交替、烟囱袅袅炊烟……一应俱全。但当你把相机拉远，或者打开 Chrome DevTools 的 Performance 面板，你会发现帧率在悄悄下滑——DrawCall 越积越多，几何体越堆越乱，每帧空转的渲染循环在白白发热。本阶段我们要让这栋小屋从"能跑"走向"流畅"：用 Stats 面板看清瓶颈、用 LOD 让远处家具减负、用 InstancedMesh 把落叶打成一次 DrawCall、用 mergeGeometries 合并碎石小径、用按需渲染让静态场景几乎零耗电。

## 建造目标

| # | 优化手段 | 关键 API | 作用 |
|---|----------|----------|------|
| 1 | Stats 性能面板 | `Stats` from `three/examples/jsm/libs/stats.module.js` | 实时显示 FPS / MS / MB，看清瓶颈在哪 |
| 2 | LOD 多精度模型 | `THREE.LOD` + `addLevel(mesh, distance)` | 远处家具退化为低精度盒子，降低三角形数 |
| 3 | InstancedMesh 实例化 | `THREE.InstancedMesh` + `setMatrixAt` | 200 片落叶用 1 个 DrawCall 渲染 |
| 4 | 合并几何体 | `mergeGeometries` from `BufferGeometryUtils` | 30 块碎石合并为 1 个 BufferGeometry |
| 5 | 按需渲染 | `needsRender` 脏标记 + `controls.on("change")` | 静态模式下仅在交互时重绘，省电省 GPU |
| 6 | frustum culling | `mesh.frustumCulled = true`（默认） | 视锥外物体自动跳过，Three.js 内置 |

到本阶段末，左上角会出现一个 Stats 面板实时跳动 FPS；右下角的状态卡片新增"DrawCall 次数 / 三角形个数"两项指标；按 P 键可切换到"静态按需渲染"模式——这时所有动画暂停，相机不动时帧率会瞬间飙到上限、GPU 占用几乎为零。把相机拉远到 18 米外，桌椅床柜会自动从"细节版"切换到"盒子版"，Stats 上的三角形数会肉眼可见地下降。

## 学习目标

完成本阶段后，你应当能够：

- **集成 Stats 性能面板**：导入 `stats.module.js`，挂到 `document.body`，读懂 FPS / MS / MB 三种模式分别代表什么，并能根据面板数据判断瓶颈类型（CPU、GPU 还是内存）
- **使用 THREE.LOD 实现多精度切换**：为同一物体准备"高精度组 + 低精度网格 + 空对象"三级，按相机距离自动切换，理解 `addLevel` 的距离阈值含义
- **使用 InstancedMesh 批量渲染重复物体**：用一份 geometry + 一份 material + N 个实例矩阵渲染成百上千个相同物体，DrawCall 始终为 1，并能在渲染循环中动态更新实例矩阵
- **使用 mergeGeometries 合并静态几何体**：把多个共用材质的几何体合并为一个 `BufferGeometry`，理解"必须先 bake 世界变换到顶点"这一前提
- **实现按需渲染**：用"脏标记 + 事件驱动"模式让静态场景仅在交互时重绘，掌握 `controls.addEventListener("change")` 触发重绘的写法
- **理解 frustum culling 工作原理**：Three.js 默认按物体包围球与视锥的相交关系剔除不可见物体，知道何时该关掉它（如粒子系统）

## 知识地图（3 节）

| 序号 | 标题 | 难度 | 核心知识点 |
|------|------|------|-----------|
| 01 | [性能监测 Stats](./01.性能监测Stats) | 🟢 入门 | Stats 面板 · FPS/MS/MB · renderer.info · DrawCall 与三角形数 · 性能瓶颈识别 |
| 02 | [LOD 与合并几何体](./02.LOD与合并几何体) | 🟡 进阶 | THREE.LOD · addLevel 多精度 · mergeGeometries 静态合并 · frustum culling 视锥剔除 |
| 03 | [InstancedMesh 与按需渲染](./03.InstancedMesh与按需渲染) | 🔴 高级 | InstancedMesh 实例化 · setMatrixAt 实例矩阵 · 按需渲染脏标记 · controls.change 事件驱动 |

## 前置与源码

- **前置章节**：[12. 烟囱冒烟](../12.烟囱冒烟/) —— 本阶段在 stage-12 的烟囱粒子基础上加性能优化。请确保已掌握 `THREE.Points` 粒子系统、`BufferGeometry.setAttribute` 用法，因为本阶段的 InstancedMesh 与粒子系统在"一份几何体 + N 个实例数据"的思路上高度相似
- **本阶段源码快照**：`lession/stage-13-流畅运行/`
  - 完整 Vite + Vue 3 + Three.js 项目，复制即可运行（`pnpm install && pnpm dev`）
  - 核心 `src/components/HouseScene.vue` 累积包含：草地 + 地基 + 台阶 + 四面墙(含洞) + 门板 + 尖屋顶 + 烟囱 + 室内地板 + 砖墙/木纹程序化贴图 + 玻璃窗 + 天空盒 + 环境光 + 阳光 + 室内点光源 + 壁灯聚光灯 + 阴影系统 + 室内家具 + 烟囱粒子 + **Stats 面板 + LOD 家具 + InstancedMesh 落叶 + mergeGeometries 碎石小径 + 按需渲染**
- **整体规格**：[`HOUSE_SPEC.md`](../../lession/HOUSE_SPEC.md) —— 14 阶段统一房屋基准，性能优化方案见第 69 行

## 阶段衔接

```
stage-12 烟囱冒烟        stage-13 流畅运行            stage-14 完工交付
  THREE.Points     →     Stats / LOD / InstancedMesh  →   整合所有，最终完整小屋
  烟雾上升动画            mergeGeometries / 按需渲染       全场景整合 + 发布
```

::: tip 优化的金科玉律
**「先测量，再优化」**。不要凭直觉优化，而要用 Stats 面板和 Chrome DevTools 找到真正的瓶颈。优化了不该优化的地方，既浪费时间又可能引入 bug。本章节会从性能监测开始，帮你建立科学的「监测 → 优化 → 验证」工作流。
:::

::: warning 学习前置
学习本章节前，请确保你已经掌握前面章节的 [场景与渲染器](../01.项目启动/)、[墙体与变换](../03.墙体与门窗洞/)、[粒子系统](../12.烟囱冒烟/) 等内容，并对 Three.js 的渲染流程（场景图、相机、渲染器、DrawCall）有基本认识。性能优化的本质是"理解渲染管线后做减法"，没有前置知识就无法判断瓶颈在哪。
:::

::: tip 学习路径建议
建议按 01 → 02 → 03 顺序学习：先把 Stats 面板装好，学会读 FPS/MS/MB 与 renderer.info，建立"性能可视化"能力；再用 LOD 和 mergeGeometries 给"单个复杂物体"和"多个静态物体"两种场景分别减负；最后用 InstancedMesh 处理"大量重复物体"，并用按需渲染把"动画全开"模式与"静态省电"模式切换自如。每节都配有源码片段，可直接对照 `HouseScene.vue` 阅读。
:::

::: tip 进入下一节
准备好了吗？让我们从 [01. 性能监测 Stats](./01.性能监测Stats) 开始，先把"性能可视化"做出来——只有看得见瓶颈，才能谈优化。
:::
