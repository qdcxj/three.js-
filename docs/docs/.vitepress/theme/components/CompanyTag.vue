<script setup lang="ts">
// 大厂面试题标签：阿里 / 字节 / 腾讯 / 美团 / 百度 / 京东 / 滴滴 / 快手
defineProps<{
  list: string[]
}>()

const COLORS: Record<string, string> = {
  '阿里': '#ff6a00',
  '字节': '#3370ff',
  '腾讯': '#0052d9',
  '美团': '#ffc300',
  '百度': '#2932e1',
  '京东': '#e1251b',
  '滴滴': '#ff7e00',
  '快手': '#ff4906',
  '拼多多': '#e02e24',
  '小米': '#ff6900',
  '蚂蚁': '#1677ff',
  '小红书': '#ff2442',
  'Shopee': '#ee1133',
  'B站': '#fb7299',
  '网易': '#c20c0c'
}
</script>

<template>
  <span v-for="c in list" :key="c" :style="{
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'white',
    background: COLORS[c] || '#666',
    marginRight: '4px',
    marginBottom: '4px'
  }">{{ c }}</span>
</template>
