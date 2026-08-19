<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store } from '../store'
import { catMeta } from '../utils/categoryMeta'
import ChartBox from '../components/ChartBox.vue'

const stats = ref({ expense: 0, income: 0, count: 0, byCategory: [] })
const trend = ref([])

/** 并行加载本月统计与近 6 个月趋势 */
async function load() {
  try {
    const [s, t] = await Promise.all([
      window.api.records.stats(store.month),
      window.api.records.trend(6)
    ])
    stats.value = s
    trend.value = t
  } catch (e) {
    ElMessage.error('加载失败：' + e.message)
  }
}
onMounted(load)

/** 金额格式化为 ¥1,234.56 */
const fmt = (n) => '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 排行条的最大基准值（取最大分类金额，至少为 1 避免除零） */
const maxTotal = computed(() => Math.max(...stats.value.byCategory.map((c) => c.amount), 1))

/** 环形图配置：本月支出构成 */
const donutOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}：¥{c}（{d}%）' },
  title: {
    text: fmt(stats.value.expense),
    subtext: '总支出',
    left: 'center',
    top: '35%',
    textStyle: { fontFamily: 'DIN Alternate', fontSize: 20, fontWeight: 700, color: '#333333' },
    subtextStyle: { color: '#8A8A8A', fontSize: 12 }
  },
  series: [{
    type: 'pie',
    radius: ['56%', '78%'],
    itemStyle: { borderColor: '#FFFFFF', borderWidth: 4, borderRadius: 6 },
    label: { show: false },
    data: stats.value.byCategory.map((c) => ({
      name: c.name,
      // 四舍五入到分，消除 SQLite 浮点求和可能产生的长尾小数
      value: Math.round(c.amount * 100) / 100,
      itemStyle: { color: catMeta(c.name).color }
    }))
  }]
}))

/** 近 6 个月中支出最高的月份下标（用于柱子高亮） */
const maxIdx = computed(() =>
  trend.value.reduce((mi, t, i) => (t.expense > (trend.value[mi]?.expense ?? 0) ? i : mi), 0)
)
/** 柱状图配置：近 6 个月支出趋势 */
const barOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => '¥' + Number(v).toLocaleString('zh-CN') },
  grid: { left: 8, right: 8, top: 26, bottom: 8, containLabel: true },
  xAxis: {
    type: 'category',
    data: trend.value.map((t) => t.label),
    axisLine: { lineStyle: { color: '#EDE7D8' } },
    axisTick: { show: false },
    axisLabel: { color: '#8A8A8A' }
  },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F1EBDE' } }, axisLabel: { color: '#8A8A8A' } },
  series: [{
    type: 'bar',
    barWidth: 28,
    label: { show: true, position: 'top', formatter: (p) => '¥' + Number(p.value).toLocaleString('zh-CN'), color: '#666666', fontSize: 11 },
    data: trend.value.map((t, i) => ({
      value: t.expense,
      itemStyle: { color: i === maxIdx.value ? '#F2C14E' : '#4A5AA8', borderRadius: [8, 8, 2, 2] }
    }))
  }]
}))
</script>

<template>
  <div>
    <!-- 图表区：支出构成环形图 + 月度趋势柱状图 -->
    <div class="two-col">
      <div class="card">
        <div class="card-title">支出构成<span class="card-sub">{{ store.month }}</span></div>
        <ChartBox :option="donutOption" />
      </div>
      <div class="card">
        <div class="card-title">月度趋势<span class="card-sub">近 6 个月</span></div>
        <ChartBox :option="barOption" />
      </div>
    </div>

    <!-- 分类排行：本月各一级分类支出占比与进度条 -->
    <div class="card">
      <div class="card-title">分类排行<span class="card-sub">本月支出 Top</span></div>
      <div v-if="stats.byCategory.length === 0" style="color:var(--k-text3);padding:16px 0">本月还没有支出记录</div>
      <div v-for="c in stats.byCategory" :key="c.categoryId" class="rank-row">
        <span class="ico-round" :style="{ background: catMeta(c.name).bg }">{{ catMeta(c.name).emoji }}</span>
        <span class="name">{{ c.name }}</span>
        <div class="track"><i :style="{ width: (c.amount / maxTotal * 100) + '%', background: catMeta(c.name).color }"></i></div>
        <span class="amt">{{ fmt(c.amount) }}</span>
        <span class="pct">{{ stats.expense > 0 ? (c.amount / stats.expense * 100).toFixed(1) : 0 }}%</span>
      </div>
    </div>
  </div>
</template>
