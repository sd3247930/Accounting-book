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
/** 自定义日期范围（起止两个 YYYY-MM-DD） */
const customRange = ref(null)

/** 今天的日期字符串（YYYY-MM-DD） */
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 把“今天/本周/本月/自定义”等快捷选项换算成查询用的起止日期 */
function rangeToDates() {
  const now = new Date()
  if (filters.range === 'today') { const t = todayStr(); return { startDate: t, endDate: t } }
  if (filters.range === 'week') {
    // 本周按“周一为一周起点”计算：把星期天(0)换算成 6，周一(1)换算成 0
    const day = (now.getDay() + 6) % 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - day)
    const s = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    return { startDate: s, endDate: todayStr() }
  }
  if (filters.range === 'month') {
    // 本月即当月 1 号到今天
    const s = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return { startDate: s, endDate: todayStr() }
  }
  if (filters.range === 'custom' && customRange.value && customRange.value.length === 2) {
    return { startDate: customRange.value[0], endDate: customRange.value[1] }
  }
  return {}
}

/** 一级分类列表（用于筛选下拉） */
const parents = computed(() => categories.value.filter((c) => c.parentId === null))
/** 当前选中一级分类下的二级分类（联动下拉用） */
const subs = computed(() => categories.value.filter((c) => c.parentId === filters.parentId))

/** 按当前筛选条件分页查询记录，结果写入 data */
async function load() {
  loading.value = true
  try {
    const q = {
      ...rangeToDates(),
      type: filters.type,
      // 选了二级分类就用二级，否则退回一级（一级会自动包含其所有二级）
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

/** 筛选条件变化时回到第一页并重新查询 */
watch(() => [filters.type, filters.parentId, filters.childId, filters.range, filters.keyword], () => {
  filters.page = 1
  load()
})
/** 自定义日期范围变化时重新查询 */
watch(customRange, () => { if (filters.range === 'custom') { filters.page = 1; load() } })
/** 顶部全局搜索词变化时同步到本页筛选并查询 */
watch(() => store.searchKeyword, (v) => {
  filters.keyword = v
  filters.page = 1
  load()
})

/** 进入页面：先加载分类（筛选下拉用），再加载首屏记录 */
onMounted(async () => {
  categories.value = await window.api.categories.list()
  load()
})

/** 删除记录：弹窗二次确认后调用 IPC，成功后刷新列表 */
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

/** 金额格式化为 ¥1,234.56 千分位样式 */
const fmt = (n) => '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 支出显示负号、收入显示正号 */
function sign(r) { return r.type === 'expense' ? '-' : '+' }
</script>

<template>
  <div class="card">
    <!-- 标题：当前筛选条件下的记录总数 -->
    <div class="card-title">明细<span class="card-sub">{{ data.total }} 笔记录</span></div>

    <!-- 筛选栏：类型 / 一级分类 / 二级分类 / 日期范围 / 关键词 -->
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

    <!-- 记录列表：空态提示 + 每条记录的分类图标、金额与操作 -->
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

    <!-- 分页：记录数超过一页时才显示 -->
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
