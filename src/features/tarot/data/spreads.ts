import type { Position, Scenario, ScenarioId } from '../domain/types'

function positions(ids: string[], labels: string[]): Position[] {
  const n = ids.length
  const coords = n === 5 ? [[.5,.16],[.26,.46],[.26,.8],[.74,.46],[.74,.8]]
    : n === 4 ? [[.27,.24],[.73,.24],[.27,.74],[.73,.74]]
    : n === 3 ? [[.17,.5],[.5,.5],[.83,.5]] : [[.5,.5]]
  return ids.map((id, i) => ({ id, label: labels[i], x: coords[i][0], y: coords[i][1], w: n === 3 ? .26 : .3, h: n === 5 ? .24 : .38 }))
}

export const scenarios: Scenario[] = [
  { id: 'shopping', name: '购物决策', glyph: '◇', description: '想要、需要，还是再等等', example: '这台相机适合现在买下吗？', spreadId: 'purchase-4', positions: positions(['need','benefit','cost','action'], ['真实需要','可能收获','潜在代价','行动建议']) },
  { id: 'choice', name: '二选一', glyph: '⇌', description: '看看两条路各自的风景', example: '面对这两个选择，我该考虑些什么？', spreadId: 'choice-5', positions: positions(['present','a-support','a-challenge','b-support','b-challenge'], ['当下处境','A 的助力','A 的挑战','B 的助力','B 的挑战']) },
  { id: 'self', name: '近期状态', glyph: '☾', description: '给此刻的自己一点倾听', example: '最近的疲惫在提醒我什么？', spreadId: 'reflection-3', positions: positions(['present','overlooked','action'], ['此刻状态','忽略的线索','下一步行动']) },
  { id: 'relationship', name: '关系相处', glyph: '∞', description: '从相处中，重新看见自己', example: '我可以怎样改善这段关系中的沟通？', spreadId: 'connection-3', positions: positions(['self','pattern','action'], ['我的状态','互动模式','我能做什么']) },
  { id: 'growth', name: '工作学业', glyph: '↗', description: '理一理阻碍与手中的资源', example: '推进这个目标，我可以先做些什么？', spreadId: 'growth-4', positions: positions(['present','obstacle','resource','action'], ['当前处境','主要阻碍','可用资源','下一步行动']) },
  { id: 'guidance', name: '一张指引', glyph: '✧', description: '留一个简单而轻盈的提醒', example: '今天我可以留意什么？', spreadId: 'guidance-1', positions: positions(['guidance'], ['此刻提醒']) },
]
export function getScenario(id: ScenarioId) { return scenarios.find(s => s.id === id)! }
export const stageLabels = { draft: '问题还没写完', shuffling: '洗牌', cutting: '切牌', drawing: '抽牌', revealed: '已揭示' }
