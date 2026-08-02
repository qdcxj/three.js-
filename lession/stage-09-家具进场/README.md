# 阶段 09 · 家具进场

> 第 09 阶段的项目驱动教程源码快照：在 stage-08 的基础上把家具搬进室内——餐桌、椅子、床、沙发，全面教学 Three.js 模型加载（GLTFLoader / AnimationMixer / DRACOLoader）。

## 运行

```bash
pnpm install
pnpm dev      # 开发模式
pnpm build    # 生产构建
pnpm preview  # 预览构建产物
```

## 操作

- **鼠标拖拽**：OrbitControls 旋转视角
- **滚轮**：缩放
- **O 键**：开门 / 关门（继承 stage-08）
- **L 键**：开灯 / 关灯（继承 stage-08）
- **昼夜循环**：自动进行，每 24 秒一天

## 累积内容

- stage-01：草地（带程序化草地贴图）
- stage-02：地基平台 + 入口台阶
- stage-03：四面墙（含门洞/窗洞）+ 木门
- stage-04：尖屋顶（双坡顶）+ 山墙 + 烟囱 + 室内地板
- stage-05：程序化砖墙 / 木纹 / 玻璃贴图
- stage-06：阳光 + 环境光 + 室内点光源 + 壁灯聚光灯 + 阴影
- stage-07：相机（简化为 OrbitControls，含阻尼）
- stage-08：开关门动画 + 开关灯 + 昼夜交替（Clock + lerp）
- stage-09：家具进场——程序化搭建餐桌/椅子/床/沙发，附 GLTFLoader 生产用法演示

## 家具方案

为保持源码快照**离线可运行**（无外部 .glb/.gltf 文件依赖），所有家具用**基础几何体程序化搭建**：

| 家具 | 结构 | 位置 |
|------|------|------|
| 餐桌 | 桌面 Box(1.2,0.1,0.8) + 4 CylinderGeometry 腿 | (-2, 0.9, -1) |
| 椅子 ×2 | 座板 + 靠背 + 4 腿（Group 复用） | 桌两侧 |
| 床 | 床框 + 床垫 + 枕头×2 | (2.5, 0.5, -1.5) |
| 沙发 | 底座 + 靠背 + 2 扶手 + 坐垫×2 | (0, 0.5, 1.5) |

源码另含 GLTFLoader 演示（注释 + 可选在线尝试，onError 静默回退到程序化家具），文档章节完整教学 GLTFLoader / AnimationMixer / DRACOLoader 的生产用法。

## 关键文件

- `src/components/HouseScene.vue` —— 主场景组件，可直接复制粘贴运行
