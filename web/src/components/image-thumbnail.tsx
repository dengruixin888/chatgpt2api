"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type ImageThumbnailProps = {
  src: string;
  thumbnailSrc?: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
};

export function getImageThumbnailUrl(src: string) {
  const marker = "/images/";
  const index = src.indexOf(marker);
  if (index < 0) return src;
  return `${src.slice(0, index)}/image-thumbnails/${src.slice(index + marker.length)}`;
}

function getWindowOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function getManagedImageUrl(src: string) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;

  const origin = getWindowOrigin();
  if (!origin) return src;

  try {
    const url = new URL(src, origin);
    const marker = url.pathname.includes("/images/")
      ? "/images/"
      : url.pathname.includes("/image-thumbnails/")
        ? "/image-thumbnails/"
        : "";
    if (!marker) return src;
    const index = url.pathname.indexOf(marker);
    return `${origin}${url.pathname.slice(index)}${url.search}${url.hash}`;
  } catch {
    return src;
  }
}

export function ImageThumbnail({ src, thumbnailSrc, alt = "", className, imageClassName }: ImageThumbnailProps) {
  const initialSrc = useMemo(() => thumbnailSrc || getImageThumbnailUrl(src), [src, thumbnailSrc]);
  const [currentSrc, setCurrentSrc] = useState(initialSrc);

  useEffect(() => {
    setCurrentSrc(initialSrc);
  }, [initialSrc]);

  return (
    <span className={cn("block overflow-hidden bg-stone-100", className)}>
      <img
        src={currentSrc}
        alt={alt}
        className={cn("h-full w-full object-cover", imageClassName)}
        loading="lazy"
        decoding="async"
        onError={() => {
          const fallbackSrc = getManagedImageUrl(src);
          if (currentSrc !== fallbackSrc) {
            setCurrentSrc(fallbackSrc);
          }
        }}
      />
    </span>
  );
}
