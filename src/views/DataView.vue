<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const dbPath = ref('')

/** 导出数据：CSV 或 JSON，由主进程弹保存对话框，取消则静默返回 */
async function doExport(kind) {
  try {
    const res = kind === 'csv'
      ? await window.api.data.exportCSV({})
      : await window.api.data.exportJSON({})
    if (res.canceled) return
    ElMessage.success(`已导出 ${res.count} 条记录 → ${res.filePath}`)
  } catch (e) {
    ElMessage.error('导出失败：' + e.message)
  }
}

/** 打开数据库所在文件夹（方便用户手动备份） */
async function openFolder() {
  await window.api.data.openFolder()
}

/** 清空全部记录：二次确认后调用 IPC；区分“用户取消”与真实错误 */
async function clearAll() {
  try {
    await ElMessageBox.confirm(
      '确定清空全部记录吗？此操作不可恢复，建议先导出备份。',
      '危险操作',
      { type: 'error', confirmButtonText: '清空', cancelButtonText: '取消' }
    )
    const n = await window.api.data.clearAll()
    ElMessage.success(`已清空 ${n} 条记录`)
  } catch (e) {
    // Element Plus 弹窗取消时 reject 的值为 'cancel'；其余为真实错误，需要提示
    if (e === 'cancel' || (e && e.message === 'cancel')) return
    ElMessage.error('清空失败：' + (e && e.message ? e.message : e))
  }
}

/** 进入页面：读取并展示本地数据库文件路径 */
onMounted(async () => {
  dbPath.value = await window.api.data.dbPath()
})
</script>

<template>
  <div>
    <!-- 工具卡片：导出 CSV / 导出 JSON / 打开数据文件夹 -->
    <div class="util-grid">
      <div class="util">
        <div class="ico">📄</div>
        <b>导出 CSV</b>
        <p>导出全部记录为 Excel 可直接打开的表格文件，用于备份或分析。</p>
        <el-button type="primary" round @click="doExport('csv')">导出 CSV</el-button>
      </div>
      <div class="util">
        <div class="ico">🗂️</div>
        <b>导出 JSON</b>
        <p>导出结构化数据文件，便于日后迁移到其他版本或应用。</p>
        <el-button round @click="doExport('json')">导出 JSON</el-button>
      </div>
      <div class="util">
        <div class="ico">💾</div>
        <b>本地备份</b>
        <p>数据仅保存在本机，不联网、不上传，你的账本只属于你。</p>
        <el-button round @click="openFolder">打开数据文件夹</el-button>
      </div>
    </div>

    <!-- 本地数据位置：告知用户数据存在哪里 -->
    <div class="card">
      <div class="card-title">本地数据位置</div>
      <div class="db-path">{{ dbPath }}</div>
    </div>

    <!-- 危险操作区：清空全部记录（建议先备份） -->
    <div class="card" style="margin-top: 16px">
      <div class="card-title">危险操作</div>
      <p style="color:var(--k-text2);font-size:14px;margin-bottom:14px">清空全部记录不可恢复，建议先导出备份。</p>
      <el-button round type="danger" plain @click="clearAll">清空全部记录</el-button>
    </div>
  </div>
</template>
