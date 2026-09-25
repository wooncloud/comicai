'use client';
import { StateNode, type TLStateNodeConstructor } from 'tldraw';
import { boxToolStates } from './box-tool';

const STATES = boxToolStates({ shapeType: 'page-text', clickSize: { w: 200, h: 60 } });

export class PageTextTool extends StateNode {
  static override id = 'page-text';
  static override initial = 'idle';
  static override children(): TLStateNodeConstructor[] {
    return STATES;
  }
}
