import Teek from "vitepress-theme-teek";
import TeekLayoutProvider from "./components/TeekLayoutProvider.vue";

// 自定义全局组件
import LevelTag from "./components/LevelTag.vue";
import FreqTag from "./components/FreqTag.vue";
import CompanyTag from "./components/CompanyTag.vue";
import MetaTags from "./components/MetaTags.vue";

// Teek 在线主题包引用
import "vitepress-theme-teek/index.css";
import "vitepress-theme-teek/theme-chalk/tk-code-block-mobile.css";
import "vitepress-theme-teek/theme-chalk/tk-sidebar.css";
import "vitepress-theme-teek/theme-chalk/tk-nav.css";
import "vitepress-theme-teek/theme-chalk/tk-aside.css";
import "vitepress-theme-teek/theme-chalk/tk-doc-h1-gradient.css";
import "vitepress-theme-teek/theme-chalk/tk-table.css";
import "vitepress-theme-teek/theme-chalk/tk-mark.css";
import "vitepress-theme-teek/theme-chalk/tk-blockquote.css";
import "vitepress-theme-teek/theme-chalk/tk-index-rainbow.css";
import "vitepress-theme-teek/theme-chalk/tk-banner-desc-gradient.css";
import "vitepress-theme-teek/theme-chalk/tk-home-card-hover.css";
import "vitepress-theme-teek/theme-chalk/tk-fade-up-animation.css";

import "./styles/code-bg.scss";
import "./styles/iframe.scss";
import "./styles/sidebar.scss";

export default {
  extends: Teek,
  Layout: TeekLayoutProvider,
  enhanceApp({ app }: any) {
    // 注册全局组件：在 markdown 中直接用 <LevelTag> <MetaTags> 等
    app.component("LevelTag", LevelTag);
    app.component("FreqTag", FreqTag);
    app.component("CompanyTag", CompanyTag);
    app.component("MetaTags", MetaTags);
  },
};
