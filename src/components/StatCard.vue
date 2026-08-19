<script setup>
/** 统计卡片：展示单个指标（图标、数值、说明文字），纯展示组件无逻辑 */
defineProps({
  label: String,
  icon: String,
  bg: String,
  value: [String, Number],
  color: String,
  delta: String
})
</script>

<template>
  <div class="stat">
    <div class="label">
      <span class="ico-round" :style="{ background: bg }">{{ icon }}</span>{{ label }}
    </div>
    <div class="value" :style="{ color }">{{ value }}</div>
    <div class="delta">{{ delta }}</div>
  </div>
</template>
