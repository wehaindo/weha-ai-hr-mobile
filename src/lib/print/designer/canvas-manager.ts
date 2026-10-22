/* eslint-disable */
// Phase 26: Canvas Manager — Fabric.js Canvas with Text Editing, Guides, Shortcuts

import {
  Canvas,
  Rect,
  Text,
  IText,
  Line,
  Group,
  FabricObject,
  FabricText,
} from 'fabric';

export interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor?: string;
  gridSize?: number;
  snapToGrid?: boolean;
}

export interface CanvasElement {
  id: string;
  type: string;
  object: FabricObject;
}

export interface ElementData {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  variable?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: string;
  visible?: boolean;
  barcodeType?: string;
  condition?: string;
  /** Original canonical element (mm coordinates) — restored verbatim on save for exact round-trip */
  rawElement?: Record<string, any>;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

const CUSTOM_PROPS = ['id', 'elementType', 'variable', 'barcodeType', 'templateContent', 'qrLabel', 'isGuide', 'alignLeft', 'alignWidth', 'rawElement', 'condition'];

/** Pixels per millimeter used by the designer canvas */
export const PX_PER_MM = 3.78;

export class DesignerCanvasManager {
  private canvas: Canvas | null = null;
  private config: CanvasConfig;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastElementBottom = 0;
  private guideObjects: FabricObject[] = [];
  private historyVersion = 0;
  private disposed = false;

  private _onElementSelect: ((element: CanvasElement | null) => void) | null = null;
  private _onElementUpdate: ((element: CanvasElement) => void) | null = null;
  private _onElementMove: ((element: CanvasElement) => void) | null = null;
  private _onHistoryChange: ((state: HistoryState) => void) | null = null;
  private _onElementsChange: (() => void) | null = null;

  constructor(config: CanvasConfig) {
    this.config = {
      backgroundColor: '#ffffff',
      gridSize: 5,
      snapToGrid: true,
      ...config,
    };
  }

  // === Callback registration ===

  onElementSelect(callback: (element: CanvasElement | null) => void): void {
    this._onElementSelect = callback;
  }

  onElementUpdate(callback: (element: CanvasElement) => void): void {
    this._onElementUpdate = callback;
  }

  onElementMove(callback: (element: CanvasElement) => void): void {
    this._onElementMove = callback;
  }

  onHistoryChange(callback: (state: HistoryState) => void): void {
    this._onHistoryChange = callback;
  }

  onElementsChange(callback: () => void): void {
    this._onElementsChange = callback;
  }

  // === Init ===

