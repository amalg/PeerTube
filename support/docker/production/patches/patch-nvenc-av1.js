'use strict'

// Idempotent runtime patch for `peertube-plugin-hardware-transcode-nvenc`.
//
// The plugin unconditionally adds `-hwaccel cuda` to the ffmpeg input, forcing
// CUDA hardware *decode*. beefcake's Tesla T4 GPUs have no AV1 hardware decoder
// (only the L4 does), and ffmpeg 7.x hard-errors instead of falling back to
// software decode -- so every AV1 source video fails transcoding with
// "ffmpeg exited with code 69 / Conversion failed".
//
// This makes `buildInitOptions()` codec-aware: AV1 inputs are software-decoded
// (libdav1d) and still NVENC-encoded; H.264/H.265/VP9 keep hardware decode.
//
// The plugin lives in the persistent /data volume (installed via PeerTube's
// plugin manager), so it cannot be patched at image build time. entrypoint.sh
// runs this on every container start. It is idempotent (marker check) and
// non-fatal: if the plugin is absent or its source has changed shape, it logs
// and exits 0 without blocking startup.

const fs = require('fs')

const PLUGIN_MAIN =
  '/data/plugins/node_modules/peertube-plugin-hardware-transcode-nvenc/dist/main.js'

const ORIGINAL_FN = `function buildInitOptions() {
    if (pluginSettings.hardwareDecode) {
        return [
            '-hwaccel cuda',
            '-hwaccel_output_format cuda'
        ];
    }
    else {
        return [
            '-hwaccel cuda'
        ];
    }
}`

const PATCHED_FN = `// Codecs with no NVDEC hardware decoder on Turing (Tesla T4). Forcing
// '-hwaccel cuda' on these makes ffmpeg fail instead of falling back to
// software decode, so we CPU-decode them and still NVENC-encode.
const HW_DECODE_UNSUPPORTED = new Set(['av1']);
function getInputVideoCodec(params) {
    const streams = params?.inputProbe?.streams;
    if (!Array.isArray(streams))
        return undefined;
    const video = streams.find(s => s.codec_type === 'video');
    return video?.codec_name;
}
function buildInitOptions(inputCodec) {
    if (inputCodec && HW_DECODE_UNSUPPORTED.has(inputCodec)) {
        // No CUDA decode for this codec; let ffmpeg software-decode the input.
        return [];
    }
    if (pluginSettings.hardwareDecode) {
        return [
            '-hwaccel cuda',
            '-hwaccel_output_format cuda'
        ];
    }
    else {
        return [
            '-hwaccel cuda'
        ];
    }
}`

function main () {
  let src
  try {
    src = fs.readFileSync(PLUGIN_MAIN, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[patch-nvenc-av1] plugin not installed; nothing to patch')
      return
    }
    throw err
  }

  if (src.includes('HW_DECODE_UNSUPPORTED')) {
    console.log('[patch-nvenc-av1] already patched; skipping')
    return
  }

  if (!src.includes(ORIGINAL_FN)) {
    console.log('[patch-nvenc-av1] buildInitOptions() not in expected form; skipping (plugin version changed?)')
    return
  }

  // Replace the function definition, then update both call sites to pass the
  // input codec. After the first replace, the only remaining `buildInitOptions()`
  // occurrences are the call sites (the new definition is `buildInitOptions(inputCodec)`).
  src = src.replace(ORIGINAL_FN, PATCHED_FN)
  src = src.split('buildInitOptions()').join('buildInitOptions(getInputVideoCodec(params))')

  fs.writeFileSync(PLUGIN_MAIN, src)
  console.log('[patch-nvenc-av1] applied AV1 software-decode patch')
}

try {
  main()
} catch (err) {
  // Never block container startup over this best-effort patch.
  console.error('[patch-nvenc-av1] failed:', err && err.message ? err.message : err)
}
