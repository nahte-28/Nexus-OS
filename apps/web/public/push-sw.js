/*
 * NEXUS web push, loaded into the service worker (see workbox.importScripts in vite.config.ts).
 *
 * The pc encrypts every notification for this browser's device key before it goes to the server,
 * so a push only carries ciphertext. Here it is opened with the device key from IndexedDB (the
 * same "nexus-connect-v1" scheme as packages/core/src/connectCrypto.ts) and shown, also when NEXUS
 * itself is closed. Chrome on Android passes it on to the watch.
 */
;(function (sw) {
  var INFO = 'nexus-connect-v1'
  var ECDH = { name: 'ECDH', namedCurve: 'P-256' }
  var encoder = new TextEncoder()

  function fromBase64(value) {
    var binary = atob(value)
    var bytes = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length)
    out.set(a)
    out.set(b, a.length)
    return out
  }

  /** This browser's Connect identity, as NEXUS stored it (database "nexus", store "connect"). */
  function readIdentity() {
    return new Promise(function (resolve) {
      var req = indexedDB.open('nexus')
      req.onerror = function () {
        resolve(null)
      }
      req.onsuccess = function () {
        var db = req.result
        if (!db.objectStoreNames.contains('connect')) {
          db.close()
          return resolve(null)
        }
        var get = db.transaction('connect', 'readonly').objectStore('connect').get('identity')
        get.onsuccess = function () {
          db.close()
          resolve(get.result || null)
        }
        get.onerror = function () {
          db.close()
          resolve(null)
        }
      }
    })
  }

  async function decrypt(identity, envelope) {
    var ephemeralRaw = fromBase64(envelope.ephemeralKey)
    if (ephemeralRaw.length !== 65 || ephemeralRaw[0] !== 4) throw new Error('Ongeldige sleutel')
    var ephemeral = await crypto.subtle.importKey('raw', ephemeralRaw, ECDH, true, [])
    var secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephemeral }, identity.privateKey, 256)
    var hkdf = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
    var key = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: concat(ephemeralRaw, fromBase64(identity.publicKey)), info: encoder.encode(INFO) },
      hkdf,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    var plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: encoder.encode(identity.deviceId) },
      key,
      fromBase64(envelope.ciphertext),
    )
    return JSON.parse(new TextDecoder().decode(plaintext))
  }

  /** What to show for one push; a push that cannot be read still shows a short notice. */
  async function noticeFor(data) {
    var fallback = { title: 'NEXUS', options: { body: 'Je hebt een herinnering. Open NEXUS om ze te lezen.', icon: '/icon-192.png', tag: 'nexus-push' } }
    if (!data || typeof data !== 'object') return fallback
    var tag = typeof data.ref === 'string' ? data.ref.slice(0, 300) : 'nexus-push'
    fallback.options.tag = tag
    try {
      var identity = await readIdentity()
      if (!identity || (data.to && data.to !== identity.deviceId)) return fallback
      var payload = await decrypt(identity, data)
      if (!payload || typeof payload.title !== 'string') return fallback
      return {
        title: payload.title.slice(0, 120),
        options: {
          body: typeof payload.text === 'string' ? payload.text.slice(0, 1000) : 'Herinnering van NEXUS',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: tag,
          timestamp: typeof payload.postedAt === 'number' ? payload.postedAt : Date.now(),
          data: { url: '/' },
        },
      }
    } catch (err) {
      return fallback
    }
  }

  sw.addEventListener('push', function (event) {
    var data = null
    try {
      data = event.data ? event.data.json() : null
    } catch (err) {
      data = null
    }
    event.waitUntil(
      noticeFor(data).then(function (n) {
        return sw.registration.showNotification(n.title, n.options)
      }),
    )
  })

  sw.addEventListener('notificationclick', function (event) {
    event.notification.close()
    event.waitUntil(
      sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
        for (var i = 0; i < windows.length; i++) if ('focus' in windows[i]) return windows[i].focus()
        return sw.clients.openWindow('/')
      }),
    )
  })

  sw.nexusPush = { noticeFor: noticeFor }
})(self)
