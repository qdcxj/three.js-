import { defineConfig } from "vitepress";
import { teekConfig } from "./teekConfig";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ===== 自动生成数组形式侧边栏（所有章节共享，全部展开）=====
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, "..");

// 读取 md 文件 frontmatter 中的 title
function readTitle(filePath: string, fallback: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const m = content.match(/^title:\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  } catch {
    // ignore
  }
  return fallback;
}

// 扫描 docs 目录下所有「数字.」开头的章节目录，生成扁平分组的全局 sidebar
function buildSidebar() {
  const chapters = fs
    .readdirSync(docsDir)
    .filter((n) => /^\d+\./.test(n) && fs.statSync(path.join(docsDir, n)).isDirectory())
    .sort();

  return chapters.map((chapter) => {
    const dir = path.join(docsDir, chapter);
    const files = fs.readdirSync(dir).filter((n) => n.endsWith(".md")).sort();
    const items = files.map((file) => {
      const fp = path.join(dir, file);
      const base = file.replace(/\.md$/, "");
      const fallback = base === "index" ? "章节首页" : base.replace(/^\d+\./, "");
      const text = readTitle(fp, fallback);
      const link = base === "index" ? `/${chapter}/` : `/${chapter}/${base}`;
      return { text, link };
    });
    const chapterTitle = readTitle(path.join(dir, "index.md"), chapter.replace(/^\d+\./, ""));
    return { text: chapterTitle, collapsed: false, items };
  });
}

const description = [
  "Three.js 完全指南 · 建造一栋欧式乡村小屋 · 14 个实战阶段",
  "项目启动 / 地基 / 墙体 / 屋顶 / 贴图 / 灯光 / 相机 / 动画 / 家具 / 着色器 / 后期 / 粒子 / 性能 / 完工",
  "项目驱动学习 · 每阶段一份可运行源码快照 · 由 vitepress-theme-teek 驱动",
  "覆盖 90% Three.js 开发知识点 · 从空地到完整小屋",
].toString();

export default defineConfig({
  extends: teekConfig,
  // 部署到 GitHub Pages 项目站点 (https://qdcxj.github.io/three.js-/) 时通过 BASE 注入前缀，本地开发保持 "/"
  base: process.env.BASE || "/",
  title: "Three.js 指南",
  description: description,
  cleanUrls: false,
  lastUpdated: true,
  lang: "zh-CN",
  head: [
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:locale", content: "zh-CN" }],
    ["meta", { property: "og:title", content: "Three.js 指南" }],
    ["meta", { property: "og:site_name", content: "Three.js 指南" }],
    ["meta", { name: "description", description }],
    ["meta", { name: "keywords", content: "Three.js,WebGL,3D,JavaScript,着色器,GLSL,3D渲染,Web3D" }],
    ["meta", { name: "author", content: "Mavis" }],
  ],
  markdown: {
    lineNumbers: true,
    image: { lazyLoading: true },
    container: {
      tipLabel: "提示",
      warningLabel: "警告",
      dangerLabel: "危险",
      infoLabel: "信息",
      detailsLabel: "详细信息",
    },
  },
  themeConfig: {
    logo: "/logo.svg",
    darkModeSwitchLabel: "主题",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "返回顶部",
    lastUpdatedText: "上次更新时间",
    outline: { level: [2, 4], label: "页面导航" },
    docFooter: { prev: "上一页", next: "下一页" },
    nav: [
      { text: "首页", link: "/" },
      { text: "Three.js 教程", link: "/01.项目启动/", activeMatch: "/0[1-9]\\.|/1[0-4]\\./" },
      { text: "案例", link: "/15.案例/" },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/" },
    ],
    sidebar: buildSidebar(),
    search: {
      provider: "local",
    },
  },
});
