<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { go, store } from '../store'
import CategoryPicker from '../components/CategoryPicker.vue'

const categories = ref([])
const editingId = ref(null)
const form = reactive({
  type: 'expense',
  amount: '',
  categoryId: null,
  date: today(),
  note: ''
})

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

function validAmount() {
  const v = Number(form.amount)
  return Number.isFinite(v) && v > 0 && v <= 99999999
}

async function save() {
  if (!validAmount()) return ElMessage.warning('请输入正确的金额（大于 0）')
  if (!form.categoryId) return ElMessage.warning('请选择分类')
  if (!form.date) return ElMessage.warning('请选择日期')

  const payload = {
    type: form.type,
    amount: Number(Number(form.amount).toFixed(2)),
    categoryId: form.categoryId,
    date: form.date,
    note: form.note.trim()
  }
  try {
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

function reset() {
  editingId.value = null
  store.recordToEdit = null
  form.type = 'expense'
  form.amount = ''
  form.categoryId = null
  form.date = today()
  form.note = ''
}
function cancel() { reset(); go('dashboard') }
</script>

<template>
  <div class="card" style="max-width: 820px">
    <div class="card-title">{{ editingId ? '编辑记录' : '记一笔' }}<span class="card-sub">金额 · 分类 · 备注</span></div>

    <div class="type-switch">
      <button class="type-btn expense" :class="{ active: form.type === 'expense' }" @click="form.type = 'expense'">支出</button>
      <button class="type-btn income" :class="{ active: form.type === 'income' }" @click="form.type = 'income'">收入</button>
    </div>

    <div class="amount-box">
      <span class="yen">¥</span>
      <input v-model="form.amount" inputmode="decimal" placeholder="0.00" @keyup.enter="save" />
    </div>

    <div class="field-label">一级分类</div>
    <CategoryPicker v-model="form.categoryId" :categories="categories" />

    <div class="field-label">日期（默认今天）</div>
    <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />

    <div class="field-label">备注（选填）</div>
    <el-input v-model="form.note" type="textarea" :rows="2" maxlength="100" show-word-limit placeholder="例如：和同事聚餐…" />

    <div class="action-row">
      <el-button type="primary" round size="large" @click="save" style="padding: 0 36px">{{ editingId ? '保存修改' : '保存' }}</el-button>
      <el-button round size="large" @click="cancel">取消</el-button>
    </div>
  </div>
</template>
