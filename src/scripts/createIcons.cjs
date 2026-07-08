#!/usr/bin/env node
// Genera icon-192.png e icon-512.png en public/ usando solo módulos built-in.
// No requiere ningún paquete npm externo.
const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── CRC32 (requerido por el formato PNG) ──────────────────────────────────────
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[i] = c
}
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ── Chunk PNG ─────────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const tb  = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([len, tb, data, crcBuf])
}

// ── Genera PNG de color sólido + texto "DP" centrado ─────────────────────────
function createIcon(size, bgR, bgG, bgB) {
  // IHDR: color type 2 = RGB
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  // Pixel grid — fondo sólido naranja
  const stride = size * 3
  const pixels = Buffer.alloc(size * stride)
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = bgR; pixels[i + 1] = bgG; pixels[i + 2] = bgB
  }

  // Dibujar letras "DP" como bloques de píxeles blancos en el centro
  // Usa una fuente bitmap 5×7 escalada al tamaño del icono
  const glyphs = {
    D: [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
    P: [[1,1,0],[1,0,1],[1,1,0],[1,0,0],[1,0,0]],
  }
  const glyphScale = Math.floor(size / 14)
  const glyphW = 3 * glyphScale, glyphH = 5 * glyphScale, gap = glyphScale
  const totalW = glyphW * 2 + gap
  const startX = Math.floor((size - totalW) / 2)
  const startY = Math.floor((size - glyphH) / 2)

  const drawGlyph = (letter, offsetX) => {
    const pattern = glyphs[letter]
    pattern.forEach((row, gy) => {
      row.forEach((on, gx) => {
        if (!on) return
        for (let py = 0; py < glyphScale; py++) {
          for (let px = 0; px < glyphScale; px++) {
            const x = offsetX + gx * glyphScale + px
            const y = startY + gy * glyphScale + py
            if (x >= 0 && x < size && y >= 0 && y < size) {
              const idx = (y * size + x) * 3
              pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255
            }
          }
        }
      })
    })
  }
  drawGlyph('D', startX)
  drawGlyph('P', startX + glyphW + gap)

  // Añadir filter byte (0 = None) al inicio de cada scanline
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const idat = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Main ──────────────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '..', '..', 'public')

for (const size of [192, 512]) {
  const buf = createIcon(size, 0xD4, 0x52, 0x1A)   // #FF4713 naranja del parque
  const out = path.join(publicDir, `icon-${size}.png`)
  fs.writeFileSync(out, buf)
  console.log(`✓ public/icon-${size}.png  (${buf.length} bytes)`)
}
