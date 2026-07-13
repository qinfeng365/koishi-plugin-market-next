<template>
  <div class="koishi-eye-splash" aria-hidden="true">
    <div ref="container" :class="['koishi-eye-splash__canvas', { 'is-ready': ready }]"></div>
    <svg ref="nodeLayer" class="koishi-eye-splash__nodes" viewBox="0 0 2048 2048" preserveAspectRatio="xMidYMid slice">
      <circle v-for="node in nodePoints" :key="node.frame" class="koishi-eye-splash__node" :cx="node.x" :cy="node.y" r="7"></circle>
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { AnimationItem } from 'lottie-web'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits<{
  ready: [],
  complete: [],
}>()

const container = ref<HTMLElement>()
const nodeLayer = ref<SVGSVGElement>()
const ready = ref(false)

const nodePoints = [
  { frame: 104, x: 963, y: 1240 },
  { frame: 139, x: 1049, y: 1199 },
  { frame: 168, x: 1133, y: 1151 },
  { frame: 198, x: 1170, y: 1170 },
  { frame: 232, x: 1199, y: 1049 },
  { frame: 268, x: 1217, y: 987 },
]

let animation: AnimationItem | undefined
let disposed = false
let lastFrame = 0
let firedNodes = new Set<number>()
let readyEmitted = false
let completeEmitted = false
let completionFired = false
let completionTimer: ReturnType<typeof setTimeout> | undefined
const nodeAnimations = new Set<Animation>()

function lightNode(index: number) {
  const element = nodeLayer.value?.querySelectorAll<SVGCircleElement>('.koishi-eye-splash__node')[index]
  if (!element) return
  const effect = element.animate([
    { opacity: 0, transform: 'scale(0.3)' },
    { opacity: 0.95, transform: 'scale(1)', offset: 0.35 },
    { opacity: 0, transform: 'scale(1.75)' },
  ], {
    duration: 180,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  })
  nodeAnimations.add(effect)
  effect.addEventListener('finish', () => nodeAnimations.delete(effect), { once: true })
}

function resetEnhancements() {
  firedNodes = new Set()
  completionFired = false
  container.value?.classList.remove('is-complete', 'is-extinguishing')
}

function updateEnhancements() {
  if (!animation) return
  const frame = animation.currentFrame + animation.firstFrame
  if (frame < lastFrame) resetEnhancements()

  nodePoints.forEach((node, index) => {
    if (frame < node.frame || firedNodes.has(index)) return
    firedNodes.add(index)
    lightNode(index)
  })

  if (frame >= 287 && !readyEmitted) {
    readyEmitted = true
    emit('ready')
  }

  if (frame >= 543 && !completeEmitted) {
    completeEmitted = true
    emit('complete')
  }

  if (frame >= 543 && !completionFired && container.value) {
    completionFired = true
    clearTimeout(completionTimer)
    container.value.classList.add('is-complete')
    container.value.animate([
      { filter: 'brightness(1)' },
      { filter: 'brightness(1.13)', offset: 0.45 },
      { filter: 'brightness(1)' },
    ], {
      duration: 260,
      easing: 'ease-out',
    })
    completionTimer = setTimeout(() => container.value?.classList.remove('is-complete'), 280)
  }

  container.value?.classList.toggle('is-extinguishing', frame >= 700)
  lastFrame = frame
}

function updatePlayback() {
  if (!animation) return
  if (document.hidden) animation.pause()
  else animation.play()
}

onMounted(async () => {
  try {
    const [{ default: lottie }, { default: splashData }] = await Promise.all([
      import('lottie-web/build/player/esm/lottie_light.min.js'),
      import('./koishi-eye-splash.json'),
    ])
    if (disposed || !container.value) return

    animation = lottie.loadAnimation({
      animationData: splashData,
      container: container.value,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid slice',
      },
    })

    animation.addEventListener('DOMLoaded', () => {
      if (disposed || !animation) return
      animation.setSpeed(1.12)
      animation.playSegments([25, 880], true)
      ready.value = true
    })

    animation.addEventListener('enterFrame', updateEnhancements)

    document.addEventListener('visibilitychange', updatePlayback)
  } catch {
    // The copy remains usable if the optional animation cannot be loaded.
    emit('ready')
    emit('complete')
  }
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(completionTimer)
  document.removeEventListener('visibilitychange', updatePlayback)
  nodeAnimations.forEach(effect => effect.cancel())
  nodeAnimations.clear()
  animation?.destroy()
  animation = undefined
})
</script>

<style lang="scss">
.koishi-eye-splash {
  position: relative;
  pointer-events: none;
}

.koishi-eye-splash__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.koishi-eye-splash__canvas {
  opacity: 0;
  transition: opacity 0.25s ease;

  &.is-ready {
    opacity: 1;
  }

  svg {
    width: 100% !important;
    height: 100% !important;
  }

  .t8-oob-splash-data-a {
    stroke: color-mix(in srgb, var(--el-text-color-primary) 90%, var(--k-color-primary));
    filter: drop-shadow(0 0 2px color-mix(in srgb, var(--el-text-color-primary) 22%, transparent));
  }

  .t8-oob-splash-data-b {
    stroke: color-mix(in srgb, var(--el-text-color-primary) 90%, var(--k-color-primary));
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--el-text-color-primary) 24%, transparent));
    transition: filter 0.18s ease;
  }

  .t8-oob-splash-data-a,
  .t8-oob-splash-data-b {
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &.is-complete .t8-oob-splash-data-b {
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--k-color-primary) 32%, transparent));
  }

  &.is-extinguishing .t8-oob-splash-data-b {
    filter: drop-shadow(0 0 2px color-mix(in srgb, var(--el-text-color-primary) 18%, transparent));
  }
}

.koishi-eye-splash__nodes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.koishi-eye-splash__node {
  fill: color-mix(in srgb, var(--k-color-primary) 58%, var(--el-text-color-primary));
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--k-color-primary) 38%, transparent));
}

@media (prefers-reduced-motion: reduce) {
  .koishi-eye-splash__canvas {
    transition: none;
  }
}
</style>
