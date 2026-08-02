# 阶段 01 · 项目启动

> 欧式乡村小屋项目驱动教程 · 第 01 阶段源码快照

## 本阶段建造目标

本阶段是整个 14 阶段项目的起点，我们只完成两件事：

1. **搭建施工场地**：用 Vite + Vue 3 + Three.js 初始化一个可运行的 3D 工程，建立 Scene / Camera / Renderer 三件套
2. **铺设草地地皮**：在地面 `y=0` 平铺一块 40m × 40m 的草地（颜色 `#67c23a` 成功绿），并加入 AxesHelper / GridHelper 辅助工具
3. **接入 OrbitControls**：鼠标可自由旋转、平移、缩放浏览施工场地，为后续阶段观察房子建造过程做准备

本阶段**不建造**地基、墙体、屋顶等任何房屋构件——一切从「场地 + 草地」开始，后续阶段会在这个基础上层层递增。

## 技术栈

- Vite 5.4 + Vue 3.5（组合式 API `<script setup>`）
- three@0.169.0
- OrbitControls 轨道控制器

## 项目结构

```
stage-01-项目启动/
├── index.html                      # Vite 入口 HTML
├── package.json                    # 依赖与脚本
├── vite.config.js                  # Vite 配置（启用 Vue 插件）
├── README.md                       # 本文件
└── src/
    ├── main.js                     # Vue 应用入口
    ├── App.vue                     # 根组件（全屏样式）
    └── components/
        └── HouseScene.vue          # 核心 3D 场景组件（草地 + 辅助工具 + OrbitControls）
```

## 运行方式

```bash
# 安装依赖
pnpm install

# 启动开发服务器（默认 http://localhost:5173）
pnpm dev

# 构建生产包
pnpm build

# 预览生产包
pnpm preview
```

启动后，你会看到一片绿色草地，上面有红绿蓝三色坐标轴和灰色网格。可以用鼠标：

- **左键拖拽**：旋转视角
- **右键拖拽**：平移
- **滚轮**：缩放

## 场景说明

- **草地**：`PlaneGeometry(40, 40)`，绕 X 轴旋转 `-90°` 平铺到地面，颜色 `#67c23a`
- **坐标轴**：`AxesHelper(5)`，红=X 绿=Y 蓝=Z，长度 5m
- **网格**：`GridHelper(40, 40)`，每格 1m，便于目测尺寸
- **相机**：`PerspectiveCamera(50, aspect, 0.1, 200)`，初始位置 `(12, 8, 12)` 看向 `(0, 1, 0)`
- **临时光照**：`AmbientLight(0.6)` + `DirectionalLight(0.8)`，仅用于照亮草地，正式灯光在 stage-06

## 下一阶段预告

下一阶段 **stage-02 地基与台阶** 将在本阶段草地基础上：

- 用 `BoxGeometry` 浇筑 8m × 6m × 0.3m 的灰色地基平台（颜色 `#909399`）
- 在地基南侧铺设两级入口台阶
- 为后续砌墙准备好稳固的「基座」

详见 `../stage-02-地基与台阶/`。
