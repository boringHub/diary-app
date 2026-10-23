import { deviceKeyAuth } from './deviceKeyAuth'
import { NotifyApiError, sha256Hex, type DeviceIdentity, type DeviceSigner } from './notifyApiClient'

// Shared canonical signature. This function does not register or query device status.
export async function signedHeaders(method: string,path: string,body: string,identity: DeviceIdentity,signer: DeviceSigner = deviceKeyAuth) {
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID()
  const canonical=['v1',method.toUpperCase(),path,identity.deviceId,timestamp,nonce,await sha256Hex(body)].join('\n')
  const bytes=new TextEncoder().encode(canonical)
  let binary=''
  for(const byte of bytes)binary+=String.fromCharCode(byte)
  let signature: string
  try{signature=await signer.sign(identity.alias,btoa(binary))}
  catch(error){const code=error instanceof Error?error.message:String(error);throw new NotifyApiError(code,code==='KEYSTORE_UNAVAILABLE'||code==='SIGN_FAILED')}
  return { ...(body?{'content-type':'application/json'}:{}),'x-device-id':identity.deviceId,'x-timestamp':timestamp,'x-nonce':nonce,'x-signature':signature }
}
