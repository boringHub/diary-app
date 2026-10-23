// Optional browser acceptance test: PLAYWRIGHT_MODULE can point to an existing installation.
import { createRequire } from 'node:module'
import { mkdir,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({headless:true,channel:process.env.TAROT_BROWSER_CHANNEL||'msedge'})
const output=join(tmpdir(),'shiguangjian-tarot-qa');await mkdir(output,{recursive:true})
const failures=[],results=[]
const origin=process.env.TAROT_TEST_ORIGIN||'http://127.0.0.1:5174'
let currentPage
async function settle(page){await page.evaluate(async()=>{
  // Ionic starts transitions after layout, beyond the navigation promise.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  await Promise.all(document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>undefined)))
})}

async function getReadings(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('shiguangjian.tarot.v1',1)
  request.onsuccess=()=>{const db=request.result;const get=db.transaction('readings').objectStore('readings').getAll();get.onsuccess=()=>{db.close();resolve(get.result)};get.onerror=()=>reject(get.error)}
  request.onerror=()=>reject(request.error)
}))}
async function pick(page,position,{drag=false,zoom=false,failure=false}={}){
  await page.getByRole('button',{name:`${position}，选择一张牌`,exact:true}).click()
  const stage=page.locator('dialog[open] .t-fan-stage');await stage.waitFor({state:'visible'})
  await stage.locator('button[data-angle]').first().waitFor({state:'attached'})
  await settle(page)
  const cards=await page.getByRole('button',{name:/选择第/}).count()
  if(drag){
    await page.mouse.move(45,410);await page.mouse.down();await page.mouse.move(110,510,{steps:15});await page.mouse.up()
    assert.equal(await page.getByRole('button',{name:/选择第/}).count(),cards,'drag must not draw')
  }
  if(zoom){
    await stage.dispatchEvent('pointerdown',{pointerId:11,pointerType:'touch',clientX:80,clientY:400})
    await stage.dispatchEvent('pointerdown',{pointerId:12,pointerType:'touch',clientX:180,clientY:400})
    await stage.dispatchEvent('pointermove',{pointerId:12,pointerType:'touch',clientX:260,clientY:400})
    await stage.dispatchEvent('pointerup',{pointerId:12,pointerType:'touch',clientX:260,clientY:400})
    await stage.dispatchEvent('pointerup',{pointerId:11,pointerType:'touch',clientX:80,clientY:400})
    assert.equal(await page.getByRole('button',{name:/选择第/}).count(),cards,'pinch must not draw')
    await stage.press('+');await stage.press('-')
  }
  if(drag||zoom){
    // Deliberate keyboard activation after browsing must remain available.
    const card=page.getByRole('button',{name:/选择第/}).nth(Math.min(55,cards-1))
    await card.focus();await card.press('Enter')
  }else{
    // Use a visible painted wedge; gaps between rotated cards are intentional.
    const point=await stage.evaluate(el=>{
      const box=el.getBoundingClientRect()
      for(let y=box.top+40;y<box.bottom-20;y+=8)for(let x=box.left+12;x<box.right-12;x+=8){
        const hit=document.elementFromPoint(x,y)?.closest('button.t-fan-card')
        if(hit&&el.contains(hit)&&[[x-4,y],[x+4,y],[x,y-4],[x,y+4]].every(([px,py])=>document.elementFromPoint(px,py)?.closest('button.t-fan-card')===hit))return {x,y}
      }
      throw new Error('No visible selectable card')
    })
    await page.mouse.click(point.x,point.y)
  }
  if(failure){await page.getByText(/本机空间不足或不可用/).first().waitFor({state:'attached'});return}
  await page.locator('dialog.t-ring-dialog').waitFor({state:'detached'})
  await page.getByRole('button',{name:`${position}，已选定`,exact:true}).waitFor({state:'visible'})
  await page.waitForFunction(()=>!document.querySelector('.t-flying-card')&&!document.querySelector('.tarot-shell[aria-busy="true"]'))
}
try{
  for(const [width,height] of [[320,700],[390,844],[430,932]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'})
    const page=await context.newPage(),errors=[],remote=[];currentPage=page
    page.on('pageerror',e=>errors.push(e.message))
    page.on('request',r=>{if(!r.url().startsWith(origin))remote.push(r.url())})
    await page.goto(origin+'/timeline');await page.getByRole('button',{name:'星语塔罗',exact:true}).click()
    await page.getByRole('button',{name:/二选一 看看/}).waitFor()
    assert.equal(await page.locator('.floating-nav:visible').count(),0)
    await settle(page);await page.screenshot({path:join(output,`home-${width}.png`)})
    await page.getByRole('button',{name:/二选一 看看/}).click()
    await page.getByRole('textbox',{name:'你想问些什么？'}).fill('接下来我应该如何比较这两个方案？')
    await page.getByRole('textbox',{name:'选项 A'}).fill('继续在当前岗位积累经验')
    await page.getByRole('textbox',{name:'选项 B'}).fill('尝试一个新的工作方向')
    await page.getByText('补充背景',{exact:false}).first().click()
    await page.getByRole('textbox',{name:'你在意的细节'}).fill('我比较在意长期成长与生活节奏。')
    await page.getByRole('button',{name:/去洗牌/}).click()
    await page.getByRole('button',{name:'开始洗牌',exact:true}).click()
    await page.getByRole('button',{name:'去切牌',exact:true}).click()
    await page.getByRole('button',{name:'切牌',exact:true}).click()
    await page.getByRole('button',{name:'去抽牌',exact:true}).click()
    await pick(page,'B 的挑战',{drag:true,zoom:true})
    const currentId=page.url().split('/').at(-2)
    const allBefore=await getReadings(page)
    assert.equal(allBefore.length,1,`one selection should create one reading: ${JSON.stringify(allBefore.map(r=>({id:r.id,stage:r.stage,drawn:r.drawn.length})))}`)
    const before=allBefore.find(r=>r.id===currentId)
    assert.equal(before.drawn[0].positionId,'b-challenge')
    await page.reload()
    await page.getByRole('button',{name:'B 的挑战，已选定',exact:true}).waitFor()
    const restored=(await getReadings(page)).find(r=>r.id===currentId)
    assert.deepEqual(restored.drawn,before.drawn,'reload must preserve selected card identity and direction')
    await page.getByRole('button',{name:'‹ 切牌',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'再切一次',exact:true}).isDisabled(),true)
    await page.getByRole('button',{name:'去抽牌',exact:true}).click()
    for(const position of ['当下处境','A 的助力','A 的挑战','B 的助力'])await pick(page,position)
    await page.getByRole('button',{name:'翻开我的牌',exact:true}).click()
    await page.getByRole('button',{name:/聊聊这组牌/}).waitFor({state:'visible'})
    await page.waitForFunction(()=>!document.querySelector('.t-ritual button.t-primary:disabled'));await settle(page)
    const fits=await page.locator('.t-ritual').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth,main:el.closest('main').clientHeight}))
    assert.ok(fits.scroll<=fits.height+1,JSON.stringify(fits));assert.ok(fits.scrollWidth<=fits.width,JSON.stringify(fits))
    await page.screenshot({path:join(output,`revealed-${width}.png`)})
    await page.locator('.t-slot-button').first().click()
    await page.getByRole('heading',{name:'这张牌在说什么'}).waitFor()
    await page.getByRole('button',{name:'回到牌阵',exact:true}).click()
    await page.locator('dialog.t-card-sheet[open]').waitFor({state:'detached'})
    await settle(page)
    await page.getByRole('button',{name:/聊聊这组牌/}).click()
    await page.waitForURL(/\/chat$/)
    await page.getByText('AI 解读尚未接通。',{exact:false}).waitFor()
    await page.getByRole('button',{name:'☆ 收藏',exact:true}).click()
    await page.getByRole('button',{name:'笔记',exact:true}).click()
    await page.getByRole('textbox',{name:'显示标题'}).fill('两条路的取舍')
    await page.getByRole('textbox',{name:'个人笔记 · 不发送给 AI'}).fill('先了解真实工作内容，再做选择。')
    await page.getByRole('button',{name:'个人笔记',exact:true}).click()
    await page.locator('.t-local-note').waitFor({state:'hidden'})
    await page.reload()
    const history=(await getReadings(page)).find(r=>r.id===currentId)
    assert.equal(history.isFavorite,true);assert.equal(history.note,'先了解真实工作内容，再做选择。')
    await page.goto(origin+'/tarot/history')
    await page.getByRole('textbox',{name:'搜索星语问题、选项或个人笔记'}).fill('真实工作内容')
    await page.getByRole('heading',{name:'两条路的取舍'}).waitFor()
    assert.equal(remote.length,0,`offline flow must not issue external requests: ${remote.join(',')}`)
    assert.deepEqual(errors,[])
    results.push({width,height,checks:'choice arbitrary positions, drag, pinch, reload, lock, reveal fit, card detail, favorite, note, search, zero upload'})
    await context.close()
  }
  // All fixed spreads, storage failure rollback and the other two themes.
  const context=await browser.newContext({viewport:{width:320,height:700},reducedMotion:'reduce'}),page=await context.newPage();currentPage=page
  await page.goto(origin+'/tarot')
  for(const [label,count] of [['一张指引',1],['近期状态',3],['购物决策',4]]){
    await page.getByRole('button',{name:new RegExp(label)}).click()
    await page.getByRole('textbox',{name:'你想问些什么？'}).fill('我现在可以采取什么具体行动？')
    await page.getByRole('button',{name:/去洗牌/}).click()
    await page.getByRole('button',{name:'开始洗牌',exact:true}).click();await page.getByRole('button',{name:'去切牌',exact:true}).click();await page.getByRole('button',{name:'切牌',exact:true}).click();await page.getByRole('button',{name:'去抽牌',exact:true}).click()
    if(count===1){
      await page.evaluate(()=>{window.__tarotOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Test quota failure','QuotaExceededError')}})
      await pick(page,'此刻提醒',{failure:true})
      assert.equal((await getReadings(page)).find(r=>r.stage==='drawing').drawn.length,0,'failed commit must not consume card')
      await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__tarotOriginalPut;delete window.__tarotOriginalPut})
      await page.getByRole('button',{name:'‹ 牌阵',exact:true}).click()
    }
    for(let i=0;i<count;i++){
      const position=await page.locator('.t-slot').nth(i).locator('.t-position-label').textContent()
      await pick(page,position)
    }
    await page.getByRole('button',{name:'翻开我的牌',exact:true}).click()
    const fits=await page.locator('.t-ritual').evaluate(el=>el.scrollHeight<=el.clientHeight+1)
    assert.ok(fits,`${count}-card spread must fit 320x700`)
    await page.getByRole('button',{name:'‹ 返回',exact:true}).click()
  }
  // Revising an unfinished reading starts a clean draft and removes the old deck atomically.
  await page.getByRole('button',{name:/一张指引/}).click()
  await page.getByRole('textbox',{name:'你想问些什么？'}).fill('修改前的问题内容应该保留吗？')
  await page.getByRole('button',{name:/去洗牌/}).click()
  const originalId=page.url().split('/').at(-2)
  await page.getByRole('button',{name:'修改问题',exact:true}).click()
  await page.locator('ion-alert').getByRole('button',{name:'修改问题',exact:true}).click()
  await page.getByRole('textbox',{name:'你想问些什么？'}).waitFor({state:'visible'})
  assert.equal(await page.getByRole('textbox',{name:'你想问些什么？'}).inputValue(),'修改前的问题内容应该保留吗？')
  const drafts=await getReadings(page),draft=drafts.find(r=>r.stage==='draft')
  assert.ok(draft&&draft.id!==originalId);assert.equal(draft.deckOrder.length,0);assert.equal(drafts.some(r=>r.id===originalId),false)
  await page.goto(origin+'/tarot/history');await settle(page)
  const countBeforeDelete=(await getReadings(page)).length
  await page.getByRole('button',{name:'删除',exact:true}).first().click()
  await page.locator('ion-alert').getByRole('button',{name:'删除',exact:true}).click()
  await page.waitForFunction(count=>new Promise(resolve=>{
    const request=indexedDB.open('shiguangjian.tarot.v1',1)
    request.onsuccess=()=>{const db=request.result,get=db.transaction('readings').objectStore('readings').count();get.onsuccess=()=>{db.close();resolve(get.result===count-1)}}
  }),countBeforeDelete)
  await page.goto(origin+'/tarot')
  for(const themeId of ['mist-paper','sunset-post']){
    await page.getByRole('heading',{name:/把一个问题/}).waitFor({state:'visible'});await settle(page)
    await page.evaluate(theme=>{
      const key='shiguangjian.settings.v1',settings=JSON.parse(localStorage.getItem(key)||'{}')
      localStorage.setItem(key,JSON.stringify({...settings,themeId:theme,themeVersion:'1.0.0'}))
    },themeId)
    await page.reload()
    await page.getByRole('heading',{name:/把一个问题/}).waitFor({state:'visible'});await settle(page)
    await page.screenshot({path:join(output,`theme-${themeId}.png`)})
  }
  await context.close()
  await writeFile(join(output,'results.json'),JSON.stringify({results,failures},null,2))
  console.log(JSON.stringify({passed:results.length+7,output,results},null,2))
}catch(error){
  if(currentPage&&!currentPage.isClosed()){
    await currentPage.screenshot({path:join(output,'failure.png')})
    console.error('UI FAILURE',currentPage.url(),await currentPage.locator('body').innerText(),JSON.stringify((await getReadings(currentPage)).map(r=>({id:r.id,stage:r.stage,drawn:r.drawn.length,revision:r.revision}))))
  }
  throw error
}finally{await browser.close()}
