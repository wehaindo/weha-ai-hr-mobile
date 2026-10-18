/* eslint-disable */
'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface RulerProps {
  /** Canvas width in pixels */
  canvasWidth: number;
  /** Canvas height in pixels */
  canvasHeight: number;
  /** Paper width in mm */
  paperWidthMm: number;
  /** Paper height in mm (null = auto) */
  paperHeightMm: number | null;
  /** Current zoom level */
  zoom: number;
  /** Orientation */
  orientation: 'horizontal' | 'vertical';
  className?: string;
}

// Convert pixels to mm
function pxToMm(px: number): number {
  return Math.round(px / 3.78);
}

/**
 * Horizontal Ruler (top) — shows X-axis measurements
 */
export function HorizontalRuler({
  canvasWidth,
  paperWidthMm,
  zoom,
  className,
}: Omit<RulerProps, 'orientation' | 'canvasHeight' | 'paperHeightMm'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const height = 20;
    const width = canvasWidth * zoom;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // Border bottom
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    // Draw ticks and numbers
    ctx.fillStyle = '#6c757d';
    ctx.strokeStyle = '#adb5bd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    const mmPerPx = 1 / (3.78 * zoom);
    const stepMm = 10; // Major tick every 10mm
    const subStepMm = 5; // Minor tick every 5mm

    for (let mm = 0; mm <= paperWidthMm; mm += subStepMm) {
      const x = Math.round((mm / paperWidthMm) * width);
      const isMajor = mm % stepMm === 0;

      ctx.beginPath();
      ctx.moveTo(x, height - 1);
      ctx.lineTo(x, isMajor ? height - 12 : height - 6);
      ctx.stroke();

      if (isMajor) {
        ctx.fillText(String(mm), x, 10);
      }
    }

    // Border right
    ctx.strokeStyle = '#dee2e6';
    ctx.beginPath();
    ctx.moveTo(width - 0.5, 0);
    ctx.lineTo(width - 0.5, height);
    ctx.stroke();
  }, [canvasWidth, paperWidthMm, zoom]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('block', className)}
      style={{ width: canvasWidth * zoom, height: 20 }}
    />
  );
}

/**
 * Vertical Ruler (left) — shows Y-axis measurements
 */
export function VerticalRuler({
  canvasHeight,
  paperHeightMm,
  zoom,
  className,
}: Omit<RulerProps, 'orientation' | 'canvasWidth' | 'paperWidthMm'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 20;
    const height = (paperHeightMm ? (paperHeightMm / 80) * canvasHeight : canvasHeight) * zoom;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // Border right
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width - 0.5, 0);
    ctx.lineTo(width - 0.5, height);
    ctx.stroke();

    // Draw ticks and numbers
    ctx.fillStyle = '#6c757d';
    ctx.strokeStyle = '#adb5bd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';

    const effectiveHeightMm = paperHeightMm || pxToMm(canvasHeight);
    const stepMm = 10;
    const subStepMm = 5;

    for (let mm = 0; mm <= effectiveHeightMm; mm += subStepMm) {
      const y = Math.round((mm / effectiveHeightMm) * height);
      const isMajor = mm % stepMm === 0;

      ctx.beginPath();
      ctx.moveTo(width - 1, y);
      ctx.lineTo(isMajor ? width - 12 : width - 6, y);
      ctx.stroke();

      if (isMajor && mm > 0) {
        ctx.save();
        ctx.translate(10, y + 3);
        ctx.fillText(String(mm), 0, 0);
        ctx.restore();
      }
    }

    // Border bottom
    ctx.strokeStyle = '#dee2e6';
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();
  }, [canvasHeight, paperHeightMm, zoom]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('block', className)}
      style={{ width: 20, height: (paperHeightMm ? (paperHeightMm / 80) * canvasHeight : canvasHeight) * zoom }}
    />
  );
}

/**
 * Corner square (intersection of rulers)
 */
export function RulerCorner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-5 h-5 bg-[#f8f9fa] border-r border-b border-[#dee2e6] flex items-center justify-center',
        className
      )}
    >
      <span className="text-[7px] text-[#adb5bd]">mm</span>
    </div>
  );
}
