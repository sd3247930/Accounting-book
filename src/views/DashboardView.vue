<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store } from '../store'
import { catMeta } from '../utils/categoryMeta'
import StatCard from '../components/StatCard.vue'
import ChartBox from '../components/ChartBox.vue'

const stats = ref({ expense: 0, income: 0, count: 0, byCategory: [] })
const trend = ref([])
const recent = ref([])

async function load() {
  try {
    const [s, t, r] = await Promise.all([
      window.api.records.stats(store.month),
      window.api.records.trend(6),
      window.api.records.recent(6)
    ])
    stats.value = s
    trend.value = t
    recent.value = r
  } catch (e) {
    ElMessage.error('加载数据失败：' + e.message)
  }
}
onMounted(load)

const fmt = (n) => '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const avg = computed(() => {
  const d = new Date()
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return (stats.value.expense / days).toFixed(1)
})

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
    center: ['50%', '50%'],
    itemStyle: { borderColor: '#FFFFFF', borderWidth: 4, borderRadius: 6 },
    label: { show: false },
    emphasis: { label: { show: false } },
    data: stats.value.byCategory.map((c) => ({
      name: c.name,
      value: Math.round(c.amount * 100) / 100,
      itemStyle: { color: catMeta(c.name).color }
    }))
  }]
}))

const maxIdx = computed(() =>
  trend.value.reduce((mi, t, i) => (t.expense > (trend.value[mi]?.expense ?? 0) ? i : mi), 0)
)
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
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#F1EBDE' } },
    axisLabel: { color: '#8A8A8A' }
  },
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

function sign(r) { return r.type === 'expense' ? '-' : '+' }
</script>

<template>
  <div>
    <div class="stat-grid">
      <StatCard label="本月总支出" icon="🍱" bg="#FADFDC" :value="fmt(stats.expense)" color="var(--k-danger-text)" delta="红 = 支出" />
      <StatCard label="本月总收入" icon="💰" bg="#DBF2EB" :value="fmt(stats.income)" color="var(--k-success-text)" delta="绿 = 收入" />
      <StatCard label="本月笔数" icon="🧾" bg="#E8EBF6" :value="stats.count + ' 笔'" delta="自动统计" />
      <StatCard label="日均支出" icon="🌤️" bg="#FAF2D9" :value="'¥' + avg" delta="按当月天数计算" />
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-title">分类占比<span class="card-sub">{{ store.month }} 支出构成</span></div>
        <ChartBox :option="donutOption" />
      </div>
      <div class="card">
        <div class="card-title">月度趋势<span class="card-sub">近 6 个月支出</span></div>
        <ChartBox :option="barOption" />
      </div>
    </div>

    <div class="card">
      <div class="card-title">最近记录</div>
      <div v-if="recent.length === 0" style="color:var(--k-text3);padding:16px 0">还没有记录，点「记一笔」开始吧～</div>
      <div v-for="r in recent" :key="r.id" class="row">
        <span class="ico-round" :style="{ background: catMeta(r.parentName).bg }">{{ catMeta(r.parentName).emoji }}</span>
        <div class="mid"><b>{{ r.parentName }} · {{ r.categoryName }}</b><span>{{ r.note || '无备注' }}</span></div>
        <div class="right">
          <div class="amt" :class="r.type === 'expense' ? 'expense' : 'income'">{{ sign(r) }}{{ fmt(r.amount) }}</div>
          <div class="date">{{ r.date }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
