<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { catMeta } from '../utils/categoryMeta'

const categories = ref([])
/** 展开的一级分类 ID 列表（el-collapse 用字符串 id） */
const expanded = ref([])

/** 一级分类列表（parentId 为 null） */
const parents = computed(() => categories.value.filter((c) => c.parentId === null))
/** 指定一级分类下的二级分类列表 */
const subsOf = (pid) => categories.value.filter((c) => c.parentId === pid)
/** 取分类展示样式：自定义分类自动落到兜底色板 */
const metaOf = (c) => catMeta(c.name)

/** 加载全部分类，并默认展开所有一级分类 */
async function load() {
  categories.value = await window.api.categories.list()
  // 默认全部展开，方便一眼看到所有分类
  expanded.value = parents.value.map((p) => String(p.id))
}

/** 弹出名称输入框（20 字以内）；用户取消时抛异常，由调用方静默处理 */
async function promptName(title, value = '') {
  const { value: name } = await ElMessageBox.prompt('请输入分类名称（20 字以内）', title, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputValue: value,
    inputValidator: (v) => (v && v.trim() ? true : '分类名称不能为空')
  })
  return name.trim()
}

/** 添加一级分类：弹输入框 → 调 IPC → 成功后刷新列表 */
async function addTop() {
  try {
    const name = await promptName('添加一级分类')
    const res = await window.api.categories.add({ name, parentId: null })
    if (!res.ok) return ElMessage.error(res.error)
    ElMessage.success(`已添加「${name}」`)
    load()
  } catch (e) { /* 用户取消 */ }
}

/** 在指定一级分类下添加二级分类 */
async function addSub(parent) {
  try {
    const name = await promptName(`在「${parent.name}」下添加二级分类`)
    const res = await window.api.categories.add({ name, parentId: parent.id })
    if (!res.ok) return ElMessage.error(res.error)
    ElMessage.success(`已在「${parent.name}」下添加「${name}」`)
    load()
  } catch (e) { /* 用户取消 */ }
}

/** 修改分类名称（仅自定义分类可改，预置分类按钮不显示） */
async function edit(cat) {
  try {
    const name = await promptName('修改分类名称', cat.name)
    const res = await window.api.categories.update(cat.id, name)
    if (!res.ok) return ElMessage.error(res.error)
    ElMessage.success(`已改名为「${name}」`)
    load()
  } catch (e) { /* 用户取消 */ }
}

/** 删除分类：二次确认后调 IPC；被记录引用的分类会被数据层拒绝 */
async function remove(cat) {
  const parent = cat.parentId === null ? null : parents.value.find((p) => p.id === cat.parentId)
  const label = parent ? `「${parent.name}」下的分类「${cat.name}」` : `分类「${cat.name}」`
  try {
    await ElMessageBox.confirm(`确定删除${label}吗？删除后不可恢复。`, '删除分类', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    const res = await window.api.categories.remove(cat.id)
    if (!res.ok) return ElMessage.error(res.error)
    ElMessage.success(`已删除「${cat.name}」`)
    load()
  } catch (e) { /* 取消或已在上面提示 */ }
}

/** 进入页面：加载分类列表 */
onMounted(load)
</script>

<template>
  <div>
    <!-- 分类管理标题与说明 -->
    <div class="card">
      <div class="cat-head">
        <div>
          <div class="card-title">分类管理<span class="card-sub">预置分类只读 · 自定义分类可增改删</span></div>
          <p class="cat-tip">💡 自定义分类无数量上限，建议控制在 20 个以内，避免录入时难以查找。已被记录使用的分类需先修改相关记录的分类后才能删除。</p>
        </div>
        <el-button type="primary" round @click="addTop">＋ 添加一级分类</el-button>
      </div>
    </div>

    <!-- 分类列表：一级分类手风琴展开，二级分类网格展示 -->
    <div class="cat-list">
      <el-collapse v-model="expanded">
        <el-collapse-item v-for="p in parents" :key="p.id" :name="String(p.id)">
          <template #title>
            <div class="cat-item-head">
              <span class="ico-round" :style="{ background: metaOf(p).bg }">{{ metaOf(p).emoji }}</span>
              <b class="cat-name">{{ p.name }}</b>
              <span v-if="p.isPreset" class="cat-tag preset" title="系统预置分类，不可修改或删除">🔒 预置</span>
              <span v-else class="cat-tag custom">自定义</span>
              <span class="cat-count">{{ subsOf(p.id).length }} 个二级分类</span>
              <span class="cat-actions">
                <el-button v-if="!p.isPreset" size="small" text @click.stop="edit(p)">✏️ 改名</el-button>
                <el-button v-if="!p.isPreset" size="small" text type="danger" @click.stop="remove(p)">🗑️ 删除</el-button>
              </span>
            </div>
          </template>

          <div class="sub-grid">
            <div v-for="s in subsOf(p.id)" :key="s.id" class="sub-item">
              <span class="ico-round sm" :style="{ background: metaOf(s).bg }">{{ metaOf(s).emoji }}</span>
              <span class="sub-name">{{ s.name }}</span>
              <span v-if="s.isPreset" class="cat-tag preset sm">预置</span>
              <span v-else class="cat-tag custom sm">自定义</span>
              <span class="sub-actions">
                <button v-if="!s.isPreset" class="mini-btn" title="改名" @click="edit(s)">✏️</button>
                <button v-if="!s.isPreset" class="mini-btn danger" title="删除" @click="remove(s)">🗑️</button>
              </span>
            </div>
            <div class="sub-add" @click="addSub(p)">＋ 添加二级分类</div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<style scoped>
.cat-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.cat-tip { font-size: 13px; color: var(--k-text3); margin: 0 0 4px; line-height: 1.6; }
.cat-list { margin-top: 16px; }
.cat-list :deep(.el-collapse) { border: none; border-radius: var(--k-radius); overflow: hidden; }
.cat-list :deep(.el-collapse-item__header) {
  background: var(--k-surface); border-bottom: 1px solid var(--k-divider);
  height: auto; padding: 10px 18px; line-height: 1.5;
}
.cat-list :deep(.el-collapse-item__wrap) { background: var(--k-surface); border-bottom: none; }
.cat-list :deep(.el-collapse-item__content) { padding: 12px 18px 18px; }
.cat-item-head { display: flex; align-items: center; gap: 10px; width: 100%; }
.cat-name { font-size: 15px; }
.cat-tag {
  font-size: 12px; padding: 2px 10px; border-radius: 999px; font-weight: 500;
}
.cat-tag.preset { background: #F0F1FA; color: var(--k-primary); }
.cat-tag.custom { background: #EFFAF6; color: var(--k-success-text); }
.cat-tag.sm { font-size: 11px; padding: 1px 8px; }
.cat-count { font-size: 12px; color: var(--k-text3); }
.cat-actions { margin-left: auto; }
.sub-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sub-item {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border: 1px solid var(--k-divider); border-radius: var(--k-radius-md);
  background: var(--k-bg-side);
}
.sub-name { font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ico-round.sm { width: 26px; height: 26px; font-size: 13px; }
.sub-actions { display: flex; gap: 2px; }
.sub-add {
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed var(--k-primary-light-5, #A6AED4); border-radius: var(--k-radius-md);
  color: var(--k-primary); font-size: 13px; cursor: pointer; padding: 10px;
  transition: all .18s; background: transparent;
}
.sub-add:hover { background: var(--k-primary-soft); border-style: solid; }
</style>