  init(canvasElement: HTMLCanvasElement): Canvas {
    this.canvas = new Canvas(canvasElement, {
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor,
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    this.setupEventListeners();
    this.saveState();
    return this.canvas;
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;

    this.canvas.on('selection:created', (e) => this.handleSelection(e.selected?.[0]));
    this.canvas.on('selection:updated', (e) => this.handleSelection(e.selected?.[0]));
    this.canvas.on('selection:cleared', () => this._onElementSelect?.(null));

    // Live position sync while moving/scaling/rotating
    this.canvas.on('object:moving', (e) => this.handleElementMove(e.target));
    this.canvas.on('object:scaling', (e) => this.handleElementMove(e.target));
    this.canvas.on('object:rotating', (e) => this.handleElementMove(e.target));

    // Smart alignment guides during move
    this.canvas.on('object:moving', (e) => this.drawAlignmentGuides(e.target));

    this.canvas.on('object:modified', (e) => {
      this.clearGuides();
      // Position is read from the live Fabric object in getElementData();
      // no need to mutate rawElement here (that caused x/y drift on save).
      this.saveState();
      this.handleElementMove(e.target);
    });

    this.canvas.on('mouse:down', () => this.clearGuides());

    // Double-click to edit text
    this.canvas.on('mouse:dblclick', (e) => {
      const target = e.target;
      if (target && target instanceof IText) {
        this.enterTextEditing(target);
      }
    });
  }

  private handleSelection(obj?: FabricObject): void {
    if (!obj) {
      this._onElementSelect?.(null);
      return;
    }
    this._onElementSelect?.({
      id: (obj as any).id || '',
      type: (obj as any).elementType || 'unknown',
      object: obj,
    });
  }

  private handleElementMove(obj?: FabricObject): void {
    if (!obj || !obj.selectable) return;
    this._onElementMove?.({
      id: (obj as any).id || '',
      type: (obj as any).elementType || 'unknown',
      object: obj,
    });
  }

  // === Text editing ===

  enterTextEditing(textObj: FabricText): void {
    if (!this.canvas || !(textObj instanceof IText)) return;

    this.canvas.setActiveObject(textObj);
    this.canvas.renderAll();

    textObj.enterEditing();
    textObj.selectAll();
    this.canvas.renderAll();
    textObj.hiddenTextarea?.focus();

    // Persist on text change + edit exit
    const handleChanged = () => {
      const variable = (textObj as any).variable || '';
      if (!variable) {
        (textObj as any).templateContent = textObj.text || '';
      }
      this._onElementUpdate?.({
        id: (textObj as any).id || '',
        type: 'text',
        object: textObj,
      });
      this._onElementsChange?.();
    };

    const handleExit = () => {
      handleChanged();
      this.saveState();
      textObj.off('changed', handleChanged);
      textObj.off('editing:exited', handleExit);
    };

    textObj.on('changed', handleChanged);
    textObj.on('editing:exited', handleExit);
  }

  // === Smart alignment guides ===

  private drawAlignmentGuides(target?: FabricObject): void {
    if (!this.canvas || !target || target instanceof Group) return;
    this.clearGuides();

    const threshold = 4;
    const others = this.canvas.getObjects().filter((o: any) => !o.isGuide && o !== target && o.selectable);
    if (others.length === 0) return;

    const t = target.getBoundingRect();
    const targets = {
      left: t.left,
      centerX: t.left + t.width / 2,
      right: t.left + t.width,
      top: t.top,
      centerY: t.top + t.height / 2,
      bottom: t.top + t.height,
    };

    let snapX: number | null = null;
    let snapY: number | null = null;

    for (const other of others) {
      const o = other.getBoundingRect();
      const check = (a: number, b: number, isVertical: boolean) => {
        if (Math.abs(a - b) <= threshold) {
          if (isVertical) snapX = b;
          else snapY = b;
        }
      };

      check(targets.left, o.left, true);
      check(targets.centerX, o.left + o.width / 2, true);
      check(targets.right, o.left + o.width, true);
      check(targets.top, o.top, false);
      check(targets.centerY, o.top + o.height / 2, false);
      check(targets.bottom, o.top + o.height, false);
    }

    const { left, top, width, height } = this.canvas.getObjects()[0]?.getBoundingRect?.() || {
      left: 0, top: 0, width: this.config.width, height: this.config.height,
    };

    if (snapX !== null) {
      target.set({ left: snapX });
      const guide = new Line([snapX, top, snapX, top + height], {
        stroke: '#ef4444',
        strokeWidth: 1,
        strokeDashArray: [4, 2],
        selectable: false,
        evented: false,
        hasControls: false,
        excludeFromExport: true,
      } as any);
      (guide as any).isGuide = true;
      this.canvas.add(guide);
      this.guideObjects.push(guide);
    }

    if (snapY !== null) {
      target.set({ top: snapY });
      const guide = new Line([left, snapY, left + width, snapY], {
        stroke: '#ef4444',
        strokeWidth: 1,
        strokeDashArray: [4, 2],
        selectable: false,
        evented: false,
        hasControls: false,
        excludeFromExport: true,
      } as any);
      (guide as any).isGuide = true;
      this.canvas.add(guide);
      this.guideObjects.push(guide);
    }
  }

  private clearGuides(): void {
    for (const g of this.guideObjects) {
      this.canvas?.remove(g);
    }
    this.guideObjects = [];
  }

  // === Resize ===

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.config.width = width;
    this.config.height = height;
    this.canvas.setDimensions({ width, height });
    this.canvas.renderAll();
  }

  getCanvas(): Canvas | null {
    return this.canvas;
  }

  // === Element creation ===

  private autoPosition(top?: number, snap = true): number {
    if (top !== undefined) return snap ? this.snapToGrid(top) : top;
    return this.lastElementBottom + 10;
  }

  addRect(options: {
    left?: number;
    top?: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    id?: string;
  }): Rect {
    if (!this.canvas) throw new Error('Canvas not initialized');

    const top = this.autoPosition(options.top);
    const rect = new Rect({
      left: this.snapToGrid(options.left ?? 10),
      top,
      width: options.width,
      height: options.height,
      fill: options.fill || 'transparent',
      stroke: options.stroke || '#000000',
      strokeWidth: options.strokeWidth || 1,
      selectable: true,
      hasControls: true,
    });

    (rect as any).id = options.id || `rect_${Date.now()}`;
    (rect as any).elementType = 'divider';
    this.lastElementBottom = top + options.height;

    this.canvas.add(rect);
    this.canvas.setActiveObject(rect);
    this.canvas.renderAll();
    this.saveState();
    return rect;
  }

  addText(options: {
    left?: number;
    top?: number;
    text: string;
    fontSize?: number;
    fontWeight?: string;
    fontFamily?: string;
    fill?: string;
    textAlign?: string;
    width?: number;
    id?: string;
    snap?: boolean;
  }): IText {
    if (!this.canvas) throw new Error('Canvas not initialized');

    const doSnap = options.snap !== false;
    const top = this.autoPosition(options.top, doSnap);
    const left = doSnap ? this.snapToGrid(options.left ?? 10) : (options.left ?? 10);
    const text = new IText(options.text || 'Text', {
      left,
      top,
      fontSize: options.fontSize || 14,
      fontWeight: (options.fontWeight as any) || 'normal',
      fontFamily: options.fontFamily || 'monospace',
      fill: options.fill || '#000000',
      textAlign: (options.textAlign as any) || 'left',
      selectable: true,
      hasControls: true,
      editable: true,
      charSpacing: 0,
    });

    (text as any).id = options.id || `text_${Date.now()}`;
    (text as any).elementType = 'text';
    (text as any).variable = '';
    (text as any).templateContent = options.text || '';
    this.lastElementBottom = top + (options.fontSize || 14) + 6;

    this.canvas.add(text);
    this.canvas.renderAll();

    // Align within a width box so center/right actually center (WYSIWYG)
    if (options.width && (options.textAlign === 'center' || options.textAlign === 'right')) {
      this.alignTextWithinWidth(text, options.textAlign, options.left ?? 10, options.width, doSnap);
    }

    this.canvas.setActiveObject(text);
    this.canvas.renderAll();
    this.saveState();
    return text;
  }

  /**
   * Adjust an IText's left so its text is centered/right-aligned within a width box.
   * Matches how the ESC/POS renderer pads text.
   */
  private alignTextWithinWidth(text: IText, align: string, boxLeft: number, boxWidth: number, snap = true): void {
    if (!this.canvas) return;
    const anyText = text as any;
    const textWidth = anyText.width || 0; // measured text width in px
    let adjusted = boxLeft;
    if (align === 'center') {
      adjusted = boxLeft + Math.max(0, (boxWidth - textWidth) / 2);
    } else if (align === 'right') {
      adjusted = boxLeft + Math.max(0, boxWidth - textWidth);
    }
    // Keep the box metadata for later re-alignment
    anyText.alignLeft = boxLeft;
    anyText.alignWidth = boxWidth;
    text.set({ left: snap ? this.snapToGrid(adjusted) : adjusted });
    this.canvas.renderAll();
  }

  addLine(options: {
    left?: number;
    top?: number;
    width: number;
    stroke?: string;
    strokeWidth?: number;
    id?: string;
    snap?: boolean;
  }): Line {
    if (!this.canvas) throw new Error('Canvas not initialized');

    const doSnap = options.snap !== false;
    const top = this.autoPosition(options.top, doSnap);
    const left = doSnap ? this.snapToGrid(options.left ?? 10) : (options.left ?? 10);
    const line = new Line(
      [left, top, left + options.width, top],
      {
        stroke: options.stroke || '#000000',
        strokeWidth: options.strokeWidth || 1,
        selectable: true,
        hasControls: true,
      }
    );

    (line as any).id = options.id || `line_${Date.now()}`;
    (line as any).elementType = 'divider';
    this.lastElementBottom = top + 10;

    this.canvas.add(line);
    this.canvas.setActiveObject(line);
    this.canvas.renderAll();
    this.saveState();
    return line;
  }

  addBarcode(options: {
    left?: number;
    top?: number;
    width: number;
    height: number;
    id?: string;
    snap?: boolean;
  }): Group {
    if (!this.canvas) throw new Error('Canvas not initialized');

    const doSnap = options.snap !== false;
    const top = this.autoPosition(options.top, doSnap);
    const left = doSnap ? this.snapToGrid(options.left ?? 10) : (options.left ?? 10);
    const lines: Line[] = [];
    const barWidth = 2;
    const gap = 1;
    const totalBars = Math.floor(options.width / (barWidth + gap));

    for (let i = 0; i < totalBars; i++) {
      const x = left + i * (barWidth + gap);
      const barHeight = i % 3 === 0 ? options.height : options.height * 0.8;
      const line = new Line([x, top, x, top + barHeight], {
        stroke: '#000000',
        strokeWidth: barWidth,
        selectable: false,
      });
      lines.push(line);
    }

    const text = new Text('||||||||||||', {
      left,
      top: top + options.height + 4,
      fontSize: 8,
      fontFamily: 'monospace',
      fill: '#000000',
      selectable: false,
    });

    const group = new Group([...lines, text], {
      left,
      top,
      selectable: true,
      hasControls: true,
    });

    (group as any).id = options.id || `barcode_${Date.now()}`;
    (group as any).elementType = 'barcode';
    (group as any).barcodeType = 'code128';
    (group as any).variable = '';
    this.lastElementBottom = top + options.height + 14;

    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.renderAll();
    this.saveState();
    return group;
  }

  addQRCode(options: {
    left?: number;
    top?: number;
    size: number;
    id?: string;
    snap?: boolean;
  }): Rect {
    if (!this.canvas) throw new Error('Canvas not initialized');

    const doSnap = options.snap !== false;
    const top = this.autoPosition(options.top, doSnap);
    const rect = new Rect({
      left: doSnap ? this.snapToGrid(options.left ?? 10) : (options.left ?? 10),
      top,
      width: options.size,
      height: options.size,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 1,
      selectable: true,
      hasControls: true,
    });

    (rect as any).id = options.id || `qr_${Date.now()}`;
    (rect as any).elementType = 'qrcode';
    (rect as any).variable = '';
    (rect as any).qrLabel = 'QR';
    this.lastElementBottom = top + options.size;

    this.canvas.add(rect);
    this.canvas.setActiveObject(rect);
    this.canvas.renderAll();
    this.saveState();
    return rect;
  }

  // === Selection operations ===

  removeSelected(): void {
    if (!this.canvas) return;
    const active = this.canvas.getActiveObject();
    if (active) {
      this.canvas.remove(active);
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
      this.saveState();
    }
  }

  duplicateSelected(offset = 20): FabricObject | null {
    if (!this.canvas) return null;
    const active = this.canvas.getActiveObject();
    if (!active) return null;

    const clone = active.clone() as Promise<FabricObject>;
    clone.then((c: any) => {
      if (this.disposed || !this.canvas) return;
      const current = active.getBoundingRect();
      c.set({
        left: current.left + offset,
        top: current.top + offset,
        evented: true,
        selectable: true,
      });
      (c as any).id = `${(active as any).id}_copy_${Date.now()}`;
      this.canvas.add(c);
      this.canvas.setActiveObject(c);
      this.canvas.renderAll();
      this.saveState();
    });
    return active;
  }

  copySelected(): FabricObject | null {
    if (!this.canvas) return null;
    const active = this.canvas.getActiveObject();
    if (!active) return null;

    this.clipboard = active.clone() as Promise<FabricObject>;
    this.clipboard.then((c: any) => {
      if (this.disposed) return;
      c.set({ evented: true, selectable: true });
    });
    return active;
  }

  pasteAt(x?: number, y?: number): void {
    if (!this.canvas || !this.clipboard) return;

    this.clipboard.then((c: any) => {
      if (this.disposed || !this.canvas) return;
      const rect = c.getBoundingRect();
      c.set({
        left: x ?? rect.left + 20,
        top: y ?? rect.top + 20,
        evented: true,
        selectable: true,
      });
      (c as any).id = `${(c as any).id || 'obj'}_paste_${Date.now()}`;
      this.canvas.add(c);
      this.canvas.setActiveObject(c);
      this.canvas.renderAll();
      this.saveState();
    });
  }

  private clipboard: Promise<FabricObject> | null = null;

  nudgeSelected(dx: number, dy: number): void {
    if (!this.canvas) return;
    const active = this.canvas.getActiveObject();
    if (!active) return;
    active.set({ left: active.left + dx, top: active.top + dy });
    this.canvas.renderAll();
    this.handleElementMove(active);
  }

  bringToFront(): void {
    if (!this.canvas) return;
    const active = this.canvas.getActiveObject();
    if (!active) return;
    this.canvas.bringObjectToFront(active);
    this.canvas.renderAll();
    this.saveState();
  }

  sendToBack(): void {
    if (!this.canvas) return;
    const active = this.canvas.getActiveObject();
    if (!active) return;
    this.canvas.sendObjectToBack(active);
    this.canvas.renderAll();
    this.saveState();
  }

  // === Element access ===

  getElements(): FabricObject[] {
    if (!this.canvas || this.disposed) return [];
    return this.canvas.getObjects().filter((obj: any) => !obj.isGuide);
  }

  getElementById(id: string): FabricObject | undefined {
    if (!this.canvas || this.disposed) return undefined;
    return this.canvas.getObjects().find((o: any) => o.id === id);
  }

  /**
   * Compute an element's bounding box in canvas px.
   * For center/right-aligned text, returns the alignment box (not the shifted text position)
   * so that x round-trips exactly through save/load.
   */
  private getElementBox(obj: FabricObject): { left: number; top: number; width: number; height: number } {
    const anyObj = obj as any;
    const align = anyObj.textAlign;
    const alignWidth = anyObj.alignWidth;
    const textWidth = anyObj.width;
    if (
      (align === 'center' || align === 'right') &&
      typeof alignWidth === 'number' &&
      typeof textWidth === 'number'
    ) {
      const offset = align === 'center' ? (alignWidth - textWidth) / 2 : (alignWidth - textWidth);
      return {
        left: (obj.left || 0) - offset,
        top: obj.top || 0,
        width: alignWidth,
        height: anyObj.height || 0,
      };
    }
    const rect = obj.getBoundingRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  getElementData(id: string): ElementData | null {
    const obj = this.getElementById(id);
    if (!obj) return null;
    const anyObj = obj as any;
    const raw = anyObj.rawElement && typeof anyObj.rawElement === 'object' ? anyObj.rawElement : {};
    const box = this.getElementBox(obj);

    // Preserve declared box width/height for semantic blocks (order_lines, totals, ...)
    // unless the object has been manually resized (scaleX/scaleY !== 1).
    const isScaled =
      Math.abs((obj.scaleX ?? 1) - 1) > 0.001 || Math.abs((obj.scaleY ?? 1) - 1) > 0.001;
    const width =
      !isScaled && typeof raw.width === 'number' ? raw.width * PX_PER_MM : box.width;
    const height =
      !isScaled && typeof raw.height === 'number' ? raw.height * PX_PER_MM : box.height;

    return {
      ...raw,
      id: anyObj.id || id,
      type: raw.type || anyObj.elementType || obj.type || 'unknown',
      x: box.left,
      y: box.top,
      width,
      height,
      content: anyObj.templateContent ?? raw.content,
      variable: anyObj.variable ?? raw.variable,
      fontSize: anyObj.fontSize ?? raw.fontSize,
      fontWeight: anyObj.fontWeight ?? raw.fontWeight,
      textAlign: anyObj.textAlign ?? raw.textAlign,
      barcodeType: anyObj.barcodeType ?? raw.barcodeType,
      condition: anyObj.condition ?? raw.condition,
      visible: obj.visible !== false,
    } as ElementData;
  }

  attachRawElement(id: string, raw: Record<string, any>): void {
    const obj = this.getElementById(id);
    if (!obj) return;
    (obj as any).rawElement = raw;
    this.canvas?.renderAll();
  }

  getAllElementsData(): ElementData[] {
    return this.getElements()
      .map((o) => this.getElementData((o as any).id))
      .filter((d): d is ElementData => d !== null);
  }

  // === Clear ===

  clear(): void {
    if (!this.canvas) return;
    const objects = this.canvas.getObjects().filter((obj: any) => !obj.isGuide);
    objects.forEach((obj) => this.canvas?.remove(obj));
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
    this.saveState();
  }

  // === Undo / Redo ===

  saveState(): void {
    if (!this.canvas || this.disposed) return;
    const json = JSON.stringify((this.canvas as any).toJSON(CUSTOM_PROPS));
    this.undoStack.push(json);
    this.redoStack = [];
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.emitHistoryChange();
    this._onElementsChange?.();
  }

  undo(): void {
    if (!this.canvas || this.undoStack.length <= 1) return;
    const current = this.undoStack.pop();
    if (current) this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    if (prev) {
      (this.canvas as any).loadFromJSON(prev).then(() => {
        if (this.disposed || !this.canvas) return;
        this.canvas.renderAll();
        this.emitHistoryChange();
      });
    }
  }

  redo(): void {
    if (!this.canvas || this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    if (next) {
      this.undoStack.push(next);
      (this.canvas as any).loadFromJSON(next).then(() => {
        if (this.disposed || !this.canvas) return;
        this.canvas.renderAll();
        this.emitHistoryChange();
      });
    }
  }

  private emitHistoryChange(): void {
    this.historyVersion++;
    this._onHistoryChange?.({
      canUndo: this.undoStack.length > 1,
      canRedo: this.redoStack.length > 0,
    });
  }

  // === Serialization ===

  toJSON(): string {
    if (!this.canvas || this.disposed) return '{}';
    const objects = this.canvas.getObjects();
    const guides = objects.filter((obj: any) => obj.isGuide);
    guides.forEach((g) => this.canvas?.remove(g));

    const json = JSON.stringify((this.canvas as any).toJSON(CUSTOM_PROPS));

    if (this.disposed || !this.canvas) return json;
    for (const g of guides) {
      this.canvas?.add(g);
    }
    this.canvas?.renderAll();
    return json;
  }

  fromJSON(json: string): void {
    if (!this.canvas || this.disposed) return;
    this.clearUndoStack();
    (this.canvas as any).loadFromJSON(json).then(() => {
      if (this.disposed || !this.canvas) return;
      this.canvas.renderAll();
      this.saveState();
      this._onElementsChange?.();
    });
  }

  clearUndoStack(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emitHistoryChange();
  }

  getHistoryState(): HistoryState {
    return { canUndo: this.undoStack.length > 1, canRedo: this.redoStack.length > 0 };
  }

  // === Helpers ===

  private snapToGrid(value: number): number {
    if (!this.config.snapToGrid) return value;
    const gridSize = this.config.gridSize || 5;
    return Math.round(value / gridSize) * gridSize;
  }

  getElementCount(): number {
    return this.getElements().length;
  }

  /**
   * Update element property programmatically
   */
  updateElement(id: string, properties: Record<string, any>): void {
    if (!this.canvas) return;
    const objects = this.canvas.getObjects();
    const obj = objects.find((o: any) => o.id === id);
    if (!obj) return;

    const anyObj = obj as any;
    const needsRealign =
      'textAlign' in properties ||
      'width' in properties ||
      'content' in properties ||
      'variable' in properties;

    for (const [key, value] of Object.entries(properties)) {
      if (key === 'variable') {
        anyObj.variable = value;
        if (value) {
          const parts = String(value).split('.');
          const label = parts[parts.length - 1];
          obj.set('text', `{{${label}}}`);
        } else {
          obj.set('text', anyObj.templateContent || 'Text');
        }
      } else if (key === 'content' || key === 'templateContent') {
        anyObj.templateContent = value;
        if (!anyObj.variable) {
          obj.set('text', value);
        }
      } else if (key === 'width') {
        const current = obj.getBoundingRect().width || 1;
        obj.set({ scaleX: (value as number) / current });
      } else if (key === 'height') {
        const current = obj.getBoundingRect().height || 1;
        obj.set({ scaleY: (value as number) / current });
      } else {
        obj.set(key, value);
      }
    }

    // Re-align centered/right text within its stored width box
    if (needsRealign) {
      this.alignText(id);
    }

    this.canvas.renderAll();
  }

  /**
   * Public: re-align a text element within its width box (used by the template loader).
   * Reads the element's stored alignWidth/alignLeft metadata if present.
   */
  alignText(id: string): void {
    if (!this.canvas || this.disposed) return;
    const obj = this.getElementById(id);
    if (!obj) return;
    const anyObj = obj as any;
    const align = anyObj.textAlign;
    const boxLeft = anyObj.alignLeft;
    const boxWidth = anyObj.alignWidth;
    if ((align === 'center' || align === 'right') && typeof boxLeft === 'number' && typeof boxWidth === 'number' && (obj as any).width) {
      this.alignTextWithinWidth(obj as IText, align, boxLeft, boxWidth);
    }
  }

  dispose(): void {
    this.disposed = true;
    this._onElementSelect = null;
    this._onElementUpdate = null;
    this._onElementMove = null;
    this._onHistoryChange = null;
    this._onElementsChange = null;
    if (this.canvas) {
      try {
        this.canvas.dispose();
      } catch (e) {
        console.warn('[DesignerCanvasManager] dispose error:', e);
      }
      this.canvas = null;
    }
    this.undoStack = [];
    this.redoStack = [];
    this.guideObjects = [];
  }
}
