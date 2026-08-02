<script setup lang="ts">
// 难度等级标签组件：🟢 入门 / 🟡 进阶 / 🔴 高级
defineProps<{
  level: 'green' | 'yellow' | 'red'
  text?: string
}>()
</script>

<template>
  <span :class="['level-tag', level]">
    <span class="dot">{{ level === 'green' ? '🟢' : level === 'yellow' ? '🟡' : '🔴' }}</span>
    <span class="label">{{ text || (level === 'green' ? '入门' : level === 'yellow' ? '进阶' : '高级') }}</span>
  </span>
</template>

<style scoped>
.level-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid;
  margin-right: 6px;
  margin-bottom: 4px;
}
.level-tag .dot { font-size: 11px; }
.level-tag.green {
  background: rgba(16, 185, 129, .12);
  color: #10b981;
  border-color: rgba(16, 185, 129, .3);
}
.level-tag.yellow {
  background: rgba(245, 158, 11, .12);
  color: #f59e0b;
  border-color: rgba(245, 158, 11, .3);
}
.level-tag.red {
  background: rgba(239, 68, 68, .12);
  color: #ef4444;
  border-color: rgba(239, 68, 68, .3);
}
.dark .level-tag.green { color: #34d399; }
.dark .level-tag.yellow { color: #fbbf24; }
.dark .level-tag.red { color: #f87171; }
</style>
