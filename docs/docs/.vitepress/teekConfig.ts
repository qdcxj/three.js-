import { defineTeekConfig } from "vitepress-theme-teek/config";
import { version } from "vitepress-theme-teek/es/version";

export const teekConfig = defineTeekConfig({
  teekHome: false,
  vpHome: true,
  sidebarTrigger: true,
  author: { name: "Mavis", link: "https://github.com/" },
  banner: {
    enabled: true,
    title: "📚 Three.js 完全指南",
    description: "15 大模块 · 从基础概念到着色器/粒子/后期处理/性能优化/项目实战，覆盖 Three.js 完整知识体系，每节配代码示例。",
    tip: "🎉 持续更新中 · 关注 GitHub 获取最新内容",
    btns: [
      { text: "开始学习", link: "/01.基础概念/", icon: "📖" },
      { text: "GitHub", link: "https://github.com/", icon: "⭐" },
    ],
  },
  footerInfo: {
    theme: { name: `Theme By Teek@${version}` },
    copyright: { createYear: 2026, suffix: "Mavis" },
  },
  codeBlock: {
    copiedDone: (TkMessage: any) => TkMessage.success("复制成功！"),
  },
  articleShare: { enabled: true },
  vitePlugins: {
    // 关闭自动生成插件：它生成按路径匹配的对象形式 sidebar，
    // 会导致每个章节只显示自己的侧边栏。改为在 config.ts 用 fs 生成数组形式全局 sidebar。
    sidebar: false,
  },
});
