import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import './App.css'

type UploadedMedia = {
  name: string
  url: string
  sizeLabel: string
  type: string
}

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

function App() {
  const [media, setMedia] = useState<UploadedMedia | null>(null)
  const [scrubProgress, setScrubProgress] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [isDragActive, setIsDragActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  useEffect(() => {
    return () => {
      if (media) {
        URL.revokeObjectURL(media.url)
      }
    }
  }, [media])

  const loadFile = (file?: File) => {
    if (!file) return

    const nextUrl = URL.createObjectURL(file)
    setMedia((current) => {
      if (current) {
        URL.revokeObjectURL(current.url)
      }
      return {
        name: file.name,
        url: nextUrl,
        sizeLabel: formatFileSize(file.size),
        type: file.type || 'video',
      }
    })

    setVideoDuration(0)
    setScrubProgress(0)
    setIsDragActive(false)
    dragCounter.current = 0
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0])
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

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounter.current = 0
    setIsDragActive(false)
    const file = event.dataTransfer?.files?.[0]
    loadFile(file)
  }

  const handleScrub = (value: number) => {
    setScrubProgress(value)
    const video = videoRef.current
    if (!video || !video.duration) return
    video.currentTime = (value / 100) * video.duration
  }

  const syncFromVideo = () => {
    const video = videoRef.current
    if (!video || !video.duration) return
    setVideoDuration(video.duration)
    setScrubProgress((video.currentTime / video.duration) * 100)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">jb video lab</p>
          <h1>Personal video editor</h1>
          <p className="muted">
            Load a clip, scrub the timeline, and start planning the features you want to build next.
          </p>
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
              onChange={handleFileChange}
            />
            <strong>Drop video or browse</strong>
            <span>MP4, MOV, and WebM files stay on your device.</span>
          </label>

          {media ? (
            <ul className="media-list">
              <li>
                <p>{media.name}</p>
                <span>{formatDuration(videoDuration)}</span>
                <span className="format">{media.type || 'video'}</span>
              </li>
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
              <h2>{media?.name ?? 'No clip loaded'}</h2>
            </div>
            {media && <span className="badge">{media.sizeLabel}</span>}
          </div>

          <div className="preview-frame">
            {media ? (
              <video
                ref={videoRef}
                src={media.url}
                controls
                onLoadedMetadata={syncFromVideo}
                onTimeUpdate={syncFromVideo}
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
              value={scrubProgress}
              onChange={(event) => handleScrub(Number(event.target.value))}
              disabled={!media}
            />
            <div className="scrub-meta">
              <span>{formatDuration((scrubProgress / 100) * videoDuration)}</span>
              <span>{formatDuration(videoDuration)}</span>
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

          {media ? (
            <dl className="meta-grid">
              <div>
                <dt>Name</dt>
                <dd>{media.name}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{media.type || 'video'}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(videoDuration)}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{media.sizeLabel}</dd>
              </div>
            </dl>
          ) : (
            <div className="empty-state compact">
              <p>Select a clip to see metadata.</p>
            </div>
          )}
        </aside>

      </main>
    </div>
  )
}

export default App
