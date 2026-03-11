/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-08-14 10:52:40
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-03-11 09:58:32
 */
import { ref, shallowReactive } from 'vue'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'

function useAnimations(onBeforeRender, animations, modelRef) {
    const reference = ref(modelRef)

    const mixer = new THREE.AnimationMixer(reference.value)

    const actions = shallowReactive({})

    animations.forEach((animation) => {
        const action = mixer.clipAction(animation, reference.value)
        actions[animation.name] = action
    })

    onBeforeRender(() => {
        mixer.update(0.008)
    })

    return {
        actions,
        mixer,
    }
}

function containsSkinnedMesh(object) {
		let hasSkinnedMesh = false

		object.traverse((child) => {
				if (child.isSkinnedMesh) {
						hasSkinnedMesh = true
				}
		})

		return hasSkinnedMesh
}
function bakeWorldTransformToGeometryTree(object) {
		// 克隆保动画结构，包括骨骼引用、名字等
		let cloned = null
		if (containsSkinnedMesh(object)) {
				cloned = SkeletonUtils.clone(object)
				cloned.updateMatrixWorld(true)
		} else {
				cloned = object.clone()
		}
		return cloned
}

function centerObjectAtOrigin(object) {
		// 创建包围盒
		const box = new THREE.Box3().setFromObject(object)
		const center = new THREE.Vector3()
		box.getCenter(center)

		const size = new THREE.Vector3()
		box.getSize(size)
		const yOffset = box.min.y // 物体底部的 Y 坐标

		const wrapper = new THREE.Group()
		wrapper.name = 'centeredGroup'
		object.position.sub(center)
		object.position.y = -yOffset // 让底部贴地
		wrapper.add(object)

		return wrapper
}

function standardizationMeshCopy(mesh) {
		const ms = bakeWorldTransformToGeometryTree(mesh)
		return centerObjectAtOrigin(ms)
}

function meshAddEvent(mesh, events) {
  if (!mesh || !events?.length) return

  const enabledEvents = events.filter(ev => ev.enabled)
  if (!enabledEvents.length) return

  const clickEvent = enabledEvents.find(ev => ev.eventType === 'click')
  const dblClickEvent = enabledEvents.find(ev => ev.eventType === 'doubleclick')

  let clickTimer = null

  const callEvent = (ev, e) => {
    const { currentObject, point, object, distance } = e
    ev.function(e, currentObject, point, object, distance)
  }

  // ✅ click & doubleclick 统一处理
  if (clickEvent || dblClickEvent) {
    if (clickEvent) {
      mesh.addEventListener('click', e => {
        if (clickTimer) clearTimeout(clickTimer)
        if (dblClickEvent) {
          clickTimer = setTimeout(() => callEvent(clickEvent, e), 250)
        } else {
          callEvent(clickEvent, e)
        }
      })
      console.log(`✅ 已绑定 click uuid=${mesh.uuid}`)
    }

    if (dblClickEvent) {
      mesh.addEventListener('dblclick', e => {
        if (clickTimer) {
          clearTimeout(clickTimer)
          clickTimer = null
        }
        callEvent(dblClickEvent, e)
      })
      console.log(`✅ 已绑定 dblclick uuid=${mesh.uuid}`)
    }
  }

  // ✅ 绑定其他事件
  for (const ev of enabledEvents) {
    if (['click', 'doubleclick'].includes(ev.eventType)) continue
    mesh.addEventListener(ev.eventType, e => callEvent(ev, e))
    console.log(`✅ 已绑定 ${ev.eventType} uuid=${mesh.uuid}`)
  }
}

function extendMakeEvent(eventList) {
  const handlers = {}
  const eventFns = {
    click: null,
    doubleclick: null,
    contextmenu: null,
    pointerenter: null,
    pointerleave: null
  }

  // 先收集所有启用的函数
  for (const ev of eventList) {
    if (ev.enabled && typeof ev.function === 'function') {
			eventFns[ev.eventType] = (e) => {
				const { currentObject, point, object, distance } = e
				ev.function(e, currentObject, point, object, distance)
			}
			console.log(`✅ 已绑定 ${ev.eventType} `)
    }
  }

  let clickTimer = null

  // ✅ click / doubleclick 处理逻辑（防冲突）
  if (eventFns.click || eventFns.doubleclick) {
		handlers.click = (e) => {
      if (clickTimer) clearTimeout(clickTimer)

      if (eventFns.doubleclick) {
        clickTimer = setTimeout(() => {
          eventFns.click?.(e)
        }, 250)
      } else {
        eventFns.click?.(e)
      }
    }

    if (eventFns.doubleclick) {
			handlers.dblclick = (e) => {
        if (clickTimer) {
          clearTimeout(clickTimer)
          clickTimer = null
        }
        eventFns.doubleclick?.(e)
      }
    }
  }

  // ✅ 其他事件直接绑定
  for (const key of ['contextmenu', 'pointerenter', 'pointerleave']) {
    if (eventFns[key]) {
      handlers[key] = eventFns[key]
    }
  }

  return handlers
}

function onReadySenceOnce () {
  if (window.globalTvtFun) {
    if (window.globalTvtFun?.gerstnerWater_updateMeshList) {
      window.globalTvtFun?.gerstnerWater_updateMeshList(true)
    }
  }
}

export { standardizationMeshCopy, bakeWorldTransformToGeometryTree, useAnimations, meshAddEvent, extendMakeEvent, onReadySenceOnce }