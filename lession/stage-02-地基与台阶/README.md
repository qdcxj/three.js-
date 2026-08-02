# stage-02 · 地基与台阶

> 欧式乡村小屋 · 项目驱动 Three.js 教程第二阶段。在 stage-01 草地基础上，加 **地基平台 + 入口台阶**，并教学 Three.js **内置几何体全家桶**。

## 一、本阶段建造目标

| 构件 | 尺寸（m） | 位置（中心坐标） | 颜色 |
|------|-----------|------------------|------|
| 草地（继承 stage-01） | 40 × 40 | (0, 0, 0) | #67c23a 成功绿 |
| 地基平台 | 8(X) × 0.3(Y) × 6(Z) | (0, 0.15, 0) | #909399 信息灰 |
| 入口台阶（2 级） | 1.5(X) × 0.15(Y) × 0.4(Z) | (0, 0.075, 3.2) 与 (0, 0.225, 3.0) | #909399 信息灰 |
| 几何体预览（5 件） | 各异 | x ∈ {-6, -3, 0, 3, 6}，z = -8 | Element Plus 五色调色 |

第二阶段完成后，场景里会出现一块灰色地基压在草地上，门口探出两级台阶，远处草地上一排「建筑材料预览」展示 5 种内置几何体的代表形态。

## 二、运行方式

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 浏览器打开 http://localhost:5173
```

操作说明：

| 操作 | 效果 |
|------|------|
| 鼠标左键拖拽 | 旋转视角 |
| 鼠标右键拖拽 | 平移视角 |
| 滚轮 | 缩放 |

## 三、目录结构

```
stage-02-地基与台阶/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── HouseScene.vue   # 核心场景组件（草地 + 地基 + 台阶 + 几何体预览）
│   ├── App.vue              # 引入 HouseScene
│   ├── main.js              # 应用挂载入口
│   └── style.css            # 全屏重置样式
├── index.html
├── package.json
└── vite.config.js
```

## 四、与 stage-01 的差异

本阶段的 `HouseScene.vue` 是 stage-01 的**累积升级版**：

1. **完全保留 stage-01 内容**：草地（PlaneGeometry 40×40 #67c23a）、AxesHelper、GridHelper、OrbitControls、环境光 + 平行光、渲染循环、dispose 清理
2. **新增地基平台**：`BoxGeometry(8, 0.3, 6)` + `MeshStandardMaterial({ color: 0x909399 })`，position(0, 0.15, 0)
3. **新增入口台阶（2 级）**：两块 `BoxGeometry(1.5, 0.15, 0.4)` 灰色块，分别位于 (0, 0.075, 3.2) 和 (0, 0.225, 3.0)
4. **新增几何体预览**：在远处（z = -8）用 BoxGeometry / SphereGeometry / ConeGeometry / CylinderGeometry / TorusGeometry 各做一个展示物，配 Element Plus 五色调色，作为「内置几何体全家桶」章节的实物教具

## 五、技术栈

- Vite 5 + Vue 3.5（组合式 API `<script setup>`）
- three@0.169.0
- `import * as THREE from "three"`
- 相机：PerspectiveCamera(50, aspect, 0.1, 200)，初始位置 (12, 8, 12) 看向原点
- 控制器：OrbitControls
- 生命周期：onMounted 初始化，onUnmounted dispose 清理

## 六、下一阶段预告

stage-03 将在本阶段地基上 **砌四面墙**（含门洞、窗洞）并装上**门板**，开始有了房子的雏形。
