<script setup lang="ts">
// 面试频次标签：⭐⭐⭐ 必考 / ⭐⭐ 常考 / ⭐ 偶尔
defineProps<{
  level: 1 | 2 | 3
}>()

const map = {
  3: { label: '必考', icon: '⭐⭐⭐' },
  2: { label: '常考', icon: '⭐⭐' },
  1: { label: '偶尔', icon: '⭐' }
} as const
</script>

<template>
  <span :class="['freq-tag', `freq-${level}`]">
    <span class="icon">{{ map[level].icon }}</span>
    <span class="label">{{ map[level].label }}</span>
  </span>
</template>

<style scoped>
.freq-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid;
  margin-right: 6px;
  margin-bottom: 4px;
}
.freq-tag.freq-3 {
  background: rgba(239, 68, 68, .1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, .3);
}
.freq-tag.freq-2 {
  background: rgba(245, 158, 11, .1);
  color: #f59e0b;
  border-color: rgba(245, 158, 11, .3);
}
.freq-tag.freq-1 {
  background: rgba(107, 114, 128, .1);
  color: #6b7280;
  border-color: rgba(107, 114, 128, .3);
}
</style>
