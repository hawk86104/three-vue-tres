import { MathUtils } from 'three'

const axes = ['x', 'y', 'z']
const forbidden = ['__proto__', 'constructor', 'prototype']
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

export function readPolyforkParts(input = {}) {
    if (!isObject(input)) throw new Error('部件配置格式不正确')
    const result = {}
    for (const [name, state] of Object.entries(input)) {
        if (!name || forbidden.includes(name) || !isObject(state)) throw new Error(`部件配置无效：${name}`)
        const next = {}
        for (const [key, value] of Object.entries(state)) {
            if (key === 'visible' && typeof value === 'boolean') next.visible = value
            else if (key === 'offset' && Number.isFinite(value)) next.offset = value
            else if (key === 'rotation' && isObject(value)) {
                next.rotation = {}
                for (const [axis, angle] of Object.entries(value)) {
                    if (!axes.includes(axis) || !Number.isFinite(angle) || Math.abs(angle) > 180) throw new Error(`骨骼旋转无效：${name}.${axis}`)
                    next.rotation[axis] = angle
                }
            } else throw new Error(`部件属性无效：${name}.${key}`)
        }
        result[name] = next
    }
    return result
}

// null removes one override, so reset restores the newly generated base pose.
export function mergePolyforkParts(current, patch) {
    if (!isObject(patch)) throw new Error('部件修改格式不正确')
    const result = readPolyforkParts(current)
    for (const [name, value] of Object.entries(patch)) {
        if (forbidden.includes(name)) throw new Error(`部件名称无效：${name}`)
        if (value === null) { delete result[name]; continue }
        const checked = readPolyforkParts({ [name]: value })[name]
        result[name] = { ...result[name], ...checked }
        if (checked.rotation) result[name].rotation = { ...current[name]?.rotation, ...checked.rotation }
    }
    return result
}

function words(value) {
    return String(value || '').replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z\d]+/).filter(Boolean)
}

export function hasPolyforkVisibilityParam(name, parameters = {}) {
    const directions = new Set(['l', 'r', 'f', 'b', 'fl', 'fr', 'rl', 'rr', 'lf', 'rf', 'lr', 'left', 'right', 'front', 'rear', 'back'])
    const part = words(name).filter((word) => !directions.has(word))
    return Object.entries(parameters).some(([key, parameter]) => {
        if (['toggle', 'bool'].includes(parameter?.type)) {
            const terms = words(`${key} ${parameter.label || ''}`)
            return part.length > 0 && part.every((word) => terms.some((term) => word === term ||
                (Math.min(word.length, term.length) >= 4 && (word.startsWith(term) || term.startsWith(word)))))
        }
        if (parameter?.type !== 'choice' || !Array.isArray(parameter.options)) return false
        const options = parameter.options.map((value) => String(value).toLowerCase())
        return options.some((value) => ['none', 'off', 'hidden'].includes(value)) && options.includes(name.toLowerCase())
    })
}

// A binding belongs to one generated tree. Keep node references out of config.
export function createPolyforkPartBinding(model, rig = {}, parameters = {}) {
    const named = new Map()
    model.traverse((node) => {
        if (node === model || !node.name || node.userData?.decal || forbidden.includes(node.name)) return
        if (!node.isBone && !node.isGroup && !node.isMesh) return
        if (!named.has(node.name)) named.set(node.name, [])
        named.get(node.name).push(node)
    })
    const controls = []
    const targets = new Map()
    for (const name of new Set([...Object.keys(rig), ...named.keys()])) {
        if (forbidden.includes(name)) continue
        const nodes = named.get(name) || []
        const bones = nodes.filter((node) => node.isBone)
        const node = hasOwn(rig, name) && bones.length === 1 ? bones[0] : nodes.length === 1 ? nodes[0] : null
        const spec = rig[name] || {}
        const joint = hasOwn(rig, name)
        const range = Array.isArray(spec.range) && spec.range.length === 2 && spec.range.every(Number.isFinite) ? spec.range : [0, 90]
        const control = {
            name, kind: joint ? 'joint' : node?.isBone ? 'bone' : 'part',
            available: Boolean(node), reason: nodes.length > 1 && !node ? '存在同名节点，不能可靠定位' : !node ? '当前参数下没有此节点' : '',
            axis: axes.includes(spec.axis) ? spec.axis : 'y', slide: spec.type === 'slide',
            min: Math.min(0, ...range), max: Math.max(0, ...range),
            canHide: Boolean(node && !node.isBone && !hasPolyforkVisibilityParam(name, parameters)),
            visible: node?.visible ?? true,
        }
        controls.push(control)
        if (node) targets.set(name, { node, control, position: node.position.clone(), rotation: node.rotation.clone() })
    }
    const apply = (input, requiredNames = []) => {
        const state = readPolyforkParts(input)
        const warnings = []
        for (const name of requiredNames) {
            if (!targets.has(name)) throw new Error(`部件当前不可用或名称重复：${name}`)
        }
        // Validate the complete pose before touching any node.
        for (const [name, value] of Object.entries(state)) {
            const target = targets.get(name)
            if (!target) { warnings.push(`未应用 ${name}：节点不存在或名称重复，设置已保留`); continue }
            const { control } = target
            if (hasOwn(value, 'visible') && !control.canHide) throw new Error(`部件 ${name} 的显隐由模型参数控制，或它是骨骼节点`)
            if (hasOwn(value, 'offset') && (control.kind !== 'joint' || value.offset < control.min || value.offset > control.max)) {
                throw new Error(`部件 ${name} 的偏移超出声明范围`)
            }
            if (value.rotation && control.kind !== 'bone') throw new Error(`部件 ${name} 未开放三轴骨骼旋转`)
        }
        for (const [name, { node, control, position, rotation }] of targets) {
            const value = state[name] || {}
            node.position.copy(position)
            node.rotation.copy(rotation)
            node.visible = value.visible ?? control.visible
            if (value.offset !== undefined) {
                if (control.slide) node.position[control.axis] += value.offset
                else node.rotation[control.axis] += MathUtils.degToRad(value.offset)
            }
            if (value.rotation) axes.forEach((axis) => { node.rotation[axis] += MathUtils.degToRad(value.rotation[axis] || 0) })
        }
        model.updateWorldMatrix(true, true)
        model.traverse((node) => {
            if (node.isSkinnedMesh) { node.computeBoundingBox(); node.computeBoundingSphere() }
        })
        return { state, warnings }
    }
    return { controls, apply }
}
