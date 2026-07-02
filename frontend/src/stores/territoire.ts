import { defineStore } from 'pinia'
import type { Territory, TerritoireData } from '@/types/territoire'
import { fetchTerritoireData, fetchCfeFocusVars } from '@/services/rei'
import { fetchTaData } from '@/services/ta'
import { fetchEpciDetails } from '@/services/geo'

const AVAILABLE_YEARS = ['2025', '2024'] as const
type Annee = (typeof AVAILABLE_YEARS)[number]

export const useTerritoireStore = defineStore('territoire', {
  state: () => ({
    selected: null as Territory | null,
    data: null as TerritoireData | null,
    loading: false,
    error: null as string | null,
    annee: '2025' as Annee,
    availableYears: AVAILABLE_YEARS as readonly string[],
    showComparaison: false,
    showComparaisonVilles: false,
    showComparaisonEpci: false,
    showMultiComparaison: false,
    showAiChat: false,
    comparaisonTarget: null as Territory | null,
    comparaisonData: null as TerritoireData | null,
    comparaisonLoading: false,
    comparaisonError: null as string | null,
    multiTargets: [] as Territory[],
    multiData: [] as (TerritoireData | null)[],
    multiErrors: [] as (string | null)[],
    multiLoadingIdx: null as number | null,
  }),
  actions: {
    async select(territory: Territory) {
      this.selected = territory
      await this._fetch(territory, this.annee)
    },
    async setAnnee(annee: string) {
      this.annee = annee as Annee
      if (this.selected) await this._fetch(this.selected, annee)
    },
    async _fetch(territory: Territory, annee: string) {
      this.data = null
      this.error = null
      this.loading = true
      try {
        const isEpci = territory.type === 'epci'
        const [reiResult, taResult, epciDetailsResult, cfeFocusResult] = await Promise.allSettled([
          fetchTerritoireData(territory, annee),
          territory.type === 'commune' ? fetchTaData(territory.code) : Promise.resolve(null),
          isEpci ? fetchEpciDetails(territory.code) : Promise.resolve(null),
          isEpci ? fetchCfeFocusVars(territory.code, annee) : Promise.resolve({}),
        ])

        if (reiResult.status === 'rejected') throw reiResult.reason

        this.data = {
          ...reiResult.value,
          ta: taResult.status === 'fulfilled' ? taResult.value : null,
          epciDetails: epciDetailsResult.status === 'fulfilled' ? epciDetailsResult.value : null,
          cfeFocusVars: cfeFocusResult.status === 'fulfilled' ? (cfeFocusResult.value ?? {}) : {},
        }
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Erreur inconnue'
      } finally {
        this.loading = false
      }
    },
    close() {
      this.selected = null
      this.data = null
      this.error = null
      this.showComparaison = false
      this.showComparaisonVilles = false
      this.showComparaisonEpci = false
      this.showMultiComparaison = false
      this.showAiChat = false
      this.comparaisonTarget = null
      this.comparaisonData = null
      this.comparaisonError = null
      this.multiTargets = []
      this.multiData = []
      this.multiErrors = []
      this.multiLoadingIdx = null
    },
    openMultiComparaison() {
      if (!this.selected || !this.data) return
      this.showMultiComparaison = true
      this.multiTargets = [this.selected]
      this.multiData = [this.data]
      this.multiErrors = [null]
      this.multiLoadingIdx = null
    },
    closeMultiComparaison() {
      this.showMultiComparaison = false
      this.multiTargets = []
      this.multiData = []
      this.multiErrors = []
      this.multiLoadingIdx = null
    },
    async addMultiTarget(territory: Territory) {
      if (this.multiTargets.length >= 5 || this.multiLoadingIdx !== null) return
      const idx = this.multiTargets.length
      this.multiTargets.push(territory)
      this.multiData.push(null)
      this.multiErrors.push(null)
      this.multiLoadingIdx = idx
      try {
        const isEpci = territory.type === 'epci'
        const [reiResult, taResult, epciDetailsResult, cfeFocusResult] = await Promise.allSettled([
          fetchTerritoireData(territory, this.annee),
          territory.type === 'commune' ? fetchTaData(territory.code) : Promise.resolve(null),
          isEpci ? fetchEpciDetails(territory.code) : Promise.resolve(null),
          isEpci ? fetchCfeFocusVars(territory.code, this.annee) : Promise.resolve({}),
        ])
        if (reiResult.status === 'rejected') throw reiResult.reason
        this.multiData[idx] = {
          ...reiResult.value,
          ta: taResult.status === 'fulfilled' ? taResult.value : null,
          epciDetails: epciDetailsResult.status === 'fulfilled' ? epciDetailsResult.value : null,
          cfeFocusVars: cfeFocusResult.status === 'fulfilled' ? (cfeFocusResult.value ?? {}) : {},
        }
      } catch (e: unknown) {
        this.multiErrors[idx] = e instanceof Error ? e.message : 'Erreur inconnue'
      } finally {
        this.multiLoadingIdx = null
      }
    },
    removeMultiTarget(index: number) {
      if (index === 0) return
      this.multiTargets.splice(index, 1)
      this.multiData.splice(index, 1)
      this.multiErrors.splice(index, 1)
    },
    openAiChat() { this.showAiChat = true },
    closeAiChat() { this.showAiChat = false },
    openComparaison() { this.showComparaison = true },
    closeComparaison() { this.showComparaison = false },
    openComparaisonVilles() {
      this.showComparaisonVilles = true
      this.comparaisonTarget = null
      this.comparaisonData = null
      this.comparaisonError = null
    },
    closeComparaisonVilles() {
      this.showComparaisonVilles = false
      this.comparaisonTarget = null
      this.comparaisonData = null
      this.comparaisonError = null
    },
    openComparaisonEpci() {
      this.showComparaisonEpci = true
      this.comparaisonTarget = null
      this.comparaisonData = null
      this.comparaisonError = null
    },
    closeComparaisonEpci() {
      this.showComparaisonEpci = false
      this.comparaisonTarget = null
      this.comparaisonData = null
      this.comparaisonError = null
    },
    async selectComparaisonTarget(territory: Territory) {
      this.comparaisonTarget = territory
      this.comparaisonData = null
      this.comparaisonError = null
      this.comparaisonLoading = true
      try {
        const isEpci = territory.type === 'epci'
        const [reiResult, taResult, epciDetailsResult, cfeFocusResult] = await Promise.allSettled([
          fetchTerritoireData(territory, this.annee),
          territory.type === 'commune' ? fetchTaData(territory.code) : Promise.resolve(null),
          isEpci ? fetchEpciDetails(territory.code) : Promise.resolve(null),
          isEpci ? fetchCfeFocusVars(territory.code, this.annee) : Promise.resolve({}),
        ])
        if (reiResult.status === 'rejected') throw reiResult.reason
        this.comparaisonData = {
          ...reiResult.value,
          ta: taResult.status === 'fulfilled' ? taResult.value : null,
          epciDetails: epciDetailsResult.status === 'fulfilled' ? epciDetailsResult.value : null,
          cfeFocusVars: cfeFocusResult.status === 'fulfilled' ? (cfeFocusResult.value ?? {}) : {},
        }
      } catch (e: unknown) {
        this.comparaisonError = e instanceof Error ? e.message : 'Erreur inconnue'
      } finally {
        this.comparaisonLoading = false
      }
    },
  },
})
