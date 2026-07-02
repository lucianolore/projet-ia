import { defineStore } from 'pinia'
import type { Territory, TerritoireData } from '@/types/territoire'
import { fetchTerritoireData } from '@/services/rei'
import { fetchTaData } from '@/services/ta'

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
    comparaisonTarget: null as Territory | null,
    comparaisonData: null as TerritoireData | null,
    comparaisonLoading: false,
    comparaisonError: null as string | null,
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
        const [reiResult, taResult] = await Promise.allSettled([
          fetchTerritoireData(territory, annee),
          territory.type === 'commune' ? fetchTaData(territory.code) : Promise.resolve(null),
        ])

        if (reiResult.status === 'rejected') throw reiResult.reason

        this.data = {
          ...reiResult.value,
          ta: taResult.status === 'fulfilled' ? taResult.value : null,
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
      this.comparaisonTarget = null
      this.comparaisonData = null
      this.comparaisonError = null
    },
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
        const [reiResult, taResult] = await Promise.allSettled([
          fetchTerritoireData(territory, this.annee),
          territory.type === 'commune' ? fetchTaData(territory.code) : Promise.resolve(null),
        ])
        if (reiResult.status === 'rejected') throw reiResult.reason
        this.comparaisonData = {
          ...reiResult.value,
          ta: taResult.status === 'fulfilled' ? taResult.value : null,
        }
      } catch (e: unknown) {
        this.comparaisonError = e instanceof Error ? e.message : 'Erreur inconnue'
      } finally {
        this.comparaisonLoading = false
      }
    },
  },
})
