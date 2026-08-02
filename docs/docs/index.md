---
layout: home

hero:
  name: Three.js 完全指南
  text: 建造一栋欧式乡村小屋
  tagline: 🏡 14 个实战阶段 · 项目驱动学习 · 从一块草地到一栋会呼吸的小屋 · 每阶段配可运行源码
  actions:
    - theme: brand
      text: 🚀 开始建造
      link: /01.项目启动/
    - theme: alt
      text: 🏆 查看案例
      link: /15.案例/

features:
  - icon: 🌱
    title: 01 · 项目启动
    details: Scene / Camera / Renderer 三件套、Vite + Vue 3 工程化搭建、铺出第一块 40×40 草地。
  - icon: 🧱
    title: 02 · 地基与台阶
    details: BoxGeometry / PlaneGeometry 内置几何体、Shape + ExtrudeGeometry 自定义形状、搭出地基与 L 型台阶。
  - icon: 🏚️
    title: 03 · 墙体与门窗洞
    details: Object3D 变换（position/rotation/scale）、Group 组织、用多块 Box 拼出含门洞窗洞的四面墙。
  - icon: 🏠
    title: 04 · 尖屋顶与外墙
    details: 8 种材质全家桶、MeshStandardMaterial PBR、双坡顶旋转推导、Shape 山墙、烟囱与室内地板。
  - icon: 🎨
    title: 05 · 砖墙木门玻璃
    details: CanvasTexture 程序化纹理（砖墙/木纹/瓦片）、MeshPhysicalMaterial 玻璃透射、天空盒。
  - icon: 💡
    title: 06 · 阳光与室内灯
    details: AmbientLight / DirectionalLight / PointLight / SpotLight 四类灯光、PCF 软阴影系统、投影标记。
  - icon: 📷
    title: 07 · 相机漫游
    details: 透视相机与正交相机参数、OrbitControls 轨道控制、PointerLockControls 第一人称漫游。
  - icon: 🎬
    title: 08 · 开关门与昼夜
    details: requestAnimationFrame 渲染循环、Clock + getDelta 帧率无关、lerp 平滑过渡、门轴 pivot、昼夜循环。
  - icon: 🛋️
    title: 09 · 家具进场
    details: GLTFLoader 模型加载、DRACOLoader 压缩、AnimationMixer 动画、程序化家具搭建与离线回退。
  - icon: ✨
    title: 10 · 玻璃与草地
    details: GLSL 着色器基础、ShaderMaterial 自定义材质、菲涅尔玻璃反射、顶点动画草地波动。
  - icon: 🌅
    title: 11 · 氛围营造
    details: EffectComposer 后期合成、UnrealBloomPass 辉光、景深 DoF、色调映射与色彩分级。
  - icon: 💨
    title: 12 · 烟囱冒烟
    details: Points 粒子系统、BufferGeometry 顶点、粒子纹理与动画、烟囱烟雾与风吹落叶。
  - icon: ⚡
    title: 13 · 流畅运行
    details: Stats 性能监测、LOD 多细节层次、InstancedMesh 实例化、按需渲染与内存 dispose。
  - icon: 🏡
    title: 14 · 完工交付
    details: 模块化架构设计、资源管理与释放、构建部署优化、交付一栋完整可运行的乡村小屋。
  - icon: 🏆
    title: 案例
    details: 旋转立方体、太阳系、粒子星空、产品展示、交互柱状图、着色器波纹等独立示例。
---

## 🏡 14 个建造阶段 · 全景速览

本教程不再按"理论分章"组织，而是**用一栋欧式乡村小屋的建造过程串联 Three.js 全部核心知识**。每章对应一个建造阶段，每阶段都有独立可运行的源码快照（`lession/stage-01 ~ stage-14`），复制即可运行。

