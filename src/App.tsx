import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import './App.css'

type UploadedMedia = {
  name: string
  url: string
  sizeLabel: string
  type: string
}

type TimelineClip = UploadedMedia & {
  id: string
  duration: number
  track: number
}

type ClipWithLayout = TimelineClip & {
  start: number
  layoutStart: number
  widthPercent: number
  safeDuration: number
}

const MIN_CLIP_LENGTH = 0.01

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`
}

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const readVideoDuration = (src: string) =>
  new Promise<number>((resolve) => {
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.src = src
    probe.onloadedmetadata = () => {
      resolve(probe.duration || 0)
      probe.pause()
      probe.remove()
    }
    probe.onerror = () => {
      resolve(0)
      probe.remove()
    }
  })

function App() {
  const [clips, setClips] = useState<TimelineClip[]>([])
  const [activeClipId, setActiveClipId] = useState<string | null>(null)
  const [timelineProgress, setTimelineProgress] = useState(0)
  const [isDragActive, setIsDragActive] = useState(false)
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null)
  const [dropState, setDropState] = useState<
    { track: number; targetId: string | null; position: 'before' | 'after' | 'end' } | null
  >(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const objectUrlsRef = useRef(new Set<string>())
  const pendingSeekRef = useRef<{ clipId: string; time: number } | null>(null)

  const clipLayouts = useMemo(() => {
    let actualCursor = 0
    let layoutCursor = 0
    const layoutTotal =
      clips.reduce((sum, clip) => sum + (clip.duration || MIN_CLIP_LENGTH), 0) ||
      MIN_CLIP_LENGTH

    const items: ClipWithLayout[] = clips.map((clip) => {
      const actualDuration = clip.duration || 0
      const safeDuration = clip.duration || MIN_CLIP_LENGTH
      const layoutStart = layoutCursor
      const start = actualCursor
      layoutCursor += safeDuration
      actualCursor += actualDuration

      return {
        ...clip,
        start,
        layoutStart,
        widthPercent: (safeDuration / layoutTotal) * 100,
        safeDuration,
      }
    })

    return {
      items,
      totalDuration: actualCursor,
      layoutTotal,
    }
  }, [clips])

  const activeClip = useMemo(() => {
    if (!clips.length) return null
    const fallback = clipLayouts.items[0] ?? null
    return clipLayouts.items.find((clip) => clip.id === activeClipId) ?? fallback
  }, [clipLayouts.items, clips.length, activeClipId])

  const activeDuration = activeClip?.duration ?? 0

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (!clips.length) {
      setActiveClipId(null)
      return
    }

    if (!activeClipId) {
      setActiveClipId(clips[0].id)
    }
  }, [clips, activeClipId])

  useEffect(() => {
    setTimelineProgress((prev) => (clips.length ? prev : 0))
    const video = videoRef.current
    if (video) {
      video.currentTime = 0
    }
  }, [activeClip?.id, clips.length])

  const loadFile = async (file?: File) => {
    if (!file) return

    const nextUrl = URL.createObjectURL(file)
    objectUrlsRef.current.add(nextUrl)
    const duration = await readVideoDuration(nextUrl)
    const newClip: TimelineClip = {
      id: generateId(),
      name: file.name,
      url: nextUrl,
      sizeLabel: formatFileSize(file.size),
      type: file.type || 'video',
      duration,
      track: clips.length % 2,
    }

    setClips((current) => [...current, newClip])
    setActiveClipId((current) => current ?? newClip.id)
    setTimelineProgress(0)
  }

  const loadFilesSequentially = async (files: File[]) => {
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await loadFile(file)
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    await loadFilesSequentially(files)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounter.current += 1
    setIsDragActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) {
      setIsDragActive(false)
    }
  }

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!isDragActive) {
      setIsDragActive(true)
    }
  }

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounter.current = 0
    setIsDragActive(false)
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (!files.length) return
    await loadFilesSequentially(files)
  }

  const seekTimelinePercent = (value: number) => {
    if (!clips.length || !clipLayouts.totalDuration) return
    const nextValue = Math.min(100, Math.max(0, value))
    const targetSeconds = (nextValue / 100) * clipLayouts.totalDuration

    const fallbackClip = clipLayouts.items[clipLayouts.items.length - 1]
    const targetClip =
      clipLayouts.items.find((clip) => {
        const clipEnd = clip.start + (clip.duration || MIN_CLIP_LENGTH)
        return targetSeconds <= clipEnd
      }) ?? fallbackClip

    if (!targetClip) return

    const clipDuration = targetClip.duration || MIN_CLIP_LENGTH
    const secondsIntoClip = Math.min(
      clipDuration,
      Math.max(0, targetSeconds - targetClip.start)
    )

    setTimelineProgress(nextValue)
    setActiveClipId(targetClip.id)
    pendingSeekRef.current = { clipId: targetClip.id, time: secondsIntoClip }

    if (targetClip.id === activeClip?.id) {
      const video = videoRef.current
      if (video) {
        video.currentTime = secondsIntoClip
        pendingSeekRef.current = null
      }
    }
  }

  const syncFromVideo = () => {
    const video = videoRef.current
    if (!video || !activeClip || !clipLayouts.totalDuration) return
    const clipDuration = activeClip.duration || MIN_CLIP_LENGTH
    const clipTime = Math.min(video.currentTime, clipDuration)
    const globalSeconds = activeClip.start + clipTime
    setTimelineProgress((globalSeconds / clipLayouts.totalDuration) * 100)
  }

  const placeClip = (
    clipId: string,
    track: number,
    targetId: string | null,
    position: 'before' | 'after' | 'end'
  ) => {
    setClips((current) => {
      if (!clipId) return current
      const sourceIndex = current.findIndex((clip) => clip.id === clipId)
      if (sourceIndex === -1) return current
      const moving = { ...current[sourceIndex], track }
      const without = current.filter((clip) => clip.id !== clipId)

      if (!targetId || position === 'end') {
        without.push(moving)
        return without
      }

      const targetIndex = without.findIndex((clip) => clip.id === targetId)
      if (targetIndex === -1) {
        without.push(moving)
        return without
      }

      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
      without.splice(insertIndex, 0, moving)
      return without
    })
  }

  const handleClipDragStart = (event: DragEvent<HTMLDivElement>, clipId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', clipId)
    setDraggingClipId(clipId)
  }

  const handleClipDragEnd = () => {
    setDraggingClipId(null)
    setDropState(null)
  }

  const handleClipDragOverClip = (
    event: DragEvent<HTMLDivElement>,
    trackIndex: number,
    targetClipId: string
  ) => {
    if (!draggingClipId || draggingClipId === targetClipId) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    const shouldDropBefore = event.clientX - bounds.left < bounds.width / 2
    setDropState({
      track: trackIndex,
      targetId: targetClipId,
      position: shouldDropBefore ? 'before' : 'after',
    })
  }

  const handleClipDropOnClip = (
    event: DragEvent<HTMLDivElement>,
    trackIndex: number,
    targetClipId: string
  ) => {
    if (!draggingClipId || draggingClipId === targetClipId) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    const shouldDropBefore = event.clientX - bounds.left < bounds.width / 2
    placeClip(draggingClipId, trackIndex, targetClipId, shouldDropBefore ? 'before' : 'after')
    setDraggingClipId(null)
    setDropState(null)
  }

  const handleRowDragOver = (event: DragEvent<HTMLDivElement>, trackIndex: number) => {
    if (!draggingClipId) return
    event.preventDefault()
    setDropState({ track: trackIndex, targetId: null, position: 'end' })
  }

  const handleRowDrop = (event: DragEvent<HTMLDivElement>, trackIndex: number) => {
    if (!draggingClipId) return
    event.preventDefault()
    placeClip(draggingClipId, trackIndex, null, 'end')
    setDraggingClipId(null)
    setDropState(null)
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video || !activeClip) return
    if (pendingSeekRef.current && pendingSeekRef.current.clipId === activeClip.id) {
      const target = Math.min(
        pendingSeekRef.current.time,
        video.duration || pendingSeekRef.current.time
      )
      video.currentTime = target
      pendingSeekRef.current = null
    }
    syncFromVideo()
  }

  const handleVideoEnded = () => {
    if (!activeClip) return
    const currentIndex = clipLayouts.items.findIndex((clip) => clip.id === activeClip.id)
    if (currentIndex === -1) return
    const nextClip = clipLayouts.items[currentIndex + 1]
    if (nextClip) {
      setActiveClipId(nextClip.id)
      pendingSeekRef.current = { clipId: nextClip.id, time: 0 }
      if (clipLayouts.totalDuration) {
        setTimelineProgress((nextClip.start / clipLayouts.totalDuration) * 100)
      }
    } else {
      setTimelineProgress(100)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">jb video lab</p>
          <h1>Personal video editor</h1>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => fileInputRef.current?.click()}
        >
          Import clip
        </button>
      </header>

      <main className="editor-grid">
        <aside className="panel media-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Library</p>
              <h2>Project bin</h2>
            </div>
            <span className="badge">local only</span>
          </div>

          <label
            className={`upload-tile${isDragActive ? ' drag-active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={handleFileChange}
            />
            <strong>Drop video or browse</strong>
            <span>MP4, MOV, and WebM files stay on your device.</span>
          </label>

          {clips.length ? (
            <ul className="media-list">
              {clips.map((clip, index) => (
                <li key={clip.id} className={clip.id === activeClip?.id ? 'active' : ''}>
                  <button type="button" onClick={() => setActiveClipId(clip.id)}>
                    <div className="media-line">
                      <p>{clip.name}</p>
                      <span className="order-indicator">#{index + 1}</span>
                    </div>
                    <div className="media-meta">
                      <span>{formatDuration(clip.duration)}</span>
                      <span className="format">{clip.type || 'video'}</span>
                      <span className="track-indicator">Track {clip.track + 1}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state compact">
              <p>No clips imported yet.</p>
            </div>
          )}
        </aside>

        <section className="panel preview-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{activeClip?.name ?? 'No clip loaded'}</h2>
            </div>
            {activeClip && <span className="badge">{activeClip.sizeLabel}</span>}
          </div>

          <div className="preview-frame">
            {activeClip ? (
              <video
                ref={videoRef}
                key={activeClip.id}
                src={activeClip.url}
                controls
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={syncFromVideo}
                onEnded={handleVideoEnded}
              />
            ) : (
              <div className="empty-state">
                <p>Drag a clip into the library to start editing.</p>
                <span>Your footage never leaves the browser.</span>
              </div>
            )}
          </div>

          <div className="scrub-controls">
            <label htmlFor="scrub-slider">Timeline scrub</label>
            <input
              id="scrub-slider"
              type="range"
              min="0"
              max="100"
              value={timelineProgress}
              onChange={(event) => seekTimelinePercent(Number(event.target.value))}
              disabled={!clips.length}
            />
            <div className="scrub-meta">
              <span>
                {clipLayouts.totalDuration
                  ? formatDuration((timelineProgress / 100) * clipLayouts.totalDuration)
                  : '0:00'}
              </span>
              <span>{formatDuration(clipLayouts.totalDuration)}</span>
            </div>
          </div>
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Inspector</p>
              <h2>Clip details</h2>
            </div>
          </div>

          {activeClip ? (
            <dl className="meta-grid">
              <div>
                <dt>Name</dt>
                <dd>{activeClip.name}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{activeClip.type || 'video'}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(activeDuration)}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{activeClip.sizeLabel}</dd>
              </div>
              <div>
                <dt>Track</dt>
                <dd>Track {activeClip.track + 1}</dd>
              </div>
            </dl>
          ) : (
            <div className="empty-state compact">
              <p>Select a clip to see metadata.</p>
            </div>
          )}
        </aside>

        <section className="panel timeline-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Timeline</p>
              <h2>Tracks</h2>
            </div>
          </div>

          <div className={`timeline-track${clips.length ? '' : ' disabled'}`}>
            {clips.length ? (
              <>
                <div className="timeline-playhead" style={{ left: `${timelineProgress}%` }} />
                <div className="timeline-rows">
                  {[0, 1].map((trackIndex) => (
                    <div key={trackIndex} className="timeline-row">
                      <span className="track-label">Track {trackIndex + 1}</span>
                      <div
                        className={`timeline-row-content${
                          dropState?.track === trackIndex && dropState.targetId === null
                            ? ' drop-at-end'
                            : ''
                        }`}
                        onDragOver={(event) => handleRowDragOver(event, trackIndex)}
                        onDrop={(event) => handleRowDrop(event, trackIndex)}
                      >
                        {clipLayouts.items.filter((clip) => clip.track === trackIndex).length ? (
                          clipLayouts.items
                            .filter((clip) => clip.track === trackIndex)
                            .map((clip) => (
                              <div
                                key={clip.id}
                                className={`timeline-clip${
                                  clip.id === activeClip?.id ? ' active' : ''
                                }${
                                  draggingClipId === clip.id ? ' dragging' : ''
                                }${
                                  dropState &&
                                  dropState.targetId === clip.id &&
                                  dropState.track === trackIndex
                                    ? dropState.position === 'before'
                                      ? ' drop-before'
                                      : ' drop-after'
                                    : ''
                                }`}
                                style={{ flexBasis: `${clip.widthPercent}%` }}
                                onClick={() => setActiveClipId(clip.id)}
                                draggable
                                onDragStart={(event) => handleClipDragStart(event, clip.id)}
                                onDragEnd={handleClipDragEnd}
                                onDragOver={(event) => handleClipDragOverClip(event, trackIndex, clip.id)}
                                onDrop={(event) => handleClipDropOnClip(event, trackIndex, clip.id)}
                              >
                                <div className="clip-title">{clip.name}</div>
                              </div>
                            ))
                        ) : (
                          <div className="timeline-row-empty">Drop clips here</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="timeline-empty">
                <p>Timeline waiting for media</p>
                <span>Import clips, then arrange them across the tracks.</span>
              </div>
            )}
          </div>

          <div className="timeline-timecodes">
            <span>0:00</span>
            <span>{formatDuration(clipLayouts.totalDuration)}</span>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
