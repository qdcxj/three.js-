# 阶段 11 · 氛围营造

> 第 11 阶段的项目驱动教程源码快照：在 stage-10 的基础上加入后期处理（Bloom 辉光 + 景深 + 色调映射），让室内灯光、玻璃高光真正"发光"，让画面从"工程渲染"升级为"氛围画面"。

## 运行

```bash
pnpm install
pnpm dev      # 开发模式
pnpm build    # 生产构建
pnpm preview  # 预览构建产物
```

## 操作

- **鼠标拖拽**：旋转视角（OrbitControls）
- **滚轮**：缩放（4 ~ 40 米范围）
- **O 键**：开门 / 关门（继承自 stage-08）
- **L 键**：开灯 / 关灯（开灯后室内点光源、壁灯被 Bloom 点亮，效果最明显）
- **B 键**：开关 Bloom 辉光（对比效果）
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
- stage-09：家具 GLTF（本快照简化，使用程序化家具占位以避免外部资源依赖）
- stage-10：玻璃着色器（Fresnel 边缘高光）+ 草地着色器（时间驱动波动）
- stage-11：**EffectComposer 后期管线 = RenderPass → UnrealBloomPass → BokehPass → OutputPass**，ACESFilmic 色调映射

## 关键文件

- `src/components/HouseScene.vue` —— 主场景组件，可直接复制粘贴运行
