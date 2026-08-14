<script setup>
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
