<script setup>
import { computed } from 'vue'
import { store, go } from './store'
import DashboardView from './views/DashboardView.vue'
import AddView from './views/AddView.vue'
import RecordsView from './views/RecordsView.vue'
import StatsView from './views/StatsView.vue'
import DataView from './views/DataView.vue'
import CategoriesView from './views/CategoriesView.vue'
import Game2048View from './views/Game2048View.vue'

/** 左侧导航菜单：key 对应 store.view 的页面标识 */
const navs = [
  { key: 'dashboard', ico: '📊', label: '仪表盘' },
  { key: 'add', ico: '✍️', label: '记一笔' },
  { key: 'list', ico: '📋', label: '明细' },
  { key: 'stats', ico: '📈', label: '统计' },
  { key: 'data', ico: '🗄️', label: '数据管理' },
  { key: 'cats', ico: '🏷️', label: '分类管理' },
  { key: 'game2048', ico: '🎮', label: '2048' }
]

/** 顶部搜索框与明细页搜索关键词双向绑定 */
const search = computed({
  get: () => store.searchKeyword,
  set: (v) => { store.searchKeyword = v }
})

/** 把 YYYY-MM 显示成“2026年8月”的中文标题 */
function monthLabel() {
  const [y, m] = store.month.split('-')
  return `${y}年${Number(m)}月`
}
</script>

<template>
  <div class="app">
    <!-- 左侧导航栏：logo + 页面切换按钮 -->
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-badge">鲲</div>
        <div class="logo-text"><b>鲲鹏记账</b><span>治愈系 · 本地记账</span></div>
      </div>
      <button
        v-for="n in navs"
        :key="n.key"
        class="nav-item"
        :data-view="n.key"
        :class="{ active: store.view === n.key }"
        @click="go(n.key)"
      >
        <span class="ico">{{ n.ico }}</span>{{ n.label }}
      </button>
      <div class="spacer"></div>
      <div class="version">v1.3.0 · 数据仅存本机</div>
    </aside>

    <div class="main">
      <!-- 顶部栏：月份显示 + 全局搜索 + 快速记一笔 -->
      <div class="topbar">
        <div class="month-pill">‹ {{ monthLabel() }} ›</div>
        <div class="search">
          <span>🔍</span>
          <input v-model="search" placeholder="搜索备注 / 分类…" @keyup.enter="go('list')" />
        </div>
        <el-button type="primary" round @click="go('add')">＋ 记一笔</el-button>
      </div>

      <!-- 内容区：按当前页面切换渲染对应视图 -->
      <div class="content">
        <DashboardView v-if="store.view === 'dashboard'" />
        <AddView v-else-if="store.view === 'add'" />
        <RecordsView v-else-if="store.view === 'list'" />
        <StatsView v-else-if="store.view === 'stats'" />
        <DataView v-else-if="store.view === 'data'" />
        <CategoriesView v-else-if="store.view === 'cats'" />
        <Game2048View v-else-if="store.view === 'game2048'" />
      </div>
    </div>
  </div>
</template>
