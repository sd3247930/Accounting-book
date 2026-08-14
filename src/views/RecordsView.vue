<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { editRecord, store } from '../store'
import { catMeta } from '../utils/categoryMeta'

const categories = ref([])
const filters = reactive({
  type: 'all',
  parentId: '',
  childId: '',
  range: 'month',
  keyword: '',
  page: 1,
  pageSize: 50
})
const data = ref({ total: 0, rows: [] })
const loading = ref(false)
const customRange = ref(null)

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rangeToDates() {
  const now = new Date()
  if (filters.range === 'today') { const t = todayStr(); return { startDate: t, endDate: t } }
  if (filters.range === 'week') {
    const day = (now.getDay() + 6) % 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - day)
    const s = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    return { startDate: s, endDate: todayStr() }
  }
  if (filters.range === 'month') {
    const s = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return { startDate: s, endDate: todayStr() }
  }
  if (filters.range === 'custom' && customRange.value && customRange.value.length === 2) {
    return { startDate: customRange.value[0], endDate: customRange.value[1] }
  }
  return {}
}

const parents = computed(() => categories.value.filter((c) => c.parentId === null))
const subs = computed(() => categories.value.filter((c) => c.parentId === filters.parentId))

async function load() {
  loading.value = true
  try {
    const q = {
      ...rangeToDates(),
      type: filters.type,
      catId: filters.childId || filters.parentId || undefined,
      keyword: filters.keyword.trim() || undefined,
      page: filters.page,
      pageSize: filters.pageSize
    }
    data.value = await window.api.records.list(q)
  } catch (e) {
    ElMessage.error('加载失败：' + e.message)
  } finally {
    loading.value = false
  }
}

watch(() => [filters.type, filters.parentId, filters.childId, filters.range, filters.keyword], () => {
  filters.page = 1
  load()
})
watch(customRange, () => { if (filters.range === 'custom') { filters.page = 1; load() } })
watch(() => store.searchKeyword, (v) => {
  filters.keyword = v
  filters.page = 1
  load()
})

onMounted(async () => {
  categories.value = await window.api.categories.list()
  load()
})

async function removeRow(r) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${r.parentName} · ${r.categoryName} ¥${r.amount.toFixed(2)}」这条记录吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await window.api.records.remove(r.id)
    ElMessage.success('已删除')
    load()
  } catch (e) { /* 用户取消 */ }
}

const fmt = (n) => '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function sign(r) { return r.type === 'expense' ? '-' : '+' }
</script>

<template>
  <div class="card">
    <div class="card-title">明细<span class="card-sub">{{ data.total }} 笔记录</span></div>

    <div class="filter-bar">
      <el-select v-model="filters.type" style="width: 110px">
        <el-option label="全部类型" value="all" />
        <el-option label="支出" value="expense" />
        <el-option label="收入" value="income" />
      </el-select>
      <el-select v-model="filters.parentId" style="width: 135px" @change="filters.childId = ''">
        <el-option label="全部一级分类" value="" />
        <el-option v-for="p in parents" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-select v-model="filters.childId" style="width: 135px" :disabled="!filters.parentId">
        <el-option label="全部二级分类" value="" />
        <el-option v-for="s in subs" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-select v-model="filters.range" style="width: 120px">
        <el-option label="本月" value="month" />
        <el-option label="今天" value="today" />
        <el-option label="本周" value="week" />
        <el-option label="全部日期" value="all" />
        <el-option label="自定义" value="custom" />
      </el-select>
      <el-date-picker
        v-if="filters.range === 'custom'"
        v-model="customRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 250px"
      />
      <div class="search"><span>🔍</span><input v-model="filters.keyword" placeholder="搜索备注…" @keyup.enter="load" /></div>
    </div>

    <div v-loading="loading">
      <div v-if="data.rows.length === 0" style="color:var(--k-text3);padding:24px 0;text-align:center">没有符合条件的记录</div>
      <div v-for="r in data.rows" :key="r.id" class="row">
        <span class="ico-round" :style="{ background: catMeta(r.parentName).bg }">{{ catMeta(r.parentName).emoji }}</span>
        <div class="mid">
          <b>
            <span v-if="r.type === 'income'" class="income-badge">收入</span>
            {{ r.type === 'income' ? r.categoryName : r.parentName + ' · ' + r.categoryName }}
          </b>
          <span>{{ r.note || '无备注' }}</span>
        </div>
        <div class="right">
          <div class="amt" :class="r.type === 'expense' ? 'expense' : 'income'">{{ sign(r) }}{{ fmt(r.amount) }}</div>
          <div class="date">{{ r.date }}</div>
        </div>
        <div class="row-actions">
          <button class="mini-btn" @click="editRecord(r)">编辑</button>
          <button class="mini-btn danger" @click="removeRow(r)">删除</button>
        </div>
      </div>
    </div>

    <el-pagination
      v-if="data.total > filters.pageSize"
      background
      layout="total, prev, pager, next"
      :total="data.total"
      :page-size="filters.pageSize"
      :current-page="filters.page"
      @current-change="(p) => { filters.page = p; load() }"
    />
  </div>
</template>

<style scoped>
.income-badge {
  display: inline-block; margin-right: 6px; padding: 1px 8px;
  border-radius: 999px; font-size: 11px; font-weight: 600;
  background: #EFFAF6; color: var(--k-success-text); vertical-align: 1px;
}
</style>
