import 'fake-indexeddb/auto'

// jsdom's Blob has no arrayBuffer(), text() or stream(); browsers do.
const read = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function () {
  return read(this)
}
if (!Blob.prototype.text) Blob.prototype.text = async function () {
  return new TextDecoder().decode(await read(this))
}
if (!Blob.prototype.stream) Blob.prototype.stream = function () {
  const blob = this
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(new Uint8Array(await read(blob)))
      controller.close()
    },
  })
}
