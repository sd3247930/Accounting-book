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

const navs = [
  { key: 'dashboard', ico: '📊', label: '仪表盘' },
  { key: 'add', ico: '✍️', label: '记一笔' },
  { key: 'list', ico: '📋', label: '明细' },
  { key: 'stats', ico: '📈', label: '统计' },
  { key: 'data', ico: '🗄️', label: '数据管理' },
  { key: 'cats', ico: '🏷️', label: '分类管理' },
  { key: 'game2048', ico: '🎮', label: '2048' }
]

const search = computed({
  get: () => store.searchKeyword,
  set: (v) => { store.searchKeyword = v }
})

function monthLabel() {
  const [y, m] = store.month.split('-')
  return `${y}年${Number(m)}月`
}
</script>

<template>
  <div class="app">
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
      <div class="version">v1.2.0 · 数据仅存本机</div>
    </aside>

    <div class="main">
      <div class="topbar">
        <div class="month-pill">‹ {{ monthLabel() }} ›</div>
        <div class="search">
          <span>🔍</span>
          <input v-model="search" placeholder="搜索备注 / 分类…" @keyup.enter="go('list')" />
        </div>
        <el-button type="primary" round @click="go('add')">＋ 记一笔</el-button>
      </div>

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
