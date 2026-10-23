import { readFile,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'
const root=new URL('../',import.meta.url)
const server=await createServer({root:decodeURIComponent(root.pathname).replace(/^\/(\w:)/,'$1'),server:{middlewareMode:true},appType:'custom'})
try{
  const {catalog,DECK_BASE,DECK_ID,DECK_VERSION,CATALOG_VERSION}=await server.ssrLoadModule('/src/features/tarot/data/catalog.ts')
  const imageManifest=JSON.parse(await readFile(new URL(`../public${DECK_BASE}/images.json`,import.meta.url),'utf8'))
  const cards=[]
  for(const card of catalog){
    const image=imageManifest.cards.find(image=>image.cardId===card.cardId)
    if(!image)throw new Error(`Missing image ${card.cardId}`)
    const bytes=await readFile(new URL(`../public${card.imagePath}`,import.meta.url))
    if(createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new Error(`Image checksum mismatch ${card.cardId}`)
    cards.push({...card,source:image.source,license:image.license,sha256:image.sha256})
  }
  if(cards.length!==78)throw new Error('Deck must contain 78 unique cards')
  await writeFile(new URL(`../public${DECK_BASE}/manifest.json`,import.meta.url),JSON.stringify({schemaVersion:1,deckId:DECK_ID,version:DECK_VERSION,catalogVersion:CATALOG_VERSION,artist:imageManifest.artist,scanCredit:imageManifest.scanCredit,cards},null,2)+'\n')
  console.log(`Manifest verified: ${cards.length} cards, ${DECK_ID}@${DECK_VERSION}`)
}finally{await server.close()}
