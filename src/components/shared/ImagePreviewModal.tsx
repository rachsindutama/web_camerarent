import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';

export interface PreviewImageItem {
  url: string;
  label: string;
}

interface ImagePreviewModalProps {
  images: PreviewImageItem[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function ImagePreviewModal({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
  title,
}: ImagePreviewModalProps) {
  const { tx } = useI18n();
  const resolvedTitle = title ?? tx('Document Preview', 'Pratinjau Dokumen');
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (open) {
      setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)));
      setZoom(1);
      setRotation(0);
    }
  }, [open, initialIndex, images.length]);

  useEffect(() => {
    if (!open || images.length <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setIndex((i) => (i - 1 + images.length) % images.length);
        setZoom(1);
        setRotation(0);
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => (i + 1) % images.length);
        setZoom(1);
        setRotation(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, images.length]);

  const current = images[index];

  const handlePrev = () => {
    setIndex((i) => (i - 1 + images.length) % images.length);
    setZoom(1);
    setRotation(0);
  };

  const handleNext = () => {
    setIndex((i) => (i + 1) % images.length);
    setZoom(1);
    setRotation(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-3 p-4">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-sm">{resolvedTitle}</DialogTitle>
              <DialogDescription className="font-mono text-[11px]">
                {current?.label ?? '—'}
                {images.length > 1 ? ` · ${index + 1} / ${images.length}` : ''}
              </DialogDescription>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                title={tx('Zoom Out', 'Perkecil')}
              >
                <ZoomOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <span className="w-11 text-center font-mono text-[11px] text-zinc-600">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                title={tx('Zoom In', 'Perbesar')}
              >
                <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title={tx('Rotate 90°', 'Putar 90°')}
              >
                <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                }}
                title={tx('Reset View', 'Reset Tampilan')}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="relative flex h-[62vh] items-center justify-center overflow-auto rounded-md border border-zinc-200 bg-zinc-950/95 p-4">
          {current ? (
            <img
              src={current.url}
              alt={current.label}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
              className="max-h-full max-w-full rounded object-contain transition-transform duration-150 select-none"
            />
          ) : null}

          {images.length > 1 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handlePrev}
                className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 bg-white/90 hover:bg-white"
                title={tx('Previous document', 'Dokumen sebelumnya')}
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleNext}
                className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 bg-white/90 hover:bg-white"
                title={tx('Next document', 'Dokumen berikutnya')}
              >
                <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </>
          ) : null}
        </div>

        {images.length > 1 ? (
          <div className="flex items-center gap-2 overflow-x-auto pt-1">
            {images.map((img, i) => (
              <button
                key={`${img.url}-${i}`}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setZoom(1);
                  setRotation(0);
                }}
                className={`overflow-hidden rounded border transition-all ${
                  i === index
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-zinc-200 opacity-65 hover:opacity-100'
                }`}
              >
                <img src={img.url} alt={img.label} className="h-12 w-16 object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

