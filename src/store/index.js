import { createStore } from 'vuex'

export default createStore({
  state: {
    // 画布上的所有对象（图层列表）
    layers: [],
    // 当前选中的对象 ID
    activeObjectId: null,
    // 画布缩放比例
    zoom: 100,
    // 历史记录
    history: [],
    historyIndex: -1
  },
  getters: {
    // 获取当前选中的图层
    activeLayer: (state) => {
      return state.layers.find((layer) => layer.id === state.activeObjectId) || null
    },
    // 获取反转的图层列表（用于显示，通常图层面板是从上到下的）
    reversedLayers: (state) => {
      return [...state.layers].reverse()
    }
  },
  mutations: {
    SET_LAYERS(state, layers) {
      state.layers = layers
    },
    SET_ACTIVE_OBJECT_ID(state, id) {
      state.activeObjectId = id
    },
    UPDATE_LAYER(state, { id, props }) {
      const index = state.layers.findIndex((l) => l.id === id)
      if (index !== -1) {
        state.layers[index] = { ...state.layers[index], ...props }
      }
    },
    SET_ZOOM(state, zoom) {
      state.zoom = zoom
    }
  },
  actions: {
    updateLayers({ commit }, layers) {
      // Editor.vue 已经完成了数据序列化工作，这里直接存储
      commit('SET_LAYERS', layers)
    },
    setActiveObject({ commit }, id) {
      commit('SET_ACTIVE_OBJECT_ID', id)
    }
  }
})
