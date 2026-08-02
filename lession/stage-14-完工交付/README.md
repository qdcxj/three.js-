# 阶段 14 · 完工交付

> 欧式乡村小屋 —— 最终完整版，整合 stage-01 ~ stage-13 全部构件与功能。

## 快速开始

```bash
pnpm install
pnpm dev      # 开发预览
pnpm build    # 生产打包
pnpm preview  # 预览构建产物
```

## 功能清单

| 系统 | 功能 | 对应阶段 |
|------|------|----------|
| 地形 | 草地 + 1500 片 InstancedMesh 草叶(波动着色器) | stage-01/10/13 |
| 建筑 | 地基 + 台阶 + 四面墙(含门窗洞) + 尖屋顶 + 山墙 + 烟囱 | stage-02/03/04 |
| 门窗 | 木门(开关动画) + 4 扇玻璃窗(Fresnel 反射着色器) | stage-05/08/10 |
| 材质 | 砖墙/木纹/草地程序化贴图(CanvasTexture) | stage-05 |
| 灯光 | 阳光 + 环境光 + 室内点光源 + 壁灯聚光灯 + PCF 软阴影 | stage-06 |
| 交互 | O 开关门 / L 开关灯 / F 第一人称 / G 鸟瞰 / WASD 移动 | stage-07/08 |
| 动画 | 帧率无关动画(Clock) + 昼夜交替循环 | stage-08 |
| 家具 | 桌/椅/床/沙发/地毯(程序化几何体) | stage-09 |
| 着色器 | 玻璃 Fresnel 反射 + 草叶波动(onBeforeCompile) + 天空渐变 | stage-10 |
| 后期 | Bloom 辉光 + ACES 色调映射(EffectComposer) | stage-11 |
| 粒子 | 烟囱冒烟 150 粒子(Points + 自定义着色器) | stage-12 |
| 性能 | FPS 面板 + LOD 装饰树 + InstancedMesh 草叶 | stage-13 |

## 技术栈

- Vite 5 + Vue 3.5（`<script setup>` 组合式 API）
- three@0.169.0
- Element Plus 设计规范配色

## 操作键位

| 键位 | 功能 |
|------|------|
| O | 开门 / 关门 |
| L | 开灯 / 关灯 |
| F | 切换第一人称漫游 |
| G | 切换鸟瞰模式 |
| W/A/S/D | 第一人称移动 |
| 鼠标 | 旋转视角 |
| Esc | 退出第一人称 |
