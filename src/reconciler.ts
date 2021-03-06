import {
  IFiber,
  FreElement,
  FC,
  Attributes,
  HTMLElementEx,
  FreNode,
  IEffect,
} from "./type"
import { createElement } from "./dom"
import { resetCursor } from "./hook"
import { scheduleWork, shouldYield, schedule } from "./scheduler"
import { isArr, createText } from "./h"
import { commitWork } from './commit'

let currentFiber: IFiber
let finish = null
let effect = null
export let config = {} as any
export let deletions = []

export const enum LANE {
  UPDATE = 1 << 1,
  INSERT = 1 << 2,
  REMOVE = 1 << 3,
  SVG = 1 << 4,
  DIRTY = 1 << 5,
  Suspense = 1 << 6,
  Error = 1 << 7,
  Boundary = Suspense | Error,
}
export const render = (
  vnode: FreElement,
  node: Node,
  con: any
): void => {
  const rootFiber = {
    node,
    props: { children: vnode },
  } as IFiber
  config = con
  dispatchUpdate(rootFiber)
}

export const dispatchUpdate = (fiber?: IFiber) => {
  if (fiber && !(fiber.lane & LANE.DIRTY)) {
    fiber.lane = LANE.UPDATE | LANE.DIRTY
    fiber.sibling = null
    effect = fiber
    scheduleWork(reconcileWork as any, fiber)
  }
}

const reconcileWork = (WIP?: IFiber): boolean => {
  while (WIP && !shouldYield()) WIP = reconcile(WIP)
  if (WIP) return reconcileWork.bind(null, WIP)
  if (finish) {
    commitWork(finish)
    finish = null
  }
  return null
}

const reconcile = (WIP: IFiber): IFiber | undefined => {
  isFn(WIP.type) ? updateHook(WIP) : updateHost(WIP)
  if (WIP.child) return WIP.child
  while (WIP) {
    finishWork(WIP)
    if (!finish && WIP.lane & LANE.DIRTY) {
      finish = WIP
      WIP.lane &= ~LANE.DIRTY
      return null
    }
    if (WIP.sibling) return WIP.sibling
    WIP = WIP.parent
  }
}

const finishWork = (WIP) => {
  if (isFn(WIP.type)) {
    const kid = WIP.child
    kid.sibling = WIP.sibling
    kid.lane |= WIP.lane
    invokeHooks(WIP)
  } else {
    effect.next = WIP
    effect = WIP
  }
}

const updateHook = <P = Attributes>(WIP: IFiber): void => {
  currentFiber = WIP
  resetCursor()
  try {
    var children = (WIP.type as FC<P>)(WIP.props)
  } catch (e) {
    const then = typeof e?.then === "function",
      p = getBoundary(WIP, then),
      fb = simpleVnode(p.props.fallback, e)
    if (!p || !fb) throw e
    if (then) {
      if (!p.laziness) {
        p.laziness = []
        p.child = children = fb
      }
      p.laziness.push(e)
    } else {
      children = fb
    }
  }
  isStr(children) && (children = simpleVnode(children))
  reconcileChildren(WIP, children)
}

const updateHost = (WIP: IFiber): void => {
  WIP.parentNode = getParentNode(WIP) as any

  if (!WIP.node) {
    if (WIP.type === "svg") WIP.lane |= LANE.SVG
    WIP.node = createElement(WIP) as HTMLElementEx
  }
  reconcileChildren(WIP, WIP.props.children)
}

const simpleVnode = (type: any, props?: any) =>
  isStr(type) ? createText(type as string) : isFn(type) ? type(props) : type

const getParentNode = (WIP: IFiber): HTMLElement | undefined => {
  while ((WIP = WIP.parent)) {
    if (!isFn(WIP.type)) return WIP.node
  }
}

const getBoundary = (WIP: IFiber, then): IFiber | undefined => {
  while ((WIP = WIP.parent)) {
    if ((WIP.type as any).lane & (then ? LANE.Suspense : LANE.Error)) {
      return WIP
    }
  }
}

const reconcileChildren = (WIP: any, children: FreNode): void => {
  let aCh = WIP.kids || [],
    bCh = (WIP.kids = arrayfy(children) as any),
    aHead = 0,
    bHead = 0,
    aTail = aCh.length - 1,
    bTail = bCh.length - 1,
    keyed = null

  while (aHead <= aTail && bHead <= bTail) {
    if (!same(aCh[aTail], bCh[bTail])) break
    clone(aCh[aTail--], bCh[bTail--], LANE.UPDATE)
  }

  while (aHead <= aTail && bHead <= bTail) {
    if (!same(aCh[aHead], bCh[bHead])) break
    clone(aCh[aHead++], bCh[bHead++], LANE.UPDATE)
  }

  if (aHead > aTail) {
    while (bHead <= bTail) {
      let c = bCh[bTail--]
      c.lane = LANE.INSERT
    }
  } else if (bHead > bTail) {
    while (aHead <= aTail) {
      let c = aCh[aTail--]
      c.lane = LANE.REMOVE
      deletions.push(c)
    }
  } else {
    if (!keyed) {
      keyed = {}
      for (let i = aHead; i <= aTail; i++) {
        let k = aCh[i].key
        if (k) keyed[k] = i
      }
    }
    while (bHead <= bTail) {
      let c = bCh[bTail--]
      let idx = keyed[c.key]
      if (idx != null) {
        clone(aCh[idx], c, LANE.INSERT)
        delete keyed[c.key]
      } else {
        c.lane = LANE.INSERT
      }
    }
    for (const k in keyed) {
      let c = aCh[keyed[k]]
      c.lane = LANE.REMOVE
      deletions.push(c)
    }
  }

  for (var i = bCh.length - 1, prev = null; i >= 0; i--) {
    const child = bCh[i]
    child.parent = WIP
    if (i === bCh.length - 1) {
      if (WIP.lane & LANE.SVG) {
        child.lane |= LANE.SVG
      }
      WIP.child = child
    } else {
      prev.sibling = child
    }
    prev = child
  }
}

function clone(a, b, lane) {
  b.lastProps = a.props
  b.node = a.node
  b.kids = a.kids
  b.hooks = a.hooks
  b.ref = a.ref
  b.lane = lane
}


function invokeHooks(fiber) {
  const { hooks, lane, laziness } = fiber
  if (laziness) {
    Promise.all(laziness).then(() => {
      fiber.laziness = null
      dispatchUpdate(fiber)
    })
  }
  if (hooks) {
    if (lane & LANE.REMOVE) {
      hooks.list.forEach((e) => e[2] && e[2]())
    } else {
      side(hooks.layout)
      schedule(() => side(hooks.effect))
    }
  }
}

const same = (a, b) => {
  const type = (c) => isFn(c.type) ? c.type.name : c.type
  return a && b && (a.key === b.key) && (type(a) === type(b))
}

const arrayfy = (arr) => (!arr ? [] : isArr(arr) ? arr : [arr])

const side = (effects: IEffect[]): void => {
  effects.forEach((e) => e[2] && e[2]())
  effects.forEach((e) => (e[2] = e[0]()))
  effects.length = 0
}

export const getCurrentFiber = () => currentFiber || null
export const isFn = (x: any): x is Function => typeof x === "function"
export const isStr = (s: any): s is number | string =>
  typeof s === "number" || typeof s === "string"
