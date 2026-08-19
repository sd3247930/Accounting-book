<script setup>
import { computed } from 'vue'
import { catMeta } from '../utils/categoryMeta'

const props = defineProps({
  // 全部一级+二级分类（已由父组件过滤好“收入”分组外的分类）
  categories: { type: Array, default: () => [] },
  // 当前选中的二级分类 ID（v-model 双向绑定）
  modelValue: { type: [Number, null], default: null }
})
const emit = defineEmits(['update:modelValue'])

/** 一级分类列表（parentId 为 null） */
const parents = computed(() => props.categories.filter((c) => c.parentId === null))
/** 当前已选中的二级分类（用于反推它属于哪个一级分类） */
const leaf = computed(() => props.categories.find((c) => c.id === props.modelValue) || null)
/** 当前展开的一级分类：优先跟随已选二级分类的上级，否则默认第一个 */
const activeParentId = computed(() => leaf.value ? leaf.value.parentId : (parents.value[0]?.id ?? null))
/** 当前一级分类下的二级分类列表 */
const subs = computed(() => props.categories.filter((c) => c.parentId === activeParentId.value))

/** 点击一级分类：自动选中它下面的第一个二级分类，保证必有有效值 */
function pickParent(p) {
  const first = props.categories.find((c) => c.parentId === p.id)
  emit('update:modelValue', first ? first.id : null)
}
/** 点击二级分类：把选中值回传给父组件表单 */
function pickSub(s) { emit('update:modelValue', s.id) }
</script>

<template>
  <div>
    <!-- 一级分类九宫格：选中后下方联动显示二级分类 -->
    <div class="cat-grid">
      <div
        v-for="p in parents"
        :key="p.id"
        class="cat-cell"
        :class="{ selected: p.id === activeParentId }"
        @click="pickParent(p)"
      >
        <span class="ico-round" :style="{ background: catMeta(p.name).bg }">{{ catMeta(p.name).emoji }}</span>{{ p.name }}
      </div>
    </div>
    <!-- 二级分类：最终提交的金额归属分类 -->
    <div class="field-label">二级分类</div>
    <div class="pill-row">
      <button
        v-for="s in subs"
        :key="s.id"
        class="pill"
        :class="{ selected: s.id === modelValue }"
        @click="pickSub(s)"
      >{{ s.name }}</button>
    </div>
  </div>
</template>
