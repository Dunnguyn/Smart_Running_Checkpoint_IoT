import { useEffect } from "react";
import { useMap } from "react-leaflet";
/** Re-measure Leaflet after sidebar/tab reflow without fitting or moving the view. */
export function MapResize() {
  const map = useMap();
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        map.invalidateSize({ pan: false, debounceMoveend: true }),
      );
    });
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map]);
  return null;
}
