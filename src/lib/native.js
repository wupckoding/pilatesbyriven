// Integración con el app de iPhone (Capacitor). En el navegador todo esto queda inactivo.
import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // 'ios' | 'android' | 'web'

const GOOGLE_IOS = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || ''
const GOOGLE_WEB = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || ''

/** Apple solo dentro del app de iPhone; Google nativo cuando el app se compiló con su ID de cliente iOS. */
export const nativeAppleAvailable = platform === 'ios'
export const nativeGoogleAvailable = isNative && Boolean(GOOGLE_IOS)

let ready
async function socialLogin() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  if (!ready) {
    ready = SocialLogin.initialize({
      apple: {},
      ...(GOOGLE_IOS ? { google: { iOSClientId: GOOGLE_IOS, ...(GOOGLE_WEB ? { iOSServerClientId: GOOGLE_WEB } : {}) } } : {}),
    }).catch((err) => { ready = null; throw err })
  }
  await ready
  return SocialLogin
}

// La persona cerró la ventana de Apple o de Google: no es un error que haya que mostrar.
export const isCancel = (err) => /cancel|1001|12501|-5/i.test(`${err?.code || ''} ${err?.message || ''}`)

/** Ventana nativa "Iniciar sesión con Apple". Devuelve lo que el servidor necesita para validar. */
export async function appleSignIn() {
  const SocialLogin = await socialLogin()
  const { result } = await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'] } })
  if (!result?.idToken) throw new Error('Apple no devolvió la credencial')
  return {
    identityToken: result.idToken,
    // Sirve para poder revocar el acceso si la persona elimina su cuenta.
    authorizationCode: result.authorizationCode || result.accessToken?.token || undefined,
    // Apple manda el nombre solo la primera vez que la persona autoriza el app.
    fullName: [result.profile?.givenName, result.profile?.familyName].filter(Boolean).join(' ') || undefined,
  }
}

/** Ventana nativa de Google. Devuelve el token de identidad (JWT). */
export async function googleSignIn() {
  const SocialLogin = await socialLogin()
  const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } })
  if (!result?.idToken) throw new Error('Google no devolvió la credencial')
  return result.idToken
}

/** Cierra la sesión de Apple/Google del dispositivo para que la próxima vez se pueda elegir otra cuenta. */
export async function nativeSignOut() {
  if (!isNative) return
  try {
    const SocialLogin = await socialLogin()
    await SocialLogin.logout({ provider: 'google' }).catch(() => {})
  } catch { /* sin plugin */ }
}

/** Al abrir el app: barra de estado oscura sobre el fondo crema y ocultar la pantalla de arranque nativa. */
export async function startNative() {
  if (!isNative) return
  document.documentElement.classList.add('native')
  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'), import('@capacitor/splash-screen'),
  ])
  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  // La pantalla de arranque nativa y el primer cuadro de la apertura son iguales: el cambio no se nota.
  SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})
}

/** Guarda un archivo (CSV, comprobante) y abre la hoja de compartir de iOS: Archivos, AirDrop, WhatsApp… */
export async function shareFile(blob, filename) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  const safe = filename.replace(/[^\w.\-]+/g, '_')
  const { uri } = await Filesystem.writeFile({ path: safe, data, directory: Directory.Cache })
  await Share.share({ title: safe, files: [uri] })
}
