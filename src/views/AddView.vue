<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { go, store } from '../store'
import CategoryPicker from '../components/CategoryPicker.vue'

/** 收入分组名称：支出分类列表要排除它，收入来源只认它下面的二级分类 */
const INCOME_GROUP = '收入'
/** 全部分类（一级+二级），加载后按用途拆分 */
const categories = ref([])
/** 编辑模式下要更新的记录 ID；新增时为 null */
const editingId = ref(null)
/** 表单数据：类型/金额/分类/日期/备注 */
const form = reactive({
  type: 'expense',
  amount: '',
  categoryId: null,
  date: today(),
  note: ''
})

/** 支出可选分类：剔除“收入”分组及其子分类，避免收入来源混进支出选择 */
const expenseCategories = computed(() => {
  const income = categories.value.find((c) => c.parentId === null && c.name === INCOME_GROUP)
  return income ? categories.value.filter((c) => c.parentId !== income.id && c.id !== income.id) : categories.value
})
/** 收入来源列表：“收入”分组下的所有二级分类（工资/奖金/…） */
const incomeSources = computed(() => {
  const income = categories.value.find((c) => c.parentId === null && c.name === INCOME_GROUP)
  return income ? categories.value.filter((c) => c.parentId === income.id) : []
})

/** 今天的日期（YYYY-MM-DD），作为默认记账日期 */
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 进入页面：加载分类；若是编辑模式则把待编辑记录回填到表单 */
onMounted(async () => {
  categories.value = await window.api.categories.list()
  if (store.recordToEdit) {
    const r = store.recordToEdit
    editingId.value = r.id
    form.type = r.type
    form.amount = String(r.amount)
    form.categoryId = r.categoryId
    form.date = r.date
    form.note = r.note
  }
})

/** 切换收支类型：收入自动选中第一个来源；支出清空分类让用户重选 */
function switchType(t) {
  form.type = t
  form.categoryId = t === 'income' ? (incomeSources.value[0]?.id ?? null) : null
}

/** 金额校验：必须是大于 0 且不超过 99999999 的有限数字（界面层第一道防线） */
function validAmount() {
  const v = Number(form.amount)
  return Number.isFinite(v) && v > 0 && v <= 99999999
}

/** 保存：校验 → 调用 IPC 新增/更新 → 成功后回明细页 */
async function save() {
  if (!validAmount()) return ElMessage.warning('请输入正确的金额（大于 0）')
  if (!form.categoryId) return ElMessage.warning(form.type === 'income' ? '请选择收入来源' : '请选择分类')
  if (!form.date) return ElMessage.warning('请选择日期')

  // 金额统一保留两位小数，避免浮点误差（如 0.1+0.2 的问题）进入数据库
  const payload = {
    type: form.type,
    amount: Number(Number(form.amount).toFixed(2)),
    categoryId: form.categoryId,
    date: form.date,
    note: form.note.trim()
  }
  try {
    // 有 editingId 走更新，否则走新增；成功后清空表单并跳回明细页
    if (editingId.value) {
      await window.api.records.update(editingId.value, payload)
      ElMessage.success('记录已更新')
    } else {
      await window.api.records.add(payload)
      ElMessage.success('已记一笔 ✔')
    }
    reset()
    go('list')
  } catch (e) {
    ElMessage.error('保存失败：' + e.message)
  }
}

/** 重置表单为“新增支出”的初始状态 */
function reset() {
  editingId.value = null
  store.recordToEdit = null
  form.type = 'expense'
  form.amount = ''
  form.categoryId = null
  form.date = today()
  form.note = ''
}
/** 取消编辑：重置表单并返回仪表盘 */
function cancel() { reset(); go('dashboard') }
</script>

<template>
  <div class="card" style="max-width: 820px">
    <!-- 标题：编辑模式与新增模式显示不同文案 -->
    <div class="card-title">{{ editingId ? '编辑记录' : '记一笔' }}<span class="card-sub">金额 · 分类 · 备注</span></div>

    <!-- 收支切换：决定下方是分类选择还是收入来源选择 -->
    <div class="type-switch">
      <button class="type-btn expense" :class="{ active: form.type === 'expense' }" @click="switchType('expense')">支出</button>
      <button class="type-btn income" :class="{ active: form.type === 'income' }" @click="switchType('income')">收入</button>
    </div>

    <!-- 金额输入：整数/小数均可，回车直接保存 -->
    <div class="amount-box">
      <span class="yen">¥</span>
      <input v-model="form.amount" inputmode="decimal" placeholder="0.00" @keyup.enter="save" />
    </div>

    <!-- 支出：一级分类 + 二级分类联动选择 -->
    <template v-if="form.type === 'expense'">
      <div class="field-label">一级分类</div>
      <CategoryPicker v-model="form.categoryId" :categories="expenseCategories" />
    </template>
    <!-- 收入：直接选收入来源（工资/奖金/…） -->
    <template v-else>
      <div class="field-label">收入来源</div>
      <div class="pill-row">
        <button
          v-for="s in incomeSources"
          :key="s.id"
          class="pill"
          :class="{ selected: form.categoryId === s.id }"
          @click="form.categoryId = s.id"
        >{{ s.name }}</button>
      </div>
    </template>

    <!-- 日期：默认今天，可按需修改 -->
    <div class="field-label">日期（默认今天）</div>
    <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />

    <!-- 备注：最多 100 字，仅作备忘 -->
    <div class="field-label">备注（选填）</div>
    <el-input v-model="form.note" type="textarea" :rows="2" maxlength="100" show-word-limit placeholder="例如：和同事聚餐…" />

    <!-- 操作按钮：保存 / 取消 -->
    <div class="action-row">
      <el-button type="primary" round size="large" @click="save" style="padding: 0 36px">{{ editingId ? '保存修改' : '保存' }}</el-button>
      <el-button round size="large" @click="cancel">取消</el-button>
    </div>
  </div>
</template>
