import { useEffect, useRef, useState } from "react";

export default function WallpaperStage({
  enabled,
  wallpaper,
  reduceMotion = false,
  pauseWhenUnfocused = true,
  playbackRate = 100,
  onError,
  onMetadata,
}) {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const metadataKeyRef = useRef("");
  const [imageSize, setImageSize] = useState(() => ({
    width: Number(wallpaper?.width) || 0,
    height: Number(wallpaper?.height) || 0,
  }));
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const url = wallpaper?.url || wallpaper?.dataUrl || "";
  const previewUrl = wallpaper?.previewUrl || url;
  const visible = Boolean(enabled && url);
  const isVideo = wallpaper?.mediaType === "video";
  const imageAspect = imageSize.width > 0 && imageSize.height > 0
    ? imageSize.width / imageSize.height
    : 0;
  const stageAspect = stageSize.width > 0 && stageSize.height > 0
    ? stageSize.width / stageSize.height
    : 0;
  const smartCropLoss = imageAspect && stageAspect
    ? 1 - Math.min(imageAspect, stageAspect) / Math.max(imageAspect, stageAspect)
    : 1;
  const smartCover = smartCropLoss <= 0.12;

  useEffect(() => {
    setImageSize({
      width: Number(wallpaper?.width) || 0,
      height: Number(wallpaper?.height) || 0,
    });
  }, [url, wallpaper?.height, wallpaper?.width]);

  useEffect(() => {
    const target = imageRef.current || videoRef.current;
    if (!target) return undefined;
    const updateSize = () => {
      const bounds = target.getBoundingClientRect();
      setStageSize({ width: bounds.width, height: bounds.height });
    };
    updateSize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateSize) : null;
    observer?.observe(target);
    window.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [isVideo, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return undefined;
    video.playbackRate = Math.max(0.5, Math.min(1.5, Number(playbackRate || 100) / 100));

    const syncPlayback = () => {
      const shouldPause =
        reduceMotion ||
        !visible ||
        (pauseWhenUnfocused && (document.hidden || !document.hasFocus()));
      if (shouldPause) {
        video.pause();
      } else {
        void video.play().catch(() => undefined);
      }
    };
    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    window.addEventListener("focus", syncPlayback);
    window.addEventListener("blur", syncPlayback);
    return () => {
      document.removeEventListener("visibilitychange", syncPlayback);
      window.removeEventListener("focus", syncPlayback);
      window.removeEventListener("blur", syncPlayback);
    };
  }, [isVideo, pauseWhenUnfocused, playbackRate, reduceMotion, url, visible]);

  function reportVideoMetadata(event) {
    const video = event.currentTarget;
    const key = `${url}:${video.videoWidth}x${video.videoHeight}:${video.duration}`;
    if (metadataKeyRef.current === key) return;
    metadataKeyRef.current = key;
    onMetadata?.({
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });
  }

  function reportImageMetadata(event) {
    const image = event.currentTarget;
    const next = { width: image.naturalWidth, height: image.naturalHeight };
    setImageSize(next);
    const key = `${url}:${next.width}x${next.height}`;
    if (metadataKeyRef.current === key) return;
    metadataKeyRef.current = key;
    onMetadata?.(next);
  }

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        className={`app-wallpaper app-wallpaper--video ${visible ? "is-visible" : ""}`}
        src={url || undefined}
        poster={wallpaper?.previewUrl || undefined}
        preload="metadata"
        loop
        muted
        playsInline
        aria-hidden="true"
        onLoadedMetadata={reportVideoMetadata}
      />
    );
  }

  return (
    <>
      <img
        className={`app-wallpaper app-wallpaper--backdrop ${visible ? "is-visible" : ""}`}
        src={previewUrl || undefined}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        onError={onError}
      />
      <img
        ref={imageRef}
        className={`app-wallpaper app-wallpaper--image ${visible ? "is-visible" : ""}`}
        data-smart-fit={smartCover ? "cover" : "extend"}
        src={url || undefined}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
        draggable={false}
        onLoad={reportImageMetadata}
        onError={onError}
      />
    </>
  );
}
