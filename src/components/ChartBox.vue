<script setup>
/**
 * ECharts 通用容器：挂载时初始化，option 变化时自动刷新
 */
import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  option: { type: Object, required: true }
})

const el = ref(null)
let chart = null

onMounted(() => {
  chart = echarts.init(el.value)
  chart.setOption(props.option)
})

watch(() => props.option, (opt) => {
  if (chart) chart.setOption(opt, true)
}, { deep: true })

onBeforeUnmount(() => {
  if (chart) { chart.dispose(); chart = null }
})
</script>

<template>
  <div ref="el" class="chart"></div>
</template>
