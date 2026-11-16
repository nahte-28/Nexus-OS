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

  function toBase64(bytes) {
    var binary = ''
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
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

  /** Seals [plaintext] for one device, like encryptFor in packages/core/src/connectCrypto.ts. */
  async function encryptFor(publicKey, deviceId, plaintext) {
    var recipientRaw = fromBase64(publicKey)
    if (recipientRaw.length !== 65 || recipientRaw[0] !== 4) throw new Error('Ongeldige sleutel')
    var recipient = await crypto.subtle.importKey('raw', recipientRaw, ECDH, true, [])
    var ephemeral = await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])
    var ephemeralRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
    var secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: recipient }, ephemeral.privateKey, 256)
    var hkdf = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
    var key = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: concat(ephemeralRaw, recipientRaw), info: encoder.encode(INFO) },
      hkdf,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    )
    var iv = crypto.getRandomValues(new Uint8Array(12))
    var ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: encoder.encode(deviceId) }, key, encoder.encode(plaintext))
    return { ephemeralKey: toBase64(ephemeralRaw), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
  }

  // Snel antwoorden on a privébericht or teamchat notice; the same texts as QUICK_REPLIES in
  // packages/core/src/pushActions.ts.
  var REPLIES = { 'reply-ok': 'Oké 👍', 'reply-later': 'Ik reageer straks.' }

  /**
   * A privébericht or teamchat message, planned by the database (supabase/migrations/
   * 20261116090000_message_push.sql). A privébericht is opened here with the device key; a
   * teamchat message comes as text. The one-time token is for the two quick replies.
   */
  async function messageNotice(data, extra) {
    var kind = extra.kind
    var tag = typeof extra.tag === 'string' ? extra.tag.slice(0, 300) : typeof data.ref === 'string' ? data.ref.slice(0, 300) : 'nexus-push'
    var body = kind === 'team' && typeof extra.text === 'string' ? extra.text.slice(0, 1000) : 'Open NEXUS om het bericht te lezen.'
    if (kind === 'dm' && typeof data.ciphertext === 'string') {
      try {
        var identity = await readIdentity()
        if (identity && (!data.to || data.to === identity.deviceId)) {
          var sealed = await decrypt(identity, data)
          if (sealed && sealed.v === 1 && typeof sealed.text === 'string') body = sealed.text.slice(0, 1000)
        }
      } catch (err) {
        // The short text above stays.
      }
    }
    var token = typeof extra.reply === 'string' && /^[0-9a-f]{64}$/.test(extra.reply) ? extra.reply : null
    var title = typeof extra.title === 'string' && extra.title ? extra.title.slice(0, 120) : 'NEXUS'
    return {
      title: title,
      options: {
        body: body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: tag,
        renotify: true,
        timestamp: Date.now(),
        actions: token
          ? Object.keys(REPLIES).map(function (a) {
              return { action: a, title: REPLIES[a] }
            })
          : [],
        data: { url: '/', ref: tag, reply: token, kind: kind, title: title },
      },
    }
  }

  /** What to show for one push; a push that cannot be read still shows a short notice. */
  async function noticeFor(data) {
    var fallback = { title: 'NEXUS', options: { body: 'Je hebt een herinnering. Open NEXUS om ze te lezen.', icon: '/icon-192.png', tag: 'nexus-push' } }
    if (!data || typeof data !== 'object') return fallback
    if (data.extra && typeof data.extra === 'object' && (data.extra.kind === 'dm' || data.extra.kind === 'team')) return messageNotice(data, data.extra)
    var tag = typeof data.ref === 'string' ? data.ref.slice(0, 300) : 'nexus-push'
    fallback.options.tag = tag
    try {
      var identity = await readIdentity()
      if (!identity || (data.to && data.to !== identity.deviceId)) return fallback
      var payload = await decrypt(identity, data)
      if (!payload || typeof payload.title !== 'string') return fallback
      // Meldingsknoppen: Klaar and Later, with the token the pc put in the encrypted notice.
      var token = typeof payload.actionToken === 'string' ? payload.actionToken : null
      var actions = token && Array.isArray(payload.actions) ? payload.actions.filter(function (a) { return a === 'done' || a === 'later' }) : []
      return {
        title: payload.title.slice(0, 120),
        options: {
          body: typeof payload.text === 'string' ? payload.text.slice(0, 1000) : 'Herinnering van NEXUS',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: tag,
          timestamp: typeof payload.postedAt === 'number' ? payload.postedAt : Date.now(),
          actions: actions.map(function (a) { return { action: a, title: a === 'done' ? 'Klaar' : 'Later' } }),
          data: { url: '/', ref: tag, token: actions.length ? token : null },
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

  /** Opens NEXUS, or focuses it, at the record [ref] is about. */
  function openNexus(ref) {
    return sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        if ('focus' in windows[i]) {
          if (ref) windows[i].postMessage({ type: 'nexus-open', ref: ref })
          return windows[i].focus()
        }
      }
      return sw.clients.openWindow(ref ? '/?melding=' + encodeURIComponent(ref) : '/')
    })
  }

  /** Klaar or Later: the database does it; when that fails, NEXUS opens so you can do it there. */
  function sendAction(action, data) {
    return fetch('/api/push-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: data.ref, token: data.token, action: action }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('mislukt')
      })
      .catch(function () {
        return openNexus(data.ref)
      })
  }

  async function postReply(body) {
    var r = await fetch('/api/push-reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    var answer = await r.json().catch(function () {
      return null
    })
    if (!r.ok || !answer) throw new Error('mislukt')
    return answer
  }

  /**
   * Sends a quick reply: a privébericht is sealed here for every device of both of you first.
   * When that fails, NEXUS opens at the conversation so you can answer there.
   */
  async function sendReply(action, data) {
    var text = REPLIES[action]
    try {
      var envelopes = null
      if (data.kind === 'dm') {
        var keys = await postReply({ step: 'keys', token: data.reply })
        var plain = JSON.stringify({ v: 1, text: text })
        envelopes = {}
        var devices = Array.isArray(keys.devices) ? keys.devices.slice(0, 22) : []
        for (var i = 0; i < devices.length; i++) {
          try {
            envelopes[devices[i].deviceId] = await encryptFor(devices[i].publicKey, devices[i].deviceId, plain)
          } catch (err) {
            // A device with a broken key just cannot read this one answer.
          }
        }
        if (Object.keys(envelopes).length === 0) throw new Error('geen sleutels')
      }
      await postReply({ step: 'send', token: data.reply, text: text, envelopes: envelopes })
      await sw.registration.showNotification(data.title || 'NEXUS', { body: 'Je antwoordde: ' + text, icon: '/icon-192.png', badge: '/icon-192.png', tag: data.ref, silent: true, data: { url: '/', ref: data.ref } })
    } catch (err) {
      await openNexus(data.ref)
    }
  }

  // The tag is the notification's ref (deadline:<id>@…); NEXUS opens the record it is about.
  sw.addEventListener('notificationclick', function (event) {
    event.notification.close()
    var data = event.notification.data || {}
    if (REPLIES[event.action] && typeof data.reply === 'string' && typeof data.ref === 'string') {
      event.waitUntil(sendReply(event.action, data))
      return
    }
    if ((event.action === 'done' || event.action === 'later') && typeof data.token === 'string' && typeof data.ref === 'string') {
      event.waitUntil(sendAction(event.action, data))
      return
    }
    event.waitUntil(openNexus(typeof event.notification.tag === 'string' ? event.notification.tag : ''))
  })

  sw.nexusPush = { noticeFor: noticeFor, sendAction: sendAction, sendReply: sendReply }
})(self)
