'use client';
import { BaseBoxShapeTool } from 'tldraw';

export class ComicPanelTool extends BaseBoxShapeTool {
  static override id = 'comic-panel';
  static override initial = 'idle';
  override shapeType = 'comic-panel';
}
