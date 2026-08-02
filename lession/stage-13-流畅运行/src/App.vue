<script setup>
// 引入核心 3D 场景组件
import HouseScene from "./components/HouseScene.vue";
</script>

<template>
  <HouseScene />
</template>

<style>
/* 全局样式：清除默认边距，让 3D 画布占满整个视口 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1f1f1f;
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei",
    sans-serif;
}
</style>
