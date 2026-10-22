/* eslint-disable */
'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Trash2,
  Copy,
  Clipboard,
  MoveUp,
  MoveDown,
  Maximize,
} from 'lucide-react';
import { DesignerCanvasManager, type HistoryState } from '@/lib/print/designer/canvas-manager';
import { HorizontalRuler, VerticalRuler, RulerCorner } from './designer-rulers';

interface DesignerCanvasProps {
  widthMm: number;
  heightMm: number | null;
  zoom?: number;
  onElementSelect?: (element: any | null) => void;
  onElementUpdate?: (element: any) => void;
  onElementMove?: (element: any) => void;
  onElementsChange?: () => void;
  onCanvasReady?: (manager: DesignerCanvasManager) => void;
  onHistoryChange?: (state: HistoryState) => void;
  className?: string;
}

function mmToPx(mm: number): number {
  return Math.round(mm * 3.78);
}

function pxToMm(px: number): number {
  return Math.round(px / 3.78);
}

/** Max chars per line for a paper width (mirrors escpos-builder) */
function getMaxChars(paperWidthMm: number): number {
  if (paperWidthMm >= 80) return 42;
  if (paperWidthMm >= 76) return 36;
  if (paperWidthMm >= 58) return 28;
  return 25;
}

export default function DesignerCanvas({
  widthMm,
  heightMm,
  zoom = 1,
  onElementSelect,
  onElementUpdate,
  onElementMove,
  onElementsChange,
  onCanvasReady,
  onHistoryChange,
  className,
}: DesignerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<DesignerCanvasManager | null>(null);
  const [manager, setManager] = useState<DesignerCanvasManager | null>(null);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedPos, setSelectedPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false });

  const canvasWidthPx = mmToPx(widthMm);
  const canvasHeightPx = heightMm ? mmToPx(heightMm) : mmToPx(200);
  const maxChars = getMaxChars(widthMm);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || manager) return;

    const mgr = new DesignerCanvasManager({
      width: canvasWidthPx,
      height: canvasHeightPx,
      backgroundColor: '#ffffff',
      gridSize: 5,
      snapToGrid: true,
    });

    mgr.init(canvasRef.current);

    mgr.onElementSelect((element) => {
      onElementSelect?.(element);
      if (element?.object) {
        const obj = element.object;
        setSelectedPos({
          x: Math.round(obj.left || 0),
          y: Math.round(obj.top || 0),
          w: Math.round(obj.width || 0),
          h: Math.round(obj.height || 0),
        });
      } else {
        setSelectedPos(null);
      }
    });

    mgr.onElementUpdate((element) => {
      onElementUpdate?.(element);
    });

    mgr.onElementMove((element) => {
      onElementMove?.(element);
    });

    mgr.onElementsChange(() => {
      onElementsChange?.();
    });

    mgr.onHistoryChange((state) => {
      setHistory(state);
      onHistoryChange?.(state);
    });

    managerRef.current = mgr;
    setManager(mgr);
    onCanvasReady?.(mgr);

    return () => {
      mgr.dispose();
      managerRef.current = null;
      setManager(null);
    };
  }, []);

  // Resize canvas when dimensions change
  useEffect(() => {
    if (manager) {
      manager.resize(canvasWidthPx, canvasHeightPx);
    }
  }, [canvasWidthPx, canvasHeightPx, manager]);

  // Zoom
  useEffect(() => {
    if (manager) {
      manager.getCanvas()?.setZoom(currentZoom);
      manager.getCanvas()?.renderAll();
    }
  }, [currentZoom, manager]);

  // Fit to width
  const handleFitWidth = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const avail = container.clientWidth - 24; // padding
    const zoom = Math.max(0.1, Math.min(3, avail / canvasWidthPx));
    setCurrentZoom(Math.round(zoom * 100) / 100);
  }, [canvasWidthPx]);

  const handleZoomIn = useCallback(() => setCurrentZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10)), []);
  const handleZoomOut = useCallback(() => setCurrentZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10)), []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mgr = managerRef.current;
      if (!mgr) return;

      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        mgr.undo();
      } else if (meta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        mgr.redo();
      } else if (meta && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        mgr.copySelected();
      } else if (meta && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        mgr.pasteAt();
      } else if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        mgr.duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        mgr.removeSelected();
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') mgr.nudgeSelected(-step, 0);
        else if (e.key === 'ArrowRight') mgr.nudgeSelected(step, 0);
        else if (e.key === 'ArrowUp') mgr.nudgeSelected(0, -step);
        else if (e.key === 'ArrowDown') mgr.nudgeSelected(0, step);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const scrollTop = containerRef.current?.scrollTop || 0;
    const rulerOffset = 20;
    const x = Math.round((e.clientX - rect.left + scrollLeft - rulerOffset) / currentZoom);
    const y = Math.round((e.clientY - rect.top + scrollTop - rulerOffset) / currentZoom);
    if (x >= 0 && x <= canvasWidthPx && y >= 0 && y <= canvasHeightPx) {
      setMousePos({ x, y });
    } else {
      setMousePos(null);
    }
  }, [currentZoom, canvasWidthPx, canvasHeightPx]);

  const handleMouseLeave = useCallback(() => setMousePos(null), []);

  // Handle drop from palette
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    const mgr = managerRef.current;
    if (!data || !mgr) return;

    try {
      const elementData = JSON.parse(data);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scrollLeft = containerRef.current?.scrollLeft || 0;
      const scrollTop = containerRef.current?.scrollTop || 0;
      const rulerOffset = 20;
      const x = (e.clientX - rect.left + scrollLeft - rulerOffset) / currentZoom;
      const y = (e.clientY - rect.top + scrollTop - rulerOffset) / currentZoom;

      switch (elementData.type) {
        case 'text':
          mgr.addText({ left: x, top: y, text: 'Text', fontSize: 14 });
          break;
        case 'divider':
          mgr.addLine({ left: 10, top: y, width: canvasWidthPx - 20 });
          break;
        case 'barcode':
          mgr.addBarcode({ left: x, top: y, width: 200, height: 60 });
          break;
        case 'qrcode':
          mgr.addQRCode({ left: x, top: y, size: 80 });
          break;
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  }, [currentZoom, canvasWidthPx]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Character grid: every N px (char width at zoom)
  const charWidthPx = Math.round(6 * currentZoom);
  const charCols = Math.floor((canvasWidthPx * currentZoom) / Math.max(1, charWidthPx));

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Canvas Toolbar */}
      <div className="flex items-center gap-0.5 mb-2 p-1 bg-muted rounded-lg shrink-0 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => manager?.undo()} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => manager?.redo()} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="size-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button variant="ghost" size="sm" onClick={() => manager?.copySelected()} title="Copy (Ctrl+C)">
          <Copy className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => manager?.pasteAt()} title="Paste (Ctrl+V)">
          <Clipboard className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => manager?.duplicateSelected()} title="Duplicate (Ctrl+D)">
          <Copy className="size-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button variant="ghost" size="sm" onClick={() => manager?.bringToFront()} title="Bring Forward">
          <MoveUp className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => manager?.sendToBack()} title="Send Backward">
          <MoveDown className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => manager?.removeSelected()} title="Delete (Del)">
          <Trash2 className="size-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button variant="ghost" size="sm" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground px-1 min-w-[44px] text-center">
          {Math.round(currentZoom * 100)}%
        </span>
        <Button variant="ghost" size="sm" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleFitWidth} title="Fit to Width">
          <Maximize className="size-4" />
        </Button>

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground hidden md:inline">
          Double-click text to edit · {maxChars} chars/line
        </span>
      </div>

      {/* Canvas Container with Rulers */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-100 rounded-lg border"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Ruler Corner + Top Ruler */}
        <div className="sticky top-0 z-10 flex">
          <RulerCorner />
          <HorizontalRuler canvasWidth={canvasWidthPx} paperWidthMm={widthMm} zoom={currentZoom} />
        </div>

        {/* Left Ruler + Canvas */}
        <div className="flex">
          <VerticalRuler canvasHeight={canvasHeightPx} paperHeightMm={heightMm} zoom={currentZoom} />

          {/* Canvas Area */}
          <div
            ref={wrapperRef}
            className="relative"
            style={{
              width: canvasWidthPx * currentZoom,
              height: canvasHeightPx * currentZoom,
            }}
          >
            {/* CSS grid background */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(228,231,235,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(228,231,235,0.6) 1px, transparent 1px)',
                backgroundSize: `${5 * currentZoom}px ${5 * currentZoom}px`,
              }}
            />
            <canvas
              ref={canvasRef}
              style={{ width: canvasWidthPx * currentZoom, height: canvasHeightPx * currentZoom }}
            />

            {/* Character grid overlay (WYSIWYG) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, rgba(59,130,246,0.10) 0px, rgba(59,130,246,0.10) ${charWidthPx - 1}px, transparent ${charWidthPx - 1}px, transparent ${charWidthPx}px)`,
              }}
            />

            {/* Crosshair Guide */}
            {mousePos && (
              <>
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: mousePos.x * currentZoom,
                    top: 0,
                    width: 1,
                    height: canvasHeightPx * currentZoom,
                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(59,130,246,0.5) 0px, rgba(59,130,246,0.5) 4px, transparent 4px, transparent 8px)',
                  }}
                />
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: 0,
                    top: mousePos.y * currentZoom,
                    width: canvasWidthPx * currentZoom,
                    height: 1,
                    backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.5) 0px, rgba(59,130,246,0.5) 4px, transparent 4px, transparent 8px)',
                  }}
                />
                <div
                  className="absolute pointer-events-none bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded z-20"
                  style={{ left: mousePos.x * currentZoom + 8, top: mousePos.y * currentZoom - 20 }}
                >
                  {mousePos.x}px, {mousePos.y}px ({pxToMm(mousePos.x)}mm, {pxToMm(mousePos.y)}mm)
                </div>
              </>
            )}

            {/* Selected Element Position Indicator */}
            {selectedPos && (
              <div
                className="absolute pointer-events-none border-2 border-blue-500 z-10"
                style={{
                  left: selectedPos.x * currentZoom,
                  top: selectedPos.y * currentZoom,
                  width: selectedPos.w * currentZoom,
                  height: selectedPos.h * currentZoom,
                }}
              >
                <div className="absolute -top-5 left-0 bg-blue-500 text-white text-[9px] px-1 rounded whitespace-nowrap">
                  X:{selectedPos.x} Y:{selectedPos.y} · {selectedPos.w}×{selectedPos.h}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Canvas Info Bar */}
      <div className="mt-2 text-xs text-muted-foreground text-center shrink-0 flex items-center justify-center gap-4">
        <span>{widthMm}mm × {heightMm || 'Auto'}mm · {canvasWidthPx} × {canvasHeightPx}px · {maxChars} chars</span>
        {mousePos && (
          <span className="text-blue-600 font-medium">
            X: {mousePos.x}px ({pxToMm(mousePos.x)}mm) · Y: {mousePos.y}px ({pxToMm(mousePos.y)}mm)
          </span>
        )}
        {selectedPos && !mousePos && (
          <span className="text-green-600">
            Selected: X:{selectedPos.x} Y:{selectedPos.y} · {selectedPos.w}×{selectedPos.h}px
          </span>
        )}
      </div>
    </div>
  );
}
