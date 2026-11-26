"use client";

import { useEffect, useRef, useState } from "react";
import { ShopOutlined } from "@ant-design/icons";

type StoreCoverImageProps = {
  src?: string | null;
  alt: string;
  placeholderClassName: string;
  placeholderLabel?: string;
};

/**
 * Renders a store cover image with automatic fallback to an icon placeholder
 * when the image URL is missing or fails to load in local/dev environments.
 */
export function StoreCoverImage({ src, alt, placeholderClassName, placeholderLabel }: StoreCoverImageProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setFailed(false);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  if (!src || failed) {
    return (
      <div className={placeholderClassName}>
        <ShopOutlined />
        {placeholderLabel ? <span>{placeholderLabel}</span> : null}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imgRef} src={src} alt={alt} onError={() => setFailed(true)} />
  );
}