| 阶段 | 主题 | 建造产出 | 核心知识点 |
|------|------|----------|-----------|
| 🌱 01 | 项目启动 | 草地 + 基础场景 | Scene/Camera/Renderer、Vite + Vue 3 |
| 🧱 02 | 地基与台阶 | 地基平台 + L 型台阶 | BoxGeometry、Shape + ExtrudeGeometry |
| 🏚️ 03 | 墙体与门窗洞 | 四面墙（含门洞/窗洞）+ 门板 | Object3D 变换、Group 组织 |
| 🏠 04 | 尖屋顶与外墙 | 双坡顶 + 山墙 + 烟囱 + 地板 | 8 种材质、MeshStandardMaterial PBR |
| 🎨 05 | 砖墙木门玻璃 | 砖墙/木纹贴图 + 玻璃窗 + 天空盒 | CanvasTexture、MeshPhysicalMaterial |
| 💡 06 | 阳光与室内灯 | 阳光长影 + 室内点光源 + 壁灯 | 四类灯光、PCF 阴影系统 |
| 📷 07 | 相机漫游 | 轨道控制 + 第一人称漫游 | 透视/正交相机、OrbitControls |
| 🎬 08 | 开关门与昼夜 | 门动画 + 开关灯 + 昼夜循环 | Clock、lerp、门轴 pivot |
| 🛋️ 09 | 家具进场 | 桌椅床沙发 + GLTF 装饰 | GLTFLoader、AnimationMixer |
| ✨ 10 | 玻璃与草地 | 菲涅尔玻璃 + 波动草地 | GLSL、ShaderMaterial |
| 🌅 11 | 氛围营造 | Bloom 辉光 + 景深 + 调色 | EffectComposer 后期处理 |
| 💨 12 | 烟囱冒烟 | 烟囱烟雾 + 风吹落叶 | Points 粒子系统 |
| ⚡ 13 | 流畅运行 | Stats + LOD + InstancedMesh | 性能监测与优化 |
| 🏡 14 | 完工交付 | 完整小屋 + 部署指南 | 模块化架构、资源释放 |

## 🚀 推荐学习路径

### 🟢 地基阶段（搭骨架）

**01 项目启动 → 02 地基与台阶 → 03 墙体与门窗洞**

> 建立 Three.js 三件套心智模型，用几何体和变换搭出房子骨架

### 🟡 主体阶段（长出血肉）

**04 尖屋顶与外墙 → 05 砖墙木门玻璃 → 06 阳光与室内灯**

> 盖屋顶、贴砖墙、上灯光，让白盒子变成有质感、有光影的小屋

### 🔴 进阶阶段（注入灵魂）

**07 相机漫游 → 08 开关门与昼夜 → 09 家具进场 → 10 玻璃与草地**

> 动起来、走进去、摆家具、写着色器，小屋开始"会呼吸"

### 🏆 收尾阶段（打磨交付）

**11 氛围营造 → 12 烟囱冒烟 → 13 流畅运行 → 14 完工交付**

> 后期特效、粒子烟火、性能优化，最终交付一栋完整可部署的房子

## 💡 使用建议

- **跟着建**：按 01 → 14 顺序学习，每章对应一个建造阶段，源码快照可直接 `pnpm install && pnpm dev` 运行
- **对照源码**：每阶段核心代码在 `lession/stage-XX/src/components/HouseScene.vue`，文档代码片段与源码逐字对应
- **统一规格**：所有阶段共用 [`HOUSE_SPEC.md`](./lession/HOUSE_SPEC.md) 房屋基准，确保 14 个快照建出同一栋房子
- **快速定位**：`Ctrl + K` 全站搜索关键词，侧边栏自动生成 14 阶段目录
- **跳读无忧**：每阶段都是独立完整项目，前序阶段缺失时按 HOUSE_SPEC 重新累积，任意阶段均可单独运行

> 由 [vitepress-theme-teek](https://github.com/Kele-Bingtang/vitepress-theme-teek) 驱动 · 自动生成目录 + 侧边栏 · 暗色模式 · **本地搜索一键切换**
