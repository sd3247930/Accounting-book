<script setup>
import { computed } from 'vue'
import { catMeta } from '../utils/categoryMeta'

const props = defineProps({
  categories: { type: Array, default: () => [] },
  modelValue: { type: [Number, null], default: null }
})
const emit = defineEmits(['update:modelValue'])

const parents = computed(() => props.categories.filter((c) => c.parentId === null))
const leaf = computed(() => props.categories.find((c) => c.id === props.modelValue) || null)
const activeParentId = computed(() => leaf.value ? leaf.value.parentId : (parents.value[0]?.id ?? null))
const subs = computed(() => props.categories.filter((c) => c.parentId === activeParentId.value))

function pickParent(p) {
  const first = props.categories.find((c) => c.parentId === p.id)
  emit('update:modelValue', first ? first.id : null)
}
function pickSub(s) { emit('update:modelValue', s.id) }
</script>

<template>
  <div>
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
