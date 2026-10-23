import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { expect,it } from 'vitest'
import { catalog,DECK_BASE } from '../data/catalog'
it('bundles every real card locally with a complete source manifest and verified image bytes',async()=>{
  const manifest=JSON.parse(await readFile(`public${DECK_BASE}/manifest.json`,'utf8'))
  expect(manifest.cards).toHaveLength(78)
  await Promise.all(catalog.map(async card=>{
    const item=manifest.cards.find((c:{cardId:string})=>c.cardId===card.cardId)
    expect(item).toMatchObject(card)
    expect(item.license).toBe('Public domain')
    expect(item.source).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:RWS1909/)
    const image=await readFile(`public${card.imagePath}`)
    expect(image.subarray(0,4).toString()).toBe('RIFF')
    expect(image.subarray(8,12).toString()).toBe('WEBP')
    expect(createHash('sha256').update(image).digest('hex')).toBe(item.sha256)
  }))
})
