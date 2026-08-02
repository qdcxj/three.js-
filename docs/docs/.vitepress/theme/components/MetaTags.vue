<script setup lang="ts">
// 整合标签组件：难度 + 频次 + 大厂，一次性显示
defineProps<{
  level: 'green' | 'yellow' | 'red'
  freq?: 1 | 2 | 3
  companies?: string[]
}>()
</script>

<template>
  <div class="meta-tags">
    <LevelTag :level="level" />
    <FreqTag v-if="freq" :level="freq" />
    <CompanyTag v-if="companies" :list="companies" />
  </div>
</template>

<style scoped>
.meta-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin: 12px 0 20px;
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 4px;
}
</style>
