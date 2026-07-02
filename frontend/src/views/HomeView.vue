<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import MapExplorer from '@/components/MapExplorer.vue'
import SearchPanel from '@/components/SearchPanel.vue'
import TerritoirePanel from '@/components/TerritoirePanel.vue'
import { useTerritoireStore } from '@/stores/territoire'

const router = useRouter()
const route = useRoute()
const store = useTerritoireStore()

onMounted(() => {
  const code = route.query.territoire as string | undefined
  const type = route.query.type as string | undefined
  const nom = route.query.nom as string | undefined
  if (code && (type === 'commune' || type === 'epci')) {
    store.select({ id: code, name: nom ?? code, type, region: '', code })
  }
})
</script>

<template>
  <main class="home">
    <MapExplorer />
    <SearchPanel />
    <TerritoirePanel />

    <button class="nav-carto" @click="router.push('/cartographie')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <rect x="0.5" y="0.5" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/>
        <rect x="3" y="3" width="3" height="7" rx="0.8" fill="currentColor" opacity="0.5"/>
        <rect x="7" y="1.5" width="3" height="10" rx="0.8" fill="currentColor"/>
      </svg>
      Cartographie
    </button>
  </main>
</template>

<style scoped>
.home {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--shell-bg);
}


.nav-carto {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(184, 145, 74, 0.3);
  background: rgba(249, 246, 241, 0.92);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  transition: all 150ms ease;
}

.nav-carto:hover {
  border-color: var(--shell-accent);
  color: var(--text-gold);
  background: rgba(249, 246, 241, 0.98);
}
</style>
